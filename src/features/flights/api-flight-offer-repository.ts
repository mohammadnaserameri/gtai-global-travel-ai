import type { FlightSearchIntent } from "./search-intent-types";
import type { FlightOffer } from "./flight-offer-types";
import {
  abortError,
  FlightOfferRepositoryError,
  isAbortError,
  type FlightOfferRepository,
  type FlightOfferSearchOptions,
  type FlightOfferSearchResult,
} from "./flight-offer-repository";
import { isCanonicalFlightOfferArrayForIntent } from "./flight-offer-intent-validation";
import { persistPreviewOfferSnapshots } from "./details/preview-offer-snapshot";
import {
  buildFlightSearchApiRequest,
  CLIENT_PROVIDER_STATUSES,
  containsForbiddenKey,
  FLIGHT_SEARCH_API_PATH,
  FLIGHT_SEARCH_API_VERSION,
  isClientErrorCode,
  MAX_PROVIDER_OFFER_COUNT,
  MAX_RESPONSE_OFFERS,
  RESPONSE_MODE,
  type ClientProviderSummary,
  type FlightSearchApiResponse,
} from "./flight-search-api-contract";

/**
 * The runtime repository: the browser's only route to offers.
 *
 * It knows nothing about providers. It cannot name one, cannot reach one, and
 * cannot import one — the whole provider runtime lives behind
 * `/api/flights/search` in `src/server`, and this module's import list is the
 * evidence. What it *does* know is that a response is untrusted until checked,
 * including one from GTAI's own origin: "same origin" is a statement about
 * where bytes came from, not about whether they are well-formed. So every
 * response is validated structurally before a single offer reaches the UI, and
 * there is no cast anywhere below.
 *
 * Deliberately absent behaviours: no automatic retry (Retry is a decision the
 * visitor makes, and a silent retry loop against a failing backend is how
 * outages get amplified), no credentials beyond the same-origin default, no
 * persistence of the Search Intent to `localStorage` or anywhere else, no
 * request-body logging, and no following of any URL a response might contain.
 */

export class ApiFlightOfferRepository implements FlightOfferRepository {
  async search(
    intent: FlightSearchIntent,
    options: FlightOfferSearchOptions = {},
  ): Promise<FlightOfferSearchResult> {
    const signal = options.signal;
    if (signal?.aborted) throw abortError();

    // The body is rebuilt from the normalized intent rather than copied from
    // the address bar, so nothing the current URL happens to carry — a stale
    // filter, a dev flag, a hand-added parameter — can ride along.
    const body = buildFlightSearchApiRequest(intent, {
      retryToken: options.retryToken ?? 0,
      scenario: options.scenario ?? "normal",
    });

    // One microtask before the request starts, then check the signal again.
    //
    // React's development Strict Mode mounts an effect, tears it down and
    // mounts it again. Without this yield the first mount has already called
    // `fetch` by the time its cleanup runs, so the server sees two searches
    // and the browser shows one aborted request — for a page the visitor
    // loaded once. Yielding lets that cleanup land first, so the abandoned
    // run never opens a connection at all. It is not environment-specific,
    // not a timer, and not deduplication: it simply refuses to start work the
    // caller has already cancelled.
    await Promise.resolve();
    if (signal?.aborted) throw abortError();

    let response: Response;
    try {
      response = await fetch(FLIGHT_SEARCH_API_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
        // Same-origin only, and no credentials beyond what the browser would
        // send to our own origin by default.
        credentials: "same-origin",
        cache: "no-store",
        // A redirect from our own search endpoint is not something to follow
        // — it would mean the request left the origin this repository is
        // allowed to talk to. Refuse rather than chase it.
        redirect: "error",
      });
    } catch (error: unknown) {
      // A caller-initiated abort must stay an abort all the way up: the
      // pages distinguish it from a failure and deliberately render nothing
      // for it. Anything else — including a refused redirect — is a transport
      // failure with no detail worth surfacing.
      if (isAbortError(error)) throw abortError();
      throw new FlightOfferRepositoryError();
    }

