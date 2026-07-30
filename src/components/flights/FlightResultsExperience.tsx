"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

import type { Dictionary } from "@/i18n/get-dictionary";
import type { FlexibilityDays } from "@/features/dates/date-types";
import {
  parseRawSearchIntentParams,
  serializeSearchIntent,
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
import { sortOffers } from "@/features/flights/flight-offer-ranking";
import { computeHighlights } from "@/features/flights/flight-offer-highlights";
import { applyFilters } from "@/features/flights/filters/flight-filter-application";
import {
  durationBounds,
  priceBounds,
} from "@/features/flights/filters/flight-filter-facets";
import {
  buildResultsSearchParams,
  parseResultsViewState,
  sanitizeFiltersAgainstOffers,
} from "@/features/flights/filters/flight-filter-url";
import {
  EMPTY_FILTER_STATE,
  type ResultsViewState,
} from "@/features/flights/filters/flight-filter-types";
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
import { FlightFilters } from "@/components/flights/filters/FlightFilters";

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
 * documented Search Intent parameter contract (see `search-intent-url.ts`)
 * and outside the Results view-state contract (see `flight-filter-url.ts`).
 */
function readDevScenario(rawParamsString: string): string | null {
  if (process.env.NODE_ENV === "production") return null;
  return new URLSearchParams(rawParamsString).get("__devScenario");
}

function createRepository(devScenario: string | null): FlightOfferRepository {
  const scenario: DemoOfferScenario | null =
    devScenario === "empty" || devScenario === "error" ? devScenario : null;
  if (scenario) return new DemoFlightOfferRepository({ scenario });
  return new DemoFlightOfferRepository();
}

/**
 * Owns the whole Results journey: parses and validates the URL, fetches
 * demonstration offers, and renders exactly one of five states — invalid,
 * the Everywhere carve-out, loading, error/empty, or a filtered, sorted
 * result list. Every state exposes exactly one `<h1>`.
 *
 * Filtering and sorting are Results *view-state* — parsed from the URL
 * separately from the Search Intent — and are applied entirely in-memory
 * against the already-fetched complete offer set. The repository fetch below
 * is keyed only on the normalized Search Intent (via its own canonical
 * re-serialization) plus the retry token and the dev-only scenario escape
 * hatch: it deliberately does **not** depend on the raw query string, so a
 * filter or sort change — which only ever changes other query parameters —
 * can never trigger a refetch.
 */
export function FlightResultsExperience({
  locale,
  dictionary,
}: FlightResultsExperienceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const paramsString = searchParams.toString();
  const labels = dictionary.flightResults;

  const validation = resolve(paramsString, locale);
  const intentKey = validation.ok
    ? serializeSearchIntent(validation.intent).toString()
    : null;
  const devScenario = readDevScenario(paramsString);

  /**
   * The fetch effect only ever writes here from inside its `.then`/`.catch`
   * callbacks — genuinely asynchronous completions, never a synchronous
   * `setState` at the top of the effect body. Tagging each write with the
   * exact key it answers means a result from a superseded search is simply
   * ignored during render rather than needing an explicit reset.
   */
  const [fetched, setFetched] = useState<{
    key: string;
    result: FetchedState;
  } | null>(null);
  /** Bumped by Retry to re-run the fetch effect without changing the URL. */
  const [retryToken, setRetryToken] = useState(0);

  const invalidHeadingRef = useRef<HTMLHeadingElement>(null);
  const errorHeadingRef = useRef<HTMLHeadingElement>(null);
  const resultsHeadingRef = useRef<HTMLHeadingElement>(null);
  const sortGroupName = useId();

  const fetchKey =
    intentKey !== null ? `${intentKey}#${retryToken}#${devScenario ?? ""}` : null;
  // Memoized so the canonicalization effect below — which depends on
  // `offerState` — only re-runs when the fetch itself actually resolves
  // (or the key changes), never on an unrelated render.
  const offerState: OfferState = useMemo(() => {
    if (intentKey === null) return { status: "idle" };
    return fetched && fetched.key === fetchKey
      ? fetched.result
      : { status: "loading" };
  }, [intentKey, fetched, fetchKey]);

  /**
   * Mirrors the codebase's established "adjust state during render" pattern
   * (the same one previously used to reset Sort on a search change): the
   * committed intent object only ever changes identity when `intentKey`
   * itself changes, never on a filter/sort-only URL change, so the fetch
   * effect below can safely depend on it without re-running for the wrong
   * reason.
   */
  const [syncedIntentKey, setSyncedIntentKey] = useState(intentKey);
  const [committedIntent, setCommittedIntent] = useState(
    validation.ok ? validation.intent : null,
  );
  if (syncedIntentKey !== intentKey) {
    setSyncedIntentKey(intentKey);
    setCommittedIntent(validation.ok ? validation.intent : null);
  }

  useEffect(() => {
    if (committedIntent === null) return;

    const key = `${serializeSearchIntent(committedIntent).toString()}#${retryToken}#${devScenario ?? ""}`;
    const controller = new AbortController();
    const repository = createRepository(devScenario);

    repository
      .search(committedIntent, controller.signal)
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
  }, [committedIntent, retryToken, devScenario]);

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

  /**
   * Canonicalizes the Results URL once the complete offer set is known: a
   * duplicated/unknown Filter value, a numeric bound outside the current
   * offer set's range, or non-canonical CSV ordering all get sanitized the
   * same way `commitViewState` already builds a URL — this just performs
   * that same build once, automatically, and only replaces the address bar
   * when the result actually differs. Never runs before offers exist, never
   * touches the Search Intent parameters (copied through unchanged by
   * `buildResultsSearchParams`), and never adds a history entry or scrolls.
   * `offerState` is a stable reference across renders that don't involve a
   * new fetch (it is `fetched.result`, untouched React state), so this only
   * re-runs when the fetch genuinely resolves or the URL/path changes —
   * never once per unrelated render — and it is naturally self-terminating:
   * once the address bar matches the canonical form, the comparison below
   * finds no difference and stops.
   */
  useEffect(() => {
    if (offerState.status !== "ready") return;
    const offers = offerState.offers;
    const currentParams = new URLSearchParams(paramsString);
    const raw = parseResultsViewState(currentParams);
    const sanitized = sanitizeFiltersAgainstOffers(raw.filters, offers);
    const bounds = {
      priceMax: priceBounds(offers).max,
      durationMax: durationBounds(offers).max,
    };
    const canonicalParams = buildResultsSearchParams(
      currentParams,
      { sort: raw.sort, filters: sanitized },
      bounds,
    );
    const canonicalString = canonicalParams.toString();
    if (canonicalString !== paramsString) {
      router.replace(`${pathname}?${canonicalString}`, { scroll: false });
    }
  }, [offerState, paramsString, pathname, router]);

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

  const repositoryOffers = offerState.status === "ready" ? offerState.offers : [];
  const rawViewState = parseResultsViewState(new URLSearchParams(paramsString));
  const sanitizedFilters =
    offerState.status === "ready"
      ? sanitizeFiltersAgainstOffers(rawViewState.filters, repositoryOffers)
      : rawViewState.filters;
  const viewState: ResultsViewState = {
    sort: rawViewState.sort,
    filters: sanitizedFilters,
  };

  const filteredOffers = applyFilters(repositoryOffers, sanitizedFilters);
  const sortedOffers = sortOffers(filteredOffers, viewState.sort);
  // Deterministic per-offer "why this option" labels, computed fresh from
  // the currently-shown (filtered) set — never from the whole repository —
  // so a highlight always describes the offer's standing among what the
  // visitor can actually see right now.
  const highlights = computeHighlights(filteredOffers);

  function commitViewState(next: ResultsViewState) {
    const currentParams = new URLSearchParams(paramsString);
    const bounds =
      repositoryOffers.length > 0
        ? {
            priceMax: priceBounds(repositoryOffers).max,
            durationMax: durationBounds(repositoryOffers).max,
          }
        : { priceMax: 0, durationMax: 0 };
    const nextParams = buildResultsSearchParams(currentParams, next, bounds);
    const nextQueryString = nextParams.toString();
    // Every user-initiated view-state change (a checkbox, a range commit, a
    // Sort change, a chip removal, Clear all, or the Mobile Sheet's Apply)
    // goes through this one function. A no-op commit — e.g. Apply with an
    // unchanged draft, or a control that re-selects its own current value —
    // must not push a history entry or touch the route at all; comparing the
    // canonical next query string against the current one covers every
    // caller identically, without each filter/sort control having to guard
    // itself. `scroll: false` keeps the visitor exactly where they were on
    // the page for every navigation that does happen, since all of these
    // occur on the Results page they are already looking at.
    if (nextQueryString === paramsString) return;
    router.push(`${pathname}?${nextQueryString}`, { scroll: false });
  }

  const sortLabel = {
    best: labels.sort.best,
    cheapest: labels.sort.cheapest,
    fastest: labels.sort.fastest,
  }[viewState.sort];
  const liveAnnouncement =
    offerState.status === "ready"
      ? `${formatTemplate(labels.sort.announcement, {
          count: formatLocaleNumber(sortedOffers.length, locale),
          sort: sortLabel,
        })} ${
          repositoryOffers.length !== filteredOffers.length
            ? formatTemplate(labels.filteredCountAnnouncement, {
                filtered: formatLocaleNumber(filteredOffers.length, locale),
                total: formatLocaleNumber(repositoryOffers.length, locale),
              })
            : ""
        }`.trim()
      : "";

  const countText =
    offerState.status === "ready" &&
    repositoryOffers.length !== filteredOffers.length
      ? filteredOffers.length === 1
        ? formatTemplate(labels.filteredCount.one, {
            filtered: formatLocaleNumber(filteredOffers.length, locale),
            total: formatLocaleNumber(repositoryOffers.length, locale),
          })
        : formatTemplate(labels.filteredCount.other, {
            filtered: formatLocaleNumber(filteredOffers.length, locale),
            total: formatLocaleNumber(repositoryOffers.length, locale),
          })
      : formatResultCount(
          offerState.status === "ready" ? repositoryOffers.length : 0,
          locale,
          labels.resultCount,
        );

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
                {countText}
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
            <FlightFilters
              offers={repositoryOffers}
              viewState={viewState}
              onCommit={commitViewState}
              intent={intent}
              labels={labels}
              sortControl={
                <SortControl
                  value={viewState.sort}
                  onChange={(nextSort) =>
                    commitViewState({ sort: nextSort, filters: sanitizedFilters })
                  }
                  labels={labels.sort}
                  name={sortGroupName}
                />
              }
            >
              {filteredOffers.length === 0 ? (
                <div className="border-border bg-surface-subtle rounded-2xl border px-5 py-10 text-center">
                  <h2 className="text-foreground text-base font-semibold">
                    {labels.filteredEmpty.title}
                  </h2>
                  <div className="mt-5 flex flex-wrap justify-center gap-2">
                    <Button
                      variant="primary"
                      onClick={() =>
                        commitViewState({
                          sort: viewState.sort,
                          filters: EMPTY_FILTER_STATE,
                        })
                      }
                    >
                      {labels.filteredEmpty.clearAll}
                    </Button>
                    <ButtonLink href={flightsHref} variant="secondary">
                      {labels.editSearch}
                    </ButtonLink>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {sortedOffers.map((offer) => (
                    <ResultCard
                      key={offer.id}
                      offer={offer}
                      intent={intent}
                      labels={labels}
                      cabinLabel={cabinLabel}
                      highlight={highlights.get(offer.id)}
                    />
                  ))}
                </div>
              )}
            </FlightFilters>
          )}
        </>
      )}

      <AffiliateDisclosure labels={dictionary.affiliate} variant="inline" />
    </Container>
  );
}
