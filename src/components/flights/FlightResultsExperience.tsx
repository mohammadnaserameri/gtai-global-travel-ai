"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import type { Dictionary } from "@/i18n/get-dictionary";
import type { FlexibilityDays } from "@/features/dates/date-types";
import {
  parseRawSearchIntentParams,
  type RawSearchIntentParams,
} from "@/features/flights/search-intent-url";
import { validateSearchIntentParams } from "@/features/flights/search-intent-validation";
import type { FlightOffer } from "@/features/flights/flight-offer-types";
import {
  DemoFlightOfferRepository,
  type DemoOfferScenario,
} from "@/features/flights/demo-flight-offer-repository";
import {
  isAbortError,
  type FlightOfferRepository,
} from "@/features/flights/flight-offer-repository";
import {
  sortOffers,
  type SortOption,
} from "@/features/flights/flight-offer-ranking";
import {
  formatLocaleNumber,
  formatResultCount,
  formatTemplate,
} from "@/features/flights/flight-offer-formatting";
import { localePath } from "@/i18n/routing";
import { Container } from "@/components/layout/Container";
import { Alert } from "@/components/ui/Alert";
import { Button, ButtonLink } from "@/components/ui/Button";
import { AffiliateDisclosure } from "@/components/ui/AffiliateDisclosure";
import { SearchSummary } from "@/components/flights/SearchSummary";
import { SortControl } from "@/components/flights/SortControl";
import { ResultCard } from "@/components/flights/ResultCard";
import { ResultsLoadingSkeleton } from "@/components/flights/ResultsLoadingSkeleton";

interface FlightResultsExperienceProps {
  locale: string;
  dictionary: Dictionary;
}

type OfferState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; offers: readonly FlightOffer[] }
  | { status: "empty" }
  | { status: "error" };

/** Only the states a fetch can actually resolve to — never "idle" or "loading". */
type FetchedState = Extract<OfferState, { status: "ready" | "empty" | "error" }>;

const FLEX_LABEL_KEY: Record<
  FlexibilityDays,
  "exact" | "plusOne" | "plusTwo" | "plusThree"
> = {
  0: "exact",
  1: "plusOne",
  2: "plusTwo",
  3: "plusThree",
};

/** Reads the raw fields and runs validation once, given the exact same two inputs the fetch effect uses. */
function resolve(rawParamsString: string, locale: string) {
  const raw: RawSearchIntentParams = parseRawSearchIntentParams(
    new URLSearchParams(rawParamsString),
  );
  return validateSearchIntentParams(raw, locale);
}

/**
 * `__devScenario` only ever does anything outside a production build — in
 * production this whole branch is dead code, so there is no customer-facing
 * way to force an error or empty result set. It is intentionally outside the
 * documented Search Intent parameter contract (see `search-intent-url.ts`).
 */
function createRepository(rawParamsString: string): FlightOfferRepository {
  if (process.env.NODE_ENV !== "production") {
    const scenario = new URLSearchParams(rawParamsString).get("__devScenario");
    const devScenario: DemoOfferScenario | null =
      scenario === "empty" || scenario === "error" ? scenario : null;
    if (devScenario)
      return new DemoFlightOfferRepository({ scenario: devScenario });
  }
  return new DemoFlightOfferRepository();
}

/**
 * Owns the whole Results journey: parses and validates the URL, fetches
 * demonstration offers, and renders exactly one of five states — invalid,
 * the Everywhere carve-out, loading, error/empty, or a sorted result list.
 * Every state exposes exactly one `<h1>`.
 */