    // An abort can land between the headers arriving and the body being read.
    // Every check below re-tests the signal, because a visitor who navigated
    // away must never be shown the error state: cancellation is not failure,
    // and the pages deliberately render nothing for it.
    if (signal?.aborted) throw abortError();

    // The declared type is checked before parsing: an HTML error page from an
    // intermediary is not JSON, and trying to parse it would either throw or,
    // worse, succeed on something unintended.
    if (!isJsonResponse(response)) throw new FlightOfferRepositoryError();

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error: unknown) {
      // Body reading is abortable too. A rejection here that *is* an abort —
      // or a signal that flipped while parsing — stays an abort rather than
      // being mapped onto the customer-visible failure state.
      if (isAbortError(error) || signal?.aborted) throw abortError();
      throw new FlightOfferRepositoryError();
    }
    if (signal?.aborted) throw abortError();

    const validated = validateApiResponse(payload, intent);
    if (validated === null) throw new FlightOfferRepositoryError();

    // HTTP status and envelope status must agree. A 500 carrying a cheerful
    // success body, or a 200 carrying an error, means something between here
    // and the route rewrote the response — neither half can be trusted on its
    // own, so the pair is what gets validated.
    if (!statusAgreesWithEnvelope(response.status, validated.status)) {
      throw new FlightOfferRepositoryError();
    }

    if (validated.status === "error") {
      // Every failure code maps onto the one repository error the pages
      // already know how to render, with translated copy. The code is not
      // shown, formatted or interpolated anywhere in the interface.
      throw new FlightOfferRepositoryError();
    }

    // A last check before handing offers to the interface: work finished, but
    // if the caller left while it did, nothing should be rendered.
    if (signal?.aborted) throw abortError();

    // `partial` is a usable result set, but not a complete one — some sources
    // did not answer. Showing what came back is more honest than showing
    // nothing, and carrying the coverage forward is what stops the pages from
    // presenting it as the whole picture.
    persistPreviewOfferSnapshots(intent, validated.offers);
    return {
      offers: validated.offers,
      coverage: validated.status === "partial" ? "partial" : "complete",
    };
  }
}

/** Only the media type matters; `application/json; charset=utf-8` is still JSON. */
function isJsonResponse(response: Response): boolean {
  const header = response.headers.get("content-type");
  if (header === null) return false;
  return (header.split(";")[0]?.trim().toLowerCase() ?? "") === "application/json";
}

/**
 * The permitted (HTTP status, envelope status) pairs.
 *
 * A closed table rather than a range test: an unexpected status is rejected
 * because it was never part of this contract, not because it happens to fall
 * outside some bound.
 */
function statusAgreesWithEnvelope(
  httpStatus: number,
  envelopeStatus: FlightSearchApiResponse["status"],
): boolean {
  if (httpStatus === 200) {
    return (
      envelopeStatus === "success" ||
      envelopeStatus === "partial" ||
      envelopeStatus === "empty"
    );
  }
  if (httpStatus === 400 || httpStatus === 415 || httpStatus === 503) {
    return envelopeStatus === "error";
  }
  return false;
}

/**
 * Structural validation of the API envelope.
 *
 * Returns `null` rather than throwing so the caller owns the error mapping,
 * and narrows to the contract type by *checking* every field — never by
 * asserting it. A response that is the right shape but claims a different
 * version or a non-demonstration mode is rejected too: those are the two
 * fields that would silently change what the rest of the interface means.
 */
export function validateApiResponse(
  payload: unknown,
  intent: FlightSearchIntent,
): FlightSearchApiResponse | null {
  // Total by construction: this function answers "valid envelope or not", and
  // it must not have a third answer. If any check below throws unexpectedly —
  // the case that actually occurred was an offer whose epochs were far outside
  // the range `Intl.DateTimeFormat` can convert — the envelope is rejected,
  // which the caller already maps to the ordinary translated repository error.
  // A raw `RangeError` escaping to Results or Details would instead surface as
  // an unhandled failure the pages have no state for.
  //
  // The `catch` accepts nothing and inspects nothing. It cannot turn an
  // invalid response into a valid one; `null` is the strictest outcome this
  // function has.
  try {
    return validateEnvelope(payload, intent);
  } catch {
    return null;
  }
}

