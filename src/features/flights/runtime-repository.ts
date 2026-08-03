import { ApiFlightOfferRepository } from "./api-flight-offer-repository";
import {
  isDevelopmentScenario,
  type DevelopmentScenario,
  type FlightOfferRepository,
} from "./flight-offer-repository";

/**
 * The one place that decides which repository the interface runs against, and
 * how the development-scenario escape hatch is read.
 *
 * Both the Results and Details pages previously carried their own copy of
 * this logic; as of V2.7 there is a single definition, so the two can never
 * drift into fetching through different runtimes or accepting different
 * scenario vocabularies.
 */

/**
 * `__devScenario` only ever does anything outside a production build — in
 * production this returns `"normal"` unconditionally, so there is no
 * customer-facing way to force a slow, empty or failing search. It is
 * intentionally outside the documented Search Intent parameter contract (see
 * `search-intent-url.ts`) and outside the Results view-state contract (see
 * `flight-filter-url.ts`), which is why it is read straight off the raw query
 * string rather than through either parser.
 *
 * The value is checked against the shared allowlist rather than passed
 * through: an unrecognized string is not an error to report, it is simply not
 * a scenario, and the search proceeds normally.
 */
export function readDevelopmentScenario(
  rawParamsString: string,
): DevelopmentScenario {
  if (process.env.NODE_ENV === "production") return "normal";
  const raw = new URLSearchParams(rawParamsString).get("__devScenario");
  return isDevelopmentScenario(raw) ? raw : "normal";
}

/**
 * The runtime repository, created once.
 *
 * `ApiFlightOfferRepository` is stateless — every call carries its own intent,
 * signal, retry token and scenario — so a single shared instance is correct
 * and avoids allocating a new object on every effect run.
 */
const runtimeRepository: FlightOfferRepository = new ApiFlightOfferRepository();

export function getFlightOfferRepository(): FlightOfferRepository {
  return runtimeRepository;
}
