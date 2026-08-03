import "../server-only";

import { isSupportedLocale } from "../../config/locales";
import type { FlightSearchIntent } from "../../features/flights/search-intent-types";
import type { DevelopmentScenario } from "../../features/flights/flight-offer-repository";
import { isDevelopmentScenario } from "../../features/flights/flight-offer-repository";
import { validateSearchIntentParams } from "../../features/flights/search-intent-validation";
import type { RawSearchIntentParams } from "../../features/flights/search-intent-url";
import { SEARCH_PARAM } from "../../features/flights/search-intent-url";
import {
  ALLOWED_INTENT_KEYS,
  ALLOWED_REQUEST_KEYS,
  FLIGHT_SEARCH_API_VERSION,
  isValidRetryToken,
} from "../../features/flights/flight-search-api-contract";

/**
 * Manual, dependency-free validation of an internal search request.
 *
 * Everything here treats the body as hostile, including the parts a
 * well-behaved GTAI client would always get right. The client already
 * validated the Search Intent before sending it; that is irrelevant — the
 * server re-derives the intent from scratch through the same shared validator
 * the Results page uses, so there is exactly one definition of a valid search
 * and the client's opinion is never load-bearing.
 *
 * Two smaller decisions worth naming:
 *
 * - **Unknown keys are rejected, not ignored.** An extra top-level property
 *   or an extra field inside `searchIntent` means the caller believes
 *   something this contract does not implement. Silently dropping it would
 *   let a future field appear to work.
 * - **Errors never echo the payload.** The rejection reasons below are fixed
 *   strings chosen from a closed set; no submitted value is reflected back,
 *   so the endpoint cannot be turned into a reflector.
 */

export type RequestRejectionReason =
  | "unsupportedContentType"
  | "bodyTooLarge"
  | "malformedJson"
  | "notAnObject"
  | "unknownProperty"
  | "unsupportedVersion"
  | "invalidRetryToken"
  | "unsupportedScenario"
  | "invalidLocale"
  | "invalidSearchIntent";

/**
 * Whether this deployment may run the controlled development scenarios.
 *
 * The policy is passed in explicitly rather than read from a request field,
 * because a caller must never be able to choose which rules apply to it. It
 * is also not read from the environment *here*: the route decides once and
 * hands the decision down, which is what makes both branches directly
 * testable without mutating `process.env` around each assertion.
 *
 * The client already returns `"normal"` in production, but client-side gating
 * is a convenience, not a boundary — anyone can POST to this endpoint. This
 * is where the refusal actually happens.
 */
export interface FlightSearchRequestValidationOptions {
  readonly allowDevelopmentScenarios: boolean;
}

export type FlightSearchRequestValidation =
  | {
      readonly ok: true;
      readonly intent: FlightSearchIntent;
      readonly scenario: DevelopmentScenario;
      readonly retryToken: number;
    }
  | { readonly ok: false; readonly reason: RequestRejectionReason };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Turns the wire intent object into the exact shape the shared strict
 * validator expects.
 *
 * `duplicateKeys` is always empty here and that is correct rather than a
 * shortcut: a JSON object cannot carry the same key twice, so the duplicate
 * problem the URL parser guards against does not exist on this transport.
 * Unknown keys are rejected before this point, so no unvalidated field can
 * ride along.
 */
function toRawIntentParams(intent: Record<string, string>): RawSearchIntentParams {
  const read = (key: string): string | null => intent[key] ?? null;
  return {
    version: read(SEARCH_PARAM.version),
    trip: read(SEARCH_PARAM.trip),
    origin: read(SEARCH_PARAM.origin),
    destination: read(SEARCH_PARAM.destination),
    departure: read(SEARCH_PARAM.departure),
    returnDate: read(SEARCH_PARAM.returnDate),
    adults: read(SEARCH_PARAM.adults),
    children: read(SEARCH_PARAM.children),
    infantsInSeat: read(SEARCH_PARAM.infantsInSeat),
    infantsOnLap: read(SEARCH_PARAM.infantsOnLap),
    cabin: read(SEARCH_PARAM.cabin),
    flex: read(SEARCH_PARAM.flex),
    currency: read(SEARCH_PARAM.currency),
    duplicateKeys: [],
  };
}

/** Validates an already-parsed JSON value. Split out so it is directly testable without a `Request`. */
export function validateFlightSearchRequestBody(
  body: unknown,
  options: FlightSearchRequestValidationOptions,
): FlightSearchRequestValidation {
  if (!isRecord(body)) return { ok: false, reason: "notAnObject" };

  for (const key of Object.keys(body)) {
    if (!ALLOWED_REQUEST_KEYS.includes(key)) {
      return { ok: false, reason: "unknownProperty" };
    }
  }

  if (body.version !== FLIGHT_SEARCH_API_VERSION) {
    return { ok: false, reason: "unsupportedVersion" };
  }
  if (!isValidRetryToken(body.retryToken)) {
    return { ok: false, reason: "invalidRetryToken" };
  }
  if (!isDevelopmentScenario(body.scenario)) {
    return { ok: false, reason: "unsupportedScenario" };
  }
  // The server, not the client, decides whether a non-normal scenario may
  // run. A production deployment refuses `empty`, `error` and `slow` outright
  // — the same safe 400 an unknown scenario gets, so the response reveals
  // nothing about which environment is running.
  if (body.scenario !== "normal" && !options.allowDevelopmentScenarios) {
    return { ok: false, reason: "unsupportedScenario" };
  }
  if (typeof body.locale !== "string" || !isSupportedLocale(body.locale)) {
    return { ok: false, reason: "invalidLocale" };
  }

  const rawIntent = body.searchIntent;
  if (!isRecord(rawIntent)) return { ok: false, reason: "invalidSearchIntent" };

  const intentFields: Record<string, string> = {};
  for (const [key, value] of Object.entries(rawIntent)) {
    if (!ALLOWED_INTENT_KEYS.includes(key)) {
      return { ok: false, reason: "unknownProperty" };
    }
    // Every intent field is a short code, date or small integer as a string.
    // A number, boolean, array or nested object here is malformed input, not
    // something to coerce.
    if (typeof value !== "string") {
      return { ok: false, reason: "invalidSearchIntent" };
    }
    intentFields[key] = value;
  }

  const validation = validateSearchIntentParams(
    toRawIntentParams(intentFields),
    body.locale,
  );
  if (!validation.ok) return { ok: false, reason: "invalidSearchIntent" };

  return {
    ok: true,
    intent: validation.intent,
    scenario: body.scenario,
    retryToken: body.retryToken,
  };
}
