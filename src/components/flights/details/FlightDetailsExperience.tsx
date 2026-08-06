"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { Dictionary } from "@/i18n/get-dictionary";
import type { FlexibilityDays } from "@/features/dates/date-types";
import type { FlightOffer } from "@/features/flights/flight-offer-types";
import {
  parseRawSearchIntentParams,
  serializeSearchIntent,
} from "@/features/flights/search-intent-url";
import { validateSearchIntentParams } from "@/features/flights/search-intent-validation";
import {
  isAbortError,
  type FlightOfferCoverage,
} from "@/features/flights/flight-offer-repository";
import {
  getFlightOfferRepository,
  readDevelopmentScenario,
} from "@/features/flights/runtime-repository";
import {
  formatLocaleNumber,
  formatTemplate,
} from "@/features/flights/flight-offer-formatting";
import { sanitizeFiltersAgainstOffers } from "@/features/flights/filters/flight-filter-url";
import type { ResultsViewState } from "@/features/flights/filters/flight-filter-types";
import { resolveFlightDetails } from "@/features/flights/details/flight-details-resolution";
import {
  isPreviewOfferId,
  readPreviewOfferSnapshot,
} from "@/features/flights/details/preview-offer-snapshot";
import {
  buildClearedFiltersDetailsUrl,
  buildFlightDetailsUrl,
  buildResultsReturnUrl,
  isValidOfferId,
  parseFlightDetailsContext,
} from "@/features/flights/details/flight-details-url";
import { localePath } from "@/i18n/routing";
import { Container } from "@/components/layout/Container";
import { Alert } from "@/components/ui/Alert";
import { DemonstrationDataNotice } from "@/components/ui/DemonstrationDataNotice";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { AffiliateDisclosure } from "@/components/ui/AffiliateDisclosure";
import { ChevronDownIcon } from "@/components/ui/icons";
import { ProviderHandoffModal } from "@/components/flights/ProviderHandoffModal";
import { FlightDetailsLoading } from "./FlightDetailsLoading";
import { FlightDetailsSummary } from "./FlightDetailsSummary";
import { ItineraryDetails } from "./ItineraryDetails";
import { FareAndBaggage } from "./FareAndBaggage";
import { PriceSummary } from "./PriceSummary";
import { DetailsStateActions, FlightDetailsState } from "./FlightDetailsState";

interface FlightDetailsExperienceProps {
  locale: string;
  offerId: string;
  dictionary: Dictionary;
}

type OfferState =
  | { status: "loading" }
  | {
      status: "ready";
      offers: readonly FlightOffer[];
      coverage: FlightOfferCoverage;
    }
  | { status: "empty"; coverage: FlightOfferCoverage }
  | { status: "error" };

type FetchedState = Extract<OfferState, { status: "ready" | "empty" | "error" }>;

const FLEX_LABEL_KEY: Record<
  FlexibilityDays,
  "exact" | "plusOne" | "plusTwo" | "plusThree"
> = { 0: "exact", 1: "plusOne", 2: "plusTwo", 3: "plusThree" };

/** One shared empty array, so a not-yet-ready fetch keeps a stable identity across renders. */
const EMPTY_OFFERS: readonly FlightOffer[] = [];

/**
 * The dedicated Flight Details page for one selected demonstration offer.
 *
 * Reads the same URL contract the Results page does — strict Search Intent
 * plus lenient, offer-aware view-state — and replays the identical
 * sanitize → filter → sort → highlight pipeline, so the offer is described
 * exactly as the list it was opened from described it. The repository fetch
 * is keyed **only** on the normalized Search Intent, the retry token and the
 * dev scenario: the offer id, Sort, Filters and every piece of this page's
 * own UI state are deliberately absent from that key, so opening details,
 * changing filters upstream or toggling the provider preview can never
 * regenerate offers.
 */