function validateEnvelope(
  payload: unknown,
  intent: FlightSearchIntent,
): FlightSearchApiResponse | null {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return null;
  }
  const record = payload as Record<string, unknown>;

  // The negative check runs first and covers *both* branches, error envelopes
  // included — an error reply is exactly where a diagnostic URL or correlation
  // id is most likely to be added "just for debugging".
  if (containsForbiddenKey(record)) return null;

  if (record.version !== FLIGHT_SEARCH_API_VERSION) return null;
  if (record.mode !== RESPONSE_MODE && record.mode !== "livePreview") return null;

  const status = record.status;
  if (typeof status !== "string") return null;

  if (status === "error") {
    // Exactly these four keys. An error envelope carries a code and nothing
    // else — no offers, no provider summary, no diagnostics, no raw text.
    if (!hasExactKeys(record, ERROR_ENVELOPE_KEYS)) return null;
    if (!isClientErrorCode(record.errorCode)) return null;
    return {
      version: FLIGHT_SEARCH_API_VERSION,
      status: "error",
      mode: RESPONSE_MODE,
      errorCode: record.errorCode,
    };
  }

  if (status !== "success" && status !== "partial" && status !== "empty") {
    return null;
  }

  if (!hasExactKeys(record, RESULT_ENVELOPE_KEYS)) return null;

  const offers = record.offers;
  if (!Array.isArray(offers) || offers.length > MAX_RESPONSE_OFFERS) return null;
  // Intent-aware and duplicate-free: every offer must answer *this* search
  // and be internally consistent, and no id may appear twice.
  if (!isCanonicalFlightOfferArrayForIntent(offers, intent)) return null;

  const summary = record.providerSummary;
  if (!Array.isArray(summary)) return null;
  if (!summary.every(isProviderSummary)) return null;

  const summaries = summary as readonly Record<string, unknown>[];
  const providerIds = new Set<string>();
  for (const entry of summaries) {
    const id = entry.providerId as string;
    if (providerIds.has(id)) return null;
    providerIds.add(id);
  }

  // Structural validity is not consistency. A response can be perfectly
  // well-formed and still contradict itself — "success" with nothing in it,
  // "empty" with twelve offers, "partial" where every provider succeeded, a
  // failed provider reporting offers it did not return. Each of those would
  // drive the interface into a state the data does not support, so the
  // envelope is checked as a whole rather than field by field.
  if (!envelopeIsSemanticallyConsistent(status, offers.length, summaries)) {
    return null;
  }

  return {
    version: FLIGHT_SEARCH_API_VERSION,
    status,
    mode: record.mode,
    offers: offers as readonly FlightOffer[],
    providerSummary: summary.map((entry) => {
      const item = entry as Record<string, unknown>;
      return {
        providerId: item.providerId as string,
        status: item.status as ClientProviderSummary["status"],
        offerCount: item.offerCount as number,
        durationBucket: item.durationBucket as "fast" | "moderate" | "slow",
      };
    }),
  };
}

const ERROR_ENVELOPE_KEYS: readonly string[] = [
  "version",
  "status",
  "mode",
  "errorCode",
];
const RESULT_ENVELOPE_KEYS: readonly string[] = [
  "version",
  "status",
  "mode",
  "offers",
  "providerSummary",
];
const PROVIDER_SUMMARY_KEYS: readonly string[] = [
  "providerId",
  "status",
  "offerCount",
  "durationBucket",
];

/**
 * Exactly these keys — no more, no fewer.
 *
 * Checking only the fields we expect would let an extra one through, and an
 * extra field on a response is precisely how a diagnostic URL, a correlation
 * id or a raw error message arrives. The denylist catches the ones we can
 * name; this catches the ones we cannot.
 */
function hasExactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  const keys = Object.keys(value);
  if (keys.length !== allowed.length) return false;
  return keys.every((key) => allowed.includes(key));
}

