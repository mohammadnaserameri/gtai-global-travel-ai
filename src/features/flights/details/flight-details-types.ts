import type { FlightOffer } from "../flight-offer-types";
import type { FlightSearchIntent } from "../search-intent-types";
import type { HighlightKind } from "../flight-offer-highlights";
import type { ResultsViewState } from "../filters/flight-filter-types";

/**
 * Why a Flight Details page could not show a selected offer — or, in the
 * `ready` case, the fully resolved offer plus the Results context it was
 * opened from.
 *
 * These are deliberately five distinct outcomes rather than one generic
 * "not found": a malformed link, a well-formed link to an offer this search
 * never generated, and a real offer the visitor's own filters currently
 * exclude are three different situations that deserve three different
 * explanations and three different recovery actions.
 */
export type FlightDetailsResolution =
  | { readonly status: "invalidSearch" }
  | { readonly status: "invalidOfferId" }
  | { readonly status: "notFound" }
  | {
      readonly status: "excludedByFilters";
      readonly offer: FlightOffer;
      readonly intent: FlightSearchIntent;
      readonly viewState: ResultsViewState;
    }
  | {
      readonly status: "ready";
      readonly offer: FlightOffer;
      readonly intent: FlightSearchIntent;
      readonly viewState: ResultsViewState;
      /** Recomputed against the currently *displayed* set, never the whole repository. */
      readonly highlight: HighlightKind | undefined;
      /** How many offers the current filters leave visible — context for the highlight claim. */
      readonly displayedCount: number;
    };

/** The chronological events one itinerary is rendered as: each flight, and each connection between them. */
export type ItineraryTimelineEntry =
  | { readonly kind: "segment"; readonly index: number }
  | { readonly kind: "layover"; readonly index: number };
