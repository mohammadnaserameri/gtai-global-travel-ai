import "../../../server-only";

import { isUsableProviderOrigin } from "./external-provider-activation";
import {
  totalTravelerCount,
  type ExternalNeutralSearch,
} from "./external-provider-search-shape";
import {
  revealSecret,
  type ResolvedProviderSecret,
} from "./external-provider-secrets";
import type {
  ExternalProviderSearchRequest,
  ExternalProviderSecretReference,
  ExternalFlightProviderDefinition,
} from "./external-provider-types";

/**
 * Outbound request construction.
 *
 * This module builds a **description** of a request. It does not send one, and
 * there is deliberately no `fetch`, no `http`, no socket and no transport
 * anywhere in this directory. That is what allows a complete request contract
 * to ship in a stage where no external call is permitted, and it is asserted
 * by `verify:provider-integration-readiness` rather than left as an intention.
 *
 * Two construction rules, both structural:
 *
 * 1. **The origin is never concatenated.** Every URL is assembled with the
 *    `URL` and `URLSearchParams` APIs against an operator-configured
 *    allowlisted origin. String building is how a path segment starting with
 *    `//` becomes a different host, and how an unencoded parameter becomes an
 *    extra one.
 * 2. **The final URL is re-validated against the allowlist after building.**
 *    Checking the origin before assembly proves nothing about the result — a
 *    path of `//evil.example` re-points a correctly-validated origin. The check
 *    that matters is the one on the finished URL.
 */

export class ExternalRequestConstructionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExternalRequestConstructionError";
  }
}

/** A resolved secret paired with the reference that describes where it goes. */
export interface SecretBinding {
  readonly reference: ExternalProviderSecretReference;
  readonly secret: ResolvedProviderSecret;
}

export interface BuildRequestInput {
  readonly definition: ExternalFlightProviderDefinition;
  /** Relative path. Must not start with `//` and must not be absolute. */
  readonly path: string;
  readonly method: "GET" | "POST";
  /** Non-secret query parameters. Values are encoded by `URLSearchParams`. */
  readonly query?: Readonly<Record<string, string>>;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string | null;
  readonly secrets?: readonly SecretBinding[];
}

/**
 * Rejects a path that could escape the allowlisted origin.
 *
 * `//host` is protocol-relative and re-points the URL entirely. An absolute
 * URL replaces the base outright. Backslashes are normalized to forward
 * slashes by some parsers, so `\\host` is the same attack wearing a different
 * hat. Each is refused rather than sanitized — a path that needs rewriting to
 * be safe is a path whose author was surprised.
 */
function assertSafeRelativePath(path: string): void {
  if (!path.startsWith("/")) {
    throw new ExternalRequestConstructionError(
      "A provider request path must be relative to the allowlisted origin.",
    );
  }
  if (path.startsWith("//") || path.startsWith("/\\")) {
    throw new ExternalRequestConstructionError(
      "A provider request path must not be protocol-relative.",
    );
  }
  if (path.includes("\\")) {
    throw new ExternalRequestConstructionError(
      "A provider request path must not contain a backslash.",
    );
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) {
    throw new ExternalRequestConstructionError(
      "A provider request path must not be an absolute URL.",
    );
  }
}

/**
 * Builds the described request.
 *
 * Secrets are placed according to their declared `placement` and are revealed
 * exactly here — the one call site of `revealSecret` in the codebase, which is
 * what makes "credentials are only materialized at request construction" a
 * checkable claim rather than a convention.
 *
 * A `queryParameter` placement is supported because some providers require it,
 * but it is the worst option available: query strings appear in access logs,
 * proxy logs and `Referer` headers. The redaction layer therefore treats every
 * non-allowlisted query *value* as unprintable, and a future integration should
 * prefer a header wherever the provider permits one.
 */
export function buildExternalRequest(
  input: BuildRequestInput,
): ExternalProviderSearchRequest {
  const { definition, path, method } = input;

  if (!isUsableProviderOrigin(definition.allowedOrigin)) {
    throw new ExternalRequestConstructionError(
      `Provider "${definition.providerId}" has an unusable allowlisted origin.`,
    );
  }
  assertSafeRelativePath(path);

  const url = new URL(path, definition.allowedOrigin);

  const query: Record<string, string> = { ...(input.query ?? {}) };
  const headers: Record<string, string> = { ...(input.headers ?? {}) };
  const secretReferences: ExternalProviderSecretReference[] = [];

  for (const binding of input.secrets ?? []) {
    const { reference, secret } = binding;
    secretReferences.push(reference);
    const value = revealSecret(secret);
    switch (reference.placement) {
      case "header":
        headers[reference.parameterName] = value;
        break;
      case "bearerToken":
        headers[reference.parameterName] = `Bearer ${value}`;
        break;
      case "queryParameter":
        query[reference.parameterName] = value;
        break;
    }
  }

  for (const [name, value] of Object.entries(query)) {
    url.searchParams.set(name, value);
  }

  // The check that actually matters: the *finished* URL must still sit on the
  // allowlisted origin. Validating only the base would pass a request that a
  // crafted path had already re-pointed elsewhere.
  if (url.origin !== new URL(definition.allowedOrigin).origin) {
    throw new ExternalRequestConstructionError(
      `Constructed request for "${definition.providerId}" left its allowlisted origin.`,
    );
  }
  if (url.username.length > 0 || url.password.length > 0) {
    throw new ExternalRequestConstructionError(
      "A constructed provider request must not carry embedded credentials.",
    );
  }

  return {
    method,
    url,
    headers: Object.freeze({ ...headers }),
    query: Object.freeze({ ...query }),
    body: input.body ?? null,
    secretReferences: Object.freeze([...secretReferences]),
    timeoutPolicy: definition.timeoutPolicy,
  };
}