/**
 * Whether the status, the offer count and the per-provider summaries tell one
 * coherent story — including whether the offers could have come from the
 * providers the same envelope describes.
 *
 * The load-bearing rule is directional:
 *
 *   `offers.length <= sum(offerCount of succeeded summaries)`
 *
 * Equality is deliberately *not* required, and never will be. Aggregation
 * drops ids duplicated across providers and applies an overall ceiling, so a
 * final list smaller than the sum is the normal, correct case — requiring
 * equality would reject good responses. But the inequality only runs one way:
 * nothing downstream of the providers can *create* an offer, so a final list
 * larger than what the sources claim to have contributed describes something
 * that cannot have happened. Twelve offers beside a single succeeded provider
 * reporting one is the case this catches, and previously did not.
 */
function envelopeIsSemanticallyConsistent(
  status: "success" | "partial" | "empty",
  offerCount: number,
  summaries: readonly Record<string, unknown>[],
): boolean {
  if (summaries.length === 0) return false;

  const statuses = summaries.map((entry) => entry.status as string);
  const succeeded = statuses.filter((s) => s === "succeeded").length;
  const emptied = statuses.filter((s) => s === "empty").length;
  const missing = statuses.filter(
    (s) => s === "failed" || s === "cancelled",
  ).length;

  // Only a provider that succeeded can have contributed anything; per-summary
  // validation already rejects a non-succeeded provider reporting a count, so
  // this sum is the whole of what the sources claim to have supplied.
  const contribution = summaries.reduce((sum, entry) => {
    return entry.status === "succeeded" ? sum + (entry.offerCount as number) : sum;
  }, 0);

  if (status === "success") {
    // Complete coverage with something to show: no source missing, at least
    // one that contributed, and a list no larger than that contribution.
    return (
      offerCount > 0 &&
      contribution > 0 &&
      missing === 0 &&
      succeeded > 0 &&
      offerCount <= contribution
    );
  }

  if (status === "empty") {
    // Everyone answered, nobody had anything — so every summary is `empty`,
    // and there is nothing for anything to have been built from.
    return (
      offerCount === 0 &&
      contribution === 0 &&
      emptied === summaries.length &&
      summaries.length > 0
    );
  }

  // `partial` splits on whether anything survived, because the two cases have
  // genuinely different shapes rather than one being a weaker version of the
  // other.
  if (offerCount > 0) {
    // Reduced coverage, with results: something failed or was cancelled, and
    // something else succeeded and supplied at least what is being shown.
    return (
      contribution > 0 && missing > 0 && succeeded > 0 && offerCount <= contribution
    );
  }
  // Reduced coverage, nothing to show: the providers that did answer all came
  // back empty. A succeeded provider here would mean offers were contributed
  // and then vanished, which no step downstream is allowed to do.
  return contribution === 0 && missing > 0 && succeeded === 0 && emptied > 0;
}

function isProviderSummary(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (!hasExactKeys(record, PROVIDER_SUMMARY_KEYS)) return false;
  const providerId = record.providerId;
  if (typeof providerId !== "string") return false;
  // Non-empty, already trimmed, and bounded — an id is a short internal
  // label, not a place to smuggle a payload.
  if (providerId.length === 0 || providerId.length > 64) return false;
  if (providerId !== providerId.trim()) return false;
  if (
    typeof record.status !== "string" ||
    !(CLIENT_PROVIDER_STATUSES as readonly string[]).includes(record.status)
  ) {
    return false;
  }
  // Bounded by the **per-provider contribution** ceiling, not the final
  // response ceiling. A provider may legitimately have contributed more offers
  // than the aggregated list ends up carrying — deduplication and truncation
  // reduce it — and the summary reports that pre-aggregation contribution
  // truthfully rather than being capped to match the final array.
  const offerCount = record.offerCount;
  if (
    typeof offerCount !== "number" ||
    !Number.isSafeInteger(offerCount) ||
    offerCount < 0 ||
    offerCount > MAX_PROVIDER_OFFER_COUNT
  ) {
    return false;
  }
  // A provider's own status and its count must agree: only a provider that
  // succeeded can have returned anything.
  if (record.status === "succeeded" && offerCount === 0) return false;
  if (record.status !== "succeeded" && offerCount !== 0) return false;
  return (
    record.durationBucket === "fast" ||
    record.durationBucket === "moderate" ||
    record.durationBucket === "slow"
  );
}