export function FlightResultsExperience({
  locale,
  dictionary,
}: FlightResultsExperienceProps) {
  const searchParams = useSearchParams();
  const paramsString = searchParams.toString();
  const labels = dictionary.flightResults;

  /**
   * The fetch effect only ever writes here from inside its `.then`/`.catch`
   * callbacks — genuinely asynchronous completions, never a synchronous
   * `setState` at the top of the effect body. Tagging each write with the
   * `paramsString` it answers means a result from a superseded search is
   * simply ignored during render rather than needing an explicit reset.
   */
  const [fetched, setFetched] = useState<{
    key: string;
    result: FetchedState;
  } | null>(null);
  /** Bumped by Retry to re-run the fetch effect without changing the URL. */
  const [retryToken, setRetryToken] = useState(0);

  const [sort, setSort] = useState<SortOption>("best");
  /**
   * Resets the sort back to Best whenever the search itself changes. This
   * runs during render — React's documented way to adjust state in response
   * to a prop/derived value changing — rather than in an Effect, so it is
   * never a "setState synchronously inside an effect".
   */
  const [sortResetKey, setSortResetKey] = useState(paramsString);
  if (sortResetKey !== paramsString) {
    setSortResetKey(paramsString);
    setSort("best");
  }

  const invalidHeadingRef = useRef<HTMLHeadingElement>(null);
  const errorHeadingRef = useRef<HTMLHeadingElement>(null);
  const resultsHeadingRef = useRef<HTMLHeadingElement>(null);
  const sortGroupName = useId();

  const fetchKey = `${paramsString}#${retryToken}`;
  const validation = resolve(paramsString, locale);
  const offerState: OfferState = !validation.ok
    ? { status: "idle" }
    : fetched && fetched.key === fetchKey
      ? fetched.result
      : { status: "loading" };

  useEffect(() => {
    const result = resolve(paramsString, locale);
    if (!result.ok) return;

    const controller = new AbortController();
    const repository = createRepository(paramsString);
    const key = `${paramsString}#${retryToken}`;

    repository
      .search(result.intent, controller.signal)
      .then((response) => {
        setFetched({
          key,
          result:
            response.offers.length === 0
              ? { status: "empty" }
              : { status: "ready", offers: response.offers },
        });
      })
      .catch((error: unknown) => {
        if (isAbortError(error)) return;
        setFetched({ key, result: { status: "error" } });
      });

    return () => controller.abort();
  }, [paramsString, locale, retryToken]);

  // Depends only on stable primitives (`paramsString`, `locale`) and
  // recomputes validation fresh inside, rather than depending on `validation`
  // itself — a new object every render — which would refocus the heading on
  // every unrelated re-render instead of only when the URL actually changes.
  useEffect(() => {
    const result = resolve(paramsString, locale);
    if (!result.ok && result.reason !== "destinationIsEverywhere") {
      invalidHeadingRef.current?.focus();
    }
  }, [paramsString, locale]);

  useEffect(() => {
    if (offerState.status === "ready" || offerState.status === "empty") {
      resultsHeadingRef.current?.focus();
    }
  }, [offerState.status]);

  useEffect(() => {
    if (offerState.status === "error") {
      errorHeadingRef.current?.focus();
    }
  }, [offerState.status]);

  const flightsHref = `${localePath(locale, "/flights")}${paramsString ? `?${paramsString}` : ""}`;
  const flightsHomeHref = localePath(locale, "/flights");
  const exploreHref = localePath(locale, "/explore");

  if (!validation.ok) {
    if (validation.reason === "destinationIsEverywhere") {
      return (
        <Container className="flex flex-col gap-4 py-10 lg:py-14">
          <h1 className="text-foreground text-xl font-bold">{labels.heading}</h1>
          <Alert tone="brand">
            <p className="font-semibold">
              {dictionary.search.locations.everywhereResultsUnavailable}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <ButtonLink href={exploreHref} variant="secondary">
                {dictionary.search.locations.exploreLink}
              </ButtonLink>
              <ButtonLink href={flightsHref} variant="ghost">
                {labels.editSearch}
              </ButtonLink>
            </div>
          </Alert>
        </Container>
      );
    }

    return (
      <Container className="py-10 lg:py-14">
        <div
          role="alert"
          className="border-danger/25 bg-danger-subtle rounded-2xl border p-6 text-center"
        >
          <h1
            ref={invalidHeadingRef}
            tabIndex={-1}
            className="text-foreground text-lg font-semibold focus:outline-none"
          >
            {labels.invalid.title}
          </h1>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <ButtonLink href={flightsHomeHref} variant="primary">
              {labels.invalid.startNewSearch}
            </ButtonLink>
            <ButtonLink href={flightsHomeHref} variant="secondary">
              {labels.invalid.returnToFlights}
            </ButtonLink>
          </div>
        </div>
      </Container>
    );
  }

  const { intent } = validation;
  const cabinLabel = dictionary.search.options.cabin[intent.cabinClass];
  const flexibilityLabel =
    dictionary.search.dates.flexible[FLEX_LABEL_KEY[intent.flexibilityDays]];

  if (offerState.status === "idle" || offerState.status === "loading") {
    return (
      <Container className="py-8 lg:py-10">
        <ResultsLoadingSkeleton labels={labels} />
      </Container>
    );
  }

  const sortedOffers =
    offerState.status === "ready" ? sortOffers(offerState.offers, sort) : [];

  const sortLabel = {
    best: labels.sort.best,
    cheapest: labels.sort.cheapest,
    fastest: labels.sort.fastest,
  }[sort];
  const liveAnnouncement =
    offerState.status === "ready"
      ? formatTemplate(labels.sort.announcement, {
          count: formatLocaleNumber(sortedOffers.length, locale),
          sort: sortLabel,
        })
      : "";

  return (
    <Container className="flex flex-col gap-6 py-8 lg:py-10">
      <SearchSummary
        intent={intent}
        labels={labels}
        cabinLabel={cabinLabel}
        flexibilityLabel={flexibilityLabel}
        editSearchHref={flightsHref}
      />

      <Alert tone="brand">
        <p className="font-semibold">{labels.disclosure.title}</p>
        <ul className="mt-1.5 list-disc ps-4">
          {labels.disclosure.points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      </Alert>

      {offerState.status === "error" ? (
        <div
          role="alert"
          className="border-danger/25 bg-danger-subtle rounded-2xl border p-6 text-center"
        >
          <h1
            ref={errorHeadingRef}
            tabIndex={-1}
            className="text-foreground text-base font-semibold focus:outline-none"
          >
            {labels.error.title}
          </h1>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button
              variant="primary"
              onClick={() => setRetryToken((token) => token + 1)}
            >
              {labels.error.retry}
            </Button>
            <ButtonLink href={flightsHref} variant="secondary">
              {labels.editSearch}
            </ButtonLink>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1
              ref={resultsHeadingRef}
              tabIndex={-1}
              className="text-foreground text-xl font-bold focus:outline-none"
            >
              {labels.heading}
              <span className="text-foreground-muted ms-2 text-sm font-medium">
                {formatResultCount(
                  offerState.status === "ready" ? sortedOffers.length : 0,
                  locale,
                  labels.resultCount,
                )}
              </span>
            </h1>
          </div>

          <span role="status" aria-live="polite" className="sr-only">
            {liveAnnouncement}
          </span>

          {offerState.status === "empty" ? (
            <div className="border-border bg-surface-subtle rounded-2xl border px-5 py-10 text-center">
              <p className="text-foreground text-base font-semibold">
                {labels.empty.title}
              </p>
              <p className="text-foreground-muted mt-2 text-sm">
                {labels.empty.description}
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <ButtonLink href={flightsHref} variant="primary">
                  {labels.empty.changeDates}
                </ButtonLink>
                <ButtonLink href={flightsHref} variant="secondary">
                  {labels.empty.changeDestination}
                </ButtonLink>
                <ButtonLink href={flightsHref} variant="ghost">
                  {labels.editSearch}
                </ButtonLink>
              </div>
            </div>
          ) : (
            <>
              <SortControl
                value={sort}
                onChange={setSort}
                labels={labels.sort}
                name={sortGroupName}
              />

              <div className="flex flex-col gap-4">
                {sortedOffers.map((offer) => (
                  <ResultCard
                    key={offer.id}
                    offer={offer}
                    intent={intent}
                    labels={labels}
                    cabinLabel={cabinLabel}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}

      <AffiliateDisclosure labels={dictionary.affiliate} variant="inline" />
    </Container>
  );
}