/**
 * Checks a search against a provider's declared capabilities *before* building
 * anything.
 *
 * Asking a provider for something it has said it cannot do wastes a request,
 * consumes quota, and produces a failure that looks like an outage. The
 * refusal is a list of reasons rather than a boolean so an operator can see
 * every mismatch at once instead of fixing them one deploy at a time.
 */
export type CapabilityRejection =
  | "oneWayUnsupported"
  | "roundTripUnsupported"
  | "multiCityUnsupported"
  | "marketUnsupported"
  | "currencyUnsupported"
  | "localeUnsupported"
  | "cabinClassUnsupported"
  | "directOnlyUnsupported"
  | "childrenUnsupported"
  | "infantsUnsupported"
  | "tooManyLegs"
  | "tooManyTravellers";

/**
 * Checks a neutral search against a provider's declared capabilities.
 *
 * The trip shape is read from `ExternalNeutralSearch.tripShape`, a proper
 * discriminated union derived from `FlightSearchIntent.tripType`. An earlier
 * draft reached into `intent` through a structural cast; the cast was removed
 * because the field was already correctly typed and the cast was hiding
 * nothing except that fact. The `switch` below is exhaustive over the union,
 * so adding a fourth trip shape becomes a compile error here rather than a
 * silently unchecked search.
 */
export function checkCapabilitySupport(
  definition: ExternalFlightProviderDefinition,
  search: ExternalNeutralSearch,
): readonly CapabilityRejection[] {
  const { capabilities } = definition;
  const reasons: CapabilityRejection[] = [];

  switch (search.tripShape) {
    case "oneWay":
      if (!capabilities.supportsOneWay) reasons.push("oneWayUnsupported");
      break;
    case "roundTrip":
      if (!capabilities.supportsRoundTrip) reasons.push("roundTripUnsupported");
      break;
    case "multiCity":
      if (!capabilities.supportsMultiCity) reasons.push("multiCityUnsupported");
      break;
  }

  if (!capabilities.supportedMarkets.includes(search.market)) {
    reasons.push("marketUnsupported");
  }
  if (!capabilities.supportedCurrencies.includes(search.currency)) {
    reasons.push("currencyUnsupported");
  }
  // Negotiated on the *requested* locale: that is what the visitor asked for,
  // and a provider that can serve it should be asked in it even when GTAI's
  // own content falls back to English.
  if (!capabilities.supportedLocales.includes(search.requestedLocale)) {
    reasons.push("localeUnsupported");
  }
  if (!capabilities.supportsCabinClass && search.cabinClass !== "economy") {
    reasons.push("cabinClassUnsupported");
  }
  if (search.directOnly && !capabilities.supportsDirectOnly) {
    reasons.push("directOnlyUnsupported");
  }
  if (search.travelers.children > 0 && !capabilities.supportsChildren) {
    reasons.push("childrenUnsupported");
  }
  if (
    (search.travelers.infantsInSeat > 0 || search.travelers.infantsOnLap > 0) &&
    !capabilities.supportsInfants
  ) {
    reasons.push("infantsUnsupported");
  }
  if (search.legs.length > capabilities.maximumLegCount) {
    reasons.push("tooManyLegs");
  }
  if (totalTravelerCount(search.travelers) > capabilities.maximumTravellerCount) {
    reasons.push("tooManyTravellers");
  }

  return reasons;
}

/**
 * The complete provider-neutral query for a search.
 *
 * Every field a provider legitimately needs, and nothing else. The absences are
 * enumerated in `PROHIBITED_REQUEST_FIELDS` below and asserted by verification:
 * no name, email, passport, payment instrument, account id, raw browser header
 * or credential can appear, because none of them is in the neutral search this
 * is built from.
 *
 * Legs are indexed rather than joined into one string. A provider that wants
 * `leg[0].origin` and one that wants `origin0` differ only in naming; a
 * pre-joined `"YUL-CDG,CDG-YUL"` throws away the structure and every adapter
 * then has to parse it back out.
 */
export function buildNeutralQuery(
  search: ExternalNeutralSearch,
): Readonly<Record<string, string>> {
  const query: Record<string, string> = {
    tripShape: search.tripShape,
    market: search.market,
    locale: search.contentLocale,
    requestedLocale: search.requestedLocale,
    currency: search.currency,
    cabinClass: search.cabinClass,
    directOnly: String(search.directOnly),
    adults: String(search.travelers.adults),
    children: String(search.travelers.children),
    infantsInSeat: String(search.travelers.infantsInSeat),
    infantsOnLap: String(search.travelers.infantsOnLap),
    requestId: search.requestId,
    timeoutBudgetMs: String(search.timeoutBudgetMs),
  };

  search.legs.forEach((leg, index) => {
    query[`leg${index}Origin`] = leg.originCode;
    query[`leg${index}Destination`] = leg.destinationCode;
    query[`leg${index}Date`] = leg.departureDate;
  });

  return Object.freeze(query);
}

/**
 * Field names that must never appear in an outbound provider query.
 *
 * A denylist would be the wrong tool for deciding what to *send* — the neutral
 * search simply has no such fields, so nothing can be sent. This list exists so
 * verification can assert that property directly against a built request rather
 * than inferring it from the type.
 */
export const PROHIBITED_REQUEST_FIELDS: readonly string[] = [
  "name",
  "firstName",
  "lastName",
  "givenName",
  "surname",
  "email",
  "phone",
  "passport",
  "passportNumber",
  "dateOfBirth",
  "nationality",
  "payment",
  "card",
  "cardNumber",
  "cvv",
  "accountId",
  "userId",
  "sessionId",
  "cookie",
  "authorization",
  "userAgent",
  "ipAddress",
  "referer",
];