export function FlightDetailsExperience({
  locale,
  offerId,
  dictionary,
}: FlightDetailsExperienceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const paramsString = searchParams.toString();
  const labels = dictionary.flightDetails;
  const resultsLabels = dictionary.flightResults;

  /**
   * Whether the path segment is even a well-formed demonstration offer id.
   * Computed through the same shared validator the resolution pipeline uses,
   * and treated as a hard precondition for fetching: a malformed link must
   * never become a reason to generate offers.
   */
  const offerIdIsValid = isValidOfferId(offerId);

  const validation = useMemo(
    () =>
      validateSearchIntentParams(
        parseRawSearchIntentParams(new URLSearchParams(paramsString)),
        locale,
      ),
    [paramsString, locale],
  );
  const intent = validation.ok ? validation.intent : null;
  const intentKey = intent ? serializeSearchIntent(intent).toString() : null;
  const devScenario = readDevelopmentScenario(paramsString);

  const [fetched, setFetched] = useState<{
    key: string;
    result: FetchedState;
  } | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(true);

  const handoffDialogId = useId();
  const summaryHeadingId = useId();
  const timelineRegionId = useId();
  const outboundHeadingId = useId();
  const inboundHeadingId = useId();
  const fareHeadingId = useId();
  const priceHeadingId = useId();
  const highlightHeadingId = useId();

  /**
   * `null` means "there is nothing to fetch". Both preconditions are
   * represented here rather than only inside the effect, so the not-yet-
   * fetched render and the effect agree on exactly one condition.
   *
   * The key itself still contains only the normalized Search Intent, the
   * retry token and the dev scenario — the offer id gates *whether* we
   * fetch, but never varies the key, so Sort, Filters, the offer id and
   * every piece of UI state remain absent from what identifies a result.
   */
  const fetchKey =
    intentKey !== null && offerIdIsValid
      ? `${intentKey}#${retryToken}#${devScenario}`
      : null;

  const offerState: OfferState = useMemo(() => {
    if (fetchKey === null) return { status: "loading" };
    return fetched && fetched.key === fetchKey
      ? fetched.result
      : { status: "loading" };
  }, [fetched, fetchKey]);

  // Mirrors the Results page's render-time sync: the committed intent only
  // changes identity when the canonical key changes, so this effect never
  // re-runs for a filter/sort-only URL change.
  const [syncedIntentKey, setSyncedIntentKey] = useState(intentKey);
  const [committedIntent, setCommittedIntent] = useState(intent);
  if (syncedIntentKey !== intentKey) {
    setSyncedIntentKey(intentKey);
    setCommittedIntent(intent);
  }

  useEffect(() => {
    // Three explicit preconditions. Returning *before* constructing the
    // AbortController or the repository is the point: React runs effects
    // after render, so the invalid-offer-id branch rendering first is not
    // by itself enough to stop a fetch. `offerIdIsValid` is a dependency,
    // so flipping a valid id to an invalid one runs this effect's cleanup
    // and aborts any obsolete in-flight search.
    if (committedIntent === null) return;
    if (!offerIdIsValid) return;
    if (fetchKey === null) return;

    const key = fetchKey;
    if (isPreviewOfferId(offerId)) {
      const snapshot = readPreviewOfferSnapshot(committedIntent, offerId);
      let cancelled = false;
      void Promise.resolve().then(() => {
        if (cancelled) return;
        setFetched({
          key,
          result:
            snapshot === null
              ? { status: "empty", coverage: "complete" }
              : { status: "ready", offers: [snapshot], coverage: "complete" },
        });
      });
      return () => {
        cancelled = true;
      };
    }

    const controller = new AbortController();
    const repository = getFlightOfferRepository();

    repository
      .search(committedIntent, {
        signal: controller.signal,
        retryToken,
        scenario: devScenario,
      })
      .then((response) => {
        setFetched({
          key,
          result:
            response.offers.length === 0
              ? { status: "empty", coverage: response.coverage }
              : {
                  status: "ready",
                  offers: response.offers,
                  coverage: response.coverage,
                },
        });
      })
      .catch((error: unknown) => {
        if (isAbortError(error)) return;
        setFetched({ key, result: { status: "error" } });
      });

    return () => controller.abort();
  }, [committedIntent, offerId, offerIdIsValid, fetchKey, devScenario, retryToken]);

  const currentParams = useMemo(
    () => new URLSearchParams(paramsString),
    [paramsString],
  );
  const { viewState: rawViewState } = useMemo(
    () => parseFlightDetailsContext(currentParams),
    [currentParams],
  );

  // Memoized so the resolution below only recomputes when the fetch actually
  // resolves — a bare `? :` would hand it a new empty array every render.
  const offers = useMemo(
    () => (offerState.status === "ready" ? offerState.offers : EMPTY_OFFERS),
    [offerState],
  );
  /**
   * Whether the search behind these offers heard from every source. Carried
   * from the repository rather than inferred: a missing offer looks identical
   * whether it does not exist or whether nobody looked.
   */
  const isPartialCoverage =
    (offerState.status === "ready" || offerState.status === "empty") &&
    offerState.coverage === "partial";
  const resolution = useMemo(
    () =>
      resolveFlightDetails({
        intent,
        rawOfferId: offerId,
        offers,
        rawViewState,
      }),
    [intent, offerId, offers, rawViewState],
  );

  /**
   * The offer-aware view state: the raw URL values with unknown carriers and
   * airports dropped and out-of-range numeric bounds defaulted, using the
   * *shared* sanitizer. `null` until the complete offer set exists — there
   * is deliberately no way to claim a view state is offer-aware before the
   * offers it would be checked against are known.
   */
  const sanitizedViewState: ResultsViewState | null = useMemo(() => {
    if (offers.length === 0) return null;
    return {
      sort: rawViewState.sort,
      filters: sanitizeFiltersAgainstOffers(rawViewState.filters, offers),
    };
  }, [offers, rawViewState]);

  /**
   * Canonicalizes the Details URL once the complete offer set is known —
   * the same automatic cleanup the Results page performs, extended to keep
   * the offer id in the path. Only ever runs with a valid Search Intent
   * (guaranteed by `offers.length > 0`, which requires a successful fetch)
   * and a valid offer id, so a malformed link is never "repaired" into a
   * working one. Self-terminating: the canonical form is idempotent, so
   * once the address bar matches, the comparison finds no difference.
   * `replace` + `scroll: false` means no history entry and no scroll jump,
   * and because the fetch key excludes all view state, no refetch.
   */
  useEffect(() => {
    if (!offerIdIsValid) return;
    if (sanitizedViewState === null) return;
    if (offerState.status !== "ready") return;

    const canonicalUrl = buildFlightDetailsUrl(
      locale,
      offerId,
      new URLSearchParams(paramsString),
      sanitizedViewState,
      offerState.offers,
    );
    const currentUrl = `${pathname}${paramsString ? `?${paramsString}` : ""}`;
    if (canonicalUrl !== currentUrl) {
      router.replace(canonicalUrl, { scroll: false });
    }
  }, [
    offerIdIsValid,
    sanitizedViewState,
    offerState,
    locale,
    offerId,
    paramsString,
    pathname,
    router,
  ]);

  /**
   * "Back to results" is reconstructed, never read from the URL. Once the
   * offer set exists it is built from the *sanitized* view state, so stale
   * carriers, unknown airports and out-of-range numeric bounds cannot ride
   * back to Results. Before that, only the format-level parse is available
   * — which is not offer-aware, and is left for Results to sanitize itself.
   */
  const resultsHref = buildResultsReturnUrl(
    locale,
    currentParams,
    sanitizedViewState ?? rawViewState,
    offers,
  );
  const flightsHref = `${localePath(locale, "/flights")}${paramsString ? `?${paramsString}` : ""}`;
  const flightsHomeHref = localePath(locale, "/flights");

  // --- Non-ready states -------------------------------------------------

  if (!validation.ok) {
    return (
      <Container className="py-10 lg:py-14">
        <FlightDetailsState title={labels.states.invalidSearch} tone="invalid">
          {/* One action only. With no valid Search Intent there is no
              Results URL to return to, so offering "Return to flight
              results" beside "Edit search" would be two differently-worded
              promises pointing at the same page — one of them false. */}
          <ButtonLink href={flightsHomeHref} variant="primary">
            {labels.editSearch}
          </ButtonLink>
        </FlightDetailsState>
      </Container>
    );
  }

  if (resolution.status === "invalidOfferId") {
    return (
      <Container className="py-10 lg:py-14">
        <FlightDetailsState title={labels.states.invalidOfferId} tone="invalid">
          <DetailsStateActions
            resultsHref={resultsHref}
            editSearchHref={flightsHref}
            labels={labels}
          />
        </FlightDetailsState>
      </Container>
    );
  }

  if (offerState.status === "error") {
    return (
      <Container className="py-10 lg:py-14">
        <FlightDetailsState
          title={labels.states.error}
          tone="invalid"
          focusOnMount
          alert
        >
          <DetailsStateActions
            resultsHref={resultsHref}
            editSearchHref={flightsHref}
            labels={labels}
            onRetry={() => setRetryToken((token) => token + 1)}
          />
        </FlightDetailsState>
      </Container>
    );
  }

  if (offerState.status === "loading") {
    return (
      <Container className="py-8 lg:py-10">
        <FlightDetailsLoading labels={labels} />
      </Container>
    );
  }

  if (offerState.status === "empty" || resolution.status === "notFound") {
    if (isPreviewOfferId(offerId)) {
      return (
        <Container className="py-10 lg:py-14">
          <FlightDetailsState title={labels.livePreview.unavailable} tone="invalid">
            <p className="text-foreground-muted text-sm">
              {labels.livePreview.unavailableHint}
            </p>
            <DetailsStateActions
              resultsHref={resultsHref}
              editSearchHref={flightsHref}
              labels={labels}
            />
          </FlightDetailsState>
        </Container>
      );
    }
    // "Could not be found" is a definitive claim, and it is only true when
    // every source answered. Under partial coverage the honest statement is
    // that the search was incomplete, so the option could not be *verified* —
    // with Retry as the action, because retrying is what might settle it.
    if (isPartialCoverage) {
      return (
        <Container className="py-10 lg:py-14">
          <FlightDetailsState
            title={labels.partialCoverage.unverified}
            description={labels.partialCoverage.unverifiedHint}
            tone="notice"
          >
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button
                variant="primary"
                onClick={() => setRetryToken((token) => token + 1)}
              >
                {labels.partialCoverage.retry}
              </Button>
              <ButtonLink href={resultsHref} variant="secondary">
                {labels.returnToResults}
              </ButtonLink>
            </div>
          </FlightDetailsState>
        </Container>
      );
    }
    return (
      <Container className="py-10 lg:py-14">
        <FlightDetailsState title={labels.states.notFound} tone="notice">
          <DetailsStateActions
            resultsHref={resultsHref}
            editSearchHref={flightsHref}
            labels={labels}
          />
        </FlightDetailsState>
      </Container>
    );
  }

  if (resolution.status === "excludedByFilters") {
    return (
      <Container className="py-10 lg:py-14">
        <FlightDetailsState
          title={labels.states.excludedByFilters}
          description={labels.states.excludedHint}
          tone="notice"
        >
          <DetailsStateActions
            resultsHref={resultsHref}
            editSearchHref={flightsHref}
            labels={labels}
            primaryHref={buildClearedFiltersDetailsUrl(
              locale,
              offerId,
              currentParams,
              offers,
            )}
            primaryLabel={labels.states.clearFiltersAndView}
          />
        </FlightDetailsState>
      </Container>
    );
  }

  if (resolution.status !== "ready") {
    // `invalidSearch` is already handled above via `validation.ok`; this
    // branch exists only so the union is exhaustively narrowed.
    return (
      <Container className="py-10 lg:py-14">
        <FlightDetailsState title={labels.states.invalidSearch} tone="invalid">
          <ButtonLink href={flightsHomeHref} variant="primary">
            {labels.editSearch}
          </ButtonLink>
        </FlightDetailsState>
      </Container>
    );
  }

  // --- Ready ------------------------------------------------------------

  const { offer, intent: readyIntent, highlight, displayedCount } = resolution;
  const cabinLabel = dictionary.search.options.cabin[readyIntent.cabinClass];
  const flexibilityLabel =
    dictionary.search.dates.flexible[FLEX_LABEL_KEY[readyIntent.flexibilityDays]];
  const tripTypeLabel =
    readyIntent.tripType === "roundTrip"
      ? dictionary.search.tripType.roundTrip
      : dictionary.search.tripType.oneWay;
  const highlightCopy = highlight ? resultsLabels.highlights[highlight] : null;

  return (
    <Container className="flex flex-col gap-6 py-8 lg:py-10">
      <div>
        <ButtonLink href={resultsHref} variant="ghost">
          <span aria-hidden="true" className="rtl:-scale-x-100">
            ←
          </span>
          {labels.backToResults}
        </ButtonLink>
      </div>

      {/* The same shared notice Results renders, placed above the flight
          identity and price so it is read before either. */}
      {offer.isDemonstration ? (
        <DemonstrationDataNotice
          variant="prominent"
          labels={{
            title: labels.disclosure.title,
            compact: dictionary.demonstrationNotice.compact,
            body: dictionary.demonstrationNotice.body,
            points: labels.disclosure.points,
          }}
        />
      ) : (
        <Alert tone="success" title={labels.livePreview.title}>
          <p>{labels.livePreview.description}</p>
        </Alert>
      )}

      {/* The same reduced-coverage statement Results shows. This offer is
          real and fully described; what is uncertain is whether it was the
          best of everything, and that belongs on the page too. */}
      {isPartialCoverage ? (
        <Alert tone="warning">
          <p className="font-semibold">{labels.partialCoverage.title}</p>
          <p className="mt-1.5">{labels.partialCoverage.description}</p>
        </Alert>
      ) : null}

      <h1 className="text-foreground text-xl font-bold lg:text-2xl">
        {labels.heading}
      </h1>

      <FlightDetailsSummary
        intent={readyIntent}
        resultsLabels={resultsLabels}
        cabinLabel={cabinLabel}
        flexibilityLabel={flexibilityLabel}
        tripTypeLabel={tripTypeLabel}
        isDemonstration={offer.isDemonstration}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2
              id={summaryHeadingId}
              className="text-foreground text-base font-semibold"
            >
              {labels.itinerary.overview}
            </h2>
            <button
              type="button"
              aria-expanded={timelineOpen}
              aria-controls={timelineRegionId}
              onClick={() => setTimelineOpen((value) => !value)}
              className="text-brand-ink hover:text-brand-ink-strong focus-visible:outline-focus-ring inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {timelineOpen
                ? resultsLabels.card.hideDetails
                : resultsLabels.card.showDetails}
              <span
                aria-hidden="true"
                className={
                  timelineOpen
                    ? "rotate-180 transition-transform"
                    : "transition-transform"
                }
              >
                <ChevronDownIcon size={16} />
              </span>
            </button>
          </div>

          {/* The controlled region always exists, so the toggle's
              `aria-controls` never dangles. `hidden` (not conditional
              rendering) is what removes it from both the accessibility tree
              and the visual layout while collapsed — and expanding restores
              the itineraries in the same DOM order they always had. */}
          <div
            id={timelineRegionId}
            aria-labelledby={summaryHeadingId}
            hidden={!timelineOpen}
            className="flex flex-col gap-4"
          >
            {offer.itineraries.map((itinerary) => (
              <ItineraryDetails
                key={itinerary.direction}
                itinerary={itinerary}
                labels={labels}
                resultsLabels={resultsLabels}
                locale={readyIntent.locale}
                cabinLabel={cabinLabel}
                headingId={
                  itinerary.direction === "outbound"
                    ? outboundHeadingId
                    : inboundHeadingId
                }
              />
            ))}
          </div>

          <p className="text-foreground-muted text-xs leading-relaxed">
            {labels.itinerary.localTimeNotice}
          </p>

          <FareAndBaggage
            offer={offer}
            labels={labels}
            cabinLabel={cabinLabel}
            headingId={fareHeadingId}
          />
        </div>

        <div className="flex flex-col gap-4">
          <PriceSummary
            offer={offer}
            intent={readyIntent}
            labels={labels}
            headingId={priceHeadingId}
          />

          {highlightCopy ? (
            <Card
              as="section"
              variant="outline"
              padding="md"
              aria-labelledby={highlightHeadingId}
            >
              <div className="flex flex-wrap items-center gap-2">
                <h2
                  id={highlightHeadingId}
                  className="text-foreground text-base font-semibold"
                >
                  {labels.highlight.heading}
                </h2>
                <Badge tone="brand" size="sm">
                  {highlightCopy.badge}
                </Badge>
              </div>
              <p className="text-foreground-secondary mt-2 text-sm leading-relaxed">
                {highlightCopy.explanation}
              </p>
              {highlight ? (
                <p className="text-foreground-secondary mt-2 text-sm leading-relaxed">
                  {labels.highlight.metric[highlight]}
                </p>
              ) : null}
              <p className="text-foreground-muted mt-2 text-xs leading-relaxed">
                {displayedCount === 1
                  ? labels.highlight.scopeOne
                  : formatTemplate(labels.highlight.scope, {
                      count: formatLocaleNumber(displayedCount, readyIntent.locale),
                    })}
              </p>
            </Card>
          ) : null}

          <Card variant="outline" padding="md">
            <h2 className="text-foreground text-base font-semibold">
              {labels.provider.heading}
            </h2>
            <p className="text-foreground-muted mt-2 text-xs leading-relaxed">
              {offer.isDemonstration
                ? labels.provider.notice
                : labels.livePreview.providerNotice}
            </p>
            {offer.isDemonstration ? (
              <div className="mt-3">
                <Button
                  variant="primary"
                  fullWidth
                  aria-haspopup="dialog"
                  aria-expanded={handoffOpen}
                  aria-controls={handoffDialogId}
                  onClick={() => setHandoffOpen(true)}
                >
                  {resultsLabels.outbound.cta}
                </Button>
              </div>
            ) : null}
          </Card>
        </div>
      </div>

      <AffiliateDisclosure labels={dictionary.affiliate} variant="inline" />

      <ProviderHandoffModal
        dialogId={handoffDialogId}
        open={handoffOpen}
        onClose={() => setHandoffOpen(false)}
        offer={offer}
        intent={readyIntent}
        labels={resultsLabels}
        demonstrationNotice={dictionary.demonstrationNotice}
      />
    </Container>
  );
}
