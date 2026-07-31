import type { FlightOffer } from "../flight-offer-types";
import type { FlightSearchIntent } from "../search-intent-types";
import { applyFilters } from "../filters/flight-filter-application";
import { sanitizeFiltersAgainstOffers } from "../filters/flight-filter-url";
import type { ResultsViewState } from "../filters/flight-filter-types";
import { sortOffers } from "../flight-offer-ranking";
import { computeHighlights } from "../flight-offer-highlights";
import { isValidOfferId } from "./flight-details-url";
import type { FlightDetailsResolution } from "./flight-details-types";

/**
 * Resolves which offer a Flight Details URL refers to, and in what state.
 *
 * The pipeline is deliberately ordered so that cheap, purely syntactic
 * rejections happen before any offer generation: an invalid Search Intent or
 * a malformed offer id never reaches the repository at all. Once the
 * complete deterministic set exists, the *same* sanitize → filter → sort →
 * highlight sequence the Results page runs is replayed here, so the Details
 * page describes the offer exactly as the list the visitor came from did.
 *
 * Offers are **never** regenerated from Sort or Filter state — those only
 * ever narrow and reorder an already-generated set. That is what keeps the
 * repository key (Search Intent + retry + dev scenario) independent of
 * everything on this page.
 */
export function resolveFlightDetails(input: {
  /** `null` when the strict Search Intent parse already failed. */
  readonly intent: FlightSearchIntent | null;
  readonly rawOfferId: string;
  /** The complete deterministic set for this Search Intent — unfiltered, unsorted. */
  readonly offers: readonly FlightOffer[];
  /** The raw (format-validated but not yet offer-aware) view-state from the URL. */
  readonly rawViewState: ResultsViewState;
}): FlightDetailsResolution {
  const { intent, rawOfferId, offers, rawViewState } = input;

  // 1-2. Syntactic gates first — neither of these needs an offer set.
  if (intent === null) return { status: "invalidSearch" };
  if (!isValidOfferId(rawOfferId)) return { status: "invalidOfferId" };

  // 3-4. The complete set is supplied by the caller (which owns the fetch),
  // keyed only on the Search Intent — see the module comment above.

  // 5-6. Offer-aware sanitization: a stale carrier id or an out-of-range
  // numeric bound is dropped here exactly as it is on Results.
  const sanitizedFilters = sanitizeFiltersAgainstOffers(
    rawViewState.filters,
    offers,
  );
  const viewState: ResultsViewState = {
    sort: rawViewState.sort,
    filters: sanitizedFilters,
  };

  // 7-8. Narrow, then order. Neither step adds, drops or rewrites an offer's
  // identity — only which of them are shown, and in what sequence.
  const filteredOffers = applyFilters(offers, sanitizedFilters);
  const displayedOffers = sortOffers(filteredOffers, viewState.sort);

  // 10. Resolve the path id. Checked against the *complete* set first so a
  // real offer the filters merely hide is never reported as "not found".
  const offerInCompleteSet = offers.find((offer) => offer.id === rawOfferId);
  if (!offerInCompleteSet) return { status: "notFound" };

  const offerInDisplayedSet = displayedOffers.find(
    (offer) => offer.id === rawOfferId,
  );
  if (!offerInDisplayedSet) {
    return {
      status: "excludedByFilters",
      offer: offerInCompleteSet,
      intent,
      viewState,
    };
  }

  // 9. Highlights are recomputed against what is actually displayed, so a
  // "Cheapest" claim on this page means cheapest among the same options the
  // visitor could compare it against — never across the whole repository.
  const highlights = computeHighlights(displayedOffers);

  // 11. Ready.
  return {
    status: "ready",
    offer: offerInDisplayedSet,
    intent,
    viewState,
    highlight: highlights.get(offerInDisplayedSet.id),
    displayedCount: displayedOffers.length,
  };
}
