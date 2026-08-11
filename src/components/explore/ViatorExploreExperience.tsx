"use client";

import Image from "next/image";
import { useMemo, useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { InputShell } from "@/components/ui/InputShell";
import { ModalShell } from "@/components/ui/ModalShell";
import { SelectShell } from "@/components/ui/SelectShell";
import type { Dictionary } from "@/i18n/get-dictionary";
import type {
  ViatorAvailabilitySummary,
  ViatorDestination,
  ViatorProductDetails,
  ViatorProductSummary,
  ViatorSearchResult,
  ViatorTag,
} from "@/server/affiliate/viator/viator-types";

interface ClientProduct extends ViatorProductSummary {
  readonly redirectRef: string | null;
}
interface ClientSearchResult extends Omit<ViatorSearchResult, "products"> {
  readonly products: readonly ClientProduct[];
}
interface DetailsResponse {
  readonly details: ViatorProductDetails;
  readonly availability: ViatorAvailabilitySummary;
  readonly redirectRef: string | null;
}

interface Props {
  dictionary: Dictionary;
  locale: string;
  active: boolean;
  destinations: readonly ViatorDestination[];
  tags: readonly ViatorTag[];
  bootstrapFailed: boolean;
}

const inputClass =
  "border-border bg-surface text-foreground min-h-12 w-full rounded-lg border px-3.5 text-sm focus:border-brand-400 focus:outline-none";

function isSearchResult(
  value: unknown,
): value is { ok: true; result: ClientSearchResult } {
  if (typeof value !== "object" || value === null) return false;
  const root = value as Record<string, unknown>;
  if (root.ok !== true || typeof root.result !== "object" || root.result === null)
    return false;
  const result = root.result as Record<string, unknown>;
  return Array.isArray(result.products) && typeof result.totalCount === "number";
}

function isDetailsResponse(
  value: unknown,
): value is { ok: true } & DetailsResponse {
  if (typeof value !== "object" || value === null) return false;
  const root = value as Record<string, unknown>;
  return (
    root.ok === true &&
    typeof root.details === "object" &&
    root.details !== null &&
    typeof (root.details as Record<string, unknown>).productCode === "string"
  );
}

function durationLabel(
  product: ViatorProductSummary,
  labels: Dictionary["viatorExplore"],
): string | null {
  const duration = product.durationMinutes;
  if (!duration) return null;
  return duration.from === duration.to
    ? `${labels.duration}: ${duration.from} ${labels.minutes}`
    : `${labels.duration}: ${duration.from}–${duration.to} ${labels.minutes}`;
}

export function ViatorExploreExperience({
  dictionary,
  locale,
  active,
  destinations,
  tags,
  bootstrapFailed,
}: Props) {
  const labels = dictionary.viatorExplore;
  const [destinationName, setDestinationName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [tag, setTag] = useState("");
  const [minimumPrice, setMinimumPrice] = useState("");
  const [maximumPrice, setMaximumPrice] = useState("");
  const [freeCancellation, setFreeCancellation] = useState(false);
  const [sort, setSort] = useState("DEFAULT:ASCENDING");
  const [currency, setCurrency] = useState("USD");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<ClientSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [details, setDetails] = useState<DetailsResponse | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsFailed, setDetailsFailed] = useState(false);

  const destination = useMemo(
    () =>
      destinations.find(
        (item) =>
          item.name.localeCompare(destinationName, undefined, {
            sensitivity: "base",
          }) === 0,
      ),
    [destinationName, destinations],
  );
  const destinationOptions = useMemo(
    () =>
      destinations
        .filter((item) =>
          ["CITY", "TOWN", "REGION", "COUNTRY", "ISLAND", "NATIONAL_PARK"].includes(
            item.type.replace(/ /g, "_"),
          ),
        )
        .slice(0, 4_000),
    [destinations],
  );

  async function runSearch(nextPage = 1): Promise<void> {
    if (!destination || !active) return;
    setLoading(true);
    setFailed(false);
    setPage(nextPage);
    const [sortField, order] = sort.split(":");
    try {
      const response = await fetch("/api/viator/products/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locale,
          search: {
            destinationId: destination.destinationId,
            tags: tag ? [Number(tag)] : undefined,
            startDate: startDate || undefined,
            endDate: endDate || undefined,
            lowestPrice: minimumPrice ? Number(minimumPrice) : undefined,
            highestPrice: maximumPrice ? Number(maximumPrice) : undefined,
            freeCancellation,
            sort: sortField,
            order,
            page: nextPage,
            count: 12,
            currency,
          },
        }),
      });
      const payload = (await response.json()) as unknown;
      if (!response.ok || !isSearchResult(payload))
        throw new Error("safe-search-failure");
      setResult(payload.result);
    } catch {
      setFailed(true);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  async function openDetails(productCode: string): Promise<void> {
    setDetailsOpen(true);
    setDetails(null);
    setDetailsFailed(false);
    try {
      const response = await fetch(
        `/api/viator/products/${encodeURIComponent(productCode)}?locale=${encodeURIComponent(locale)}`,
      );
      const payload = (await response.json()) as unknown;
      if (!response.ok || !isDetailsResponse(payload))
        throw new Error("safe-details-failure");
      setDetails({
        details: payload.details,
        availability: payload.availability,
        redirectRef: payload.redirectRef,
      });
    } catch {
      setDetailsFailed(true);
    }
  }

  if (!active || bootstrapFailed) {
    return (
      <Alert tone="warning" title={labels.unavailableTitle}>
        <p>{labels.unavailableDescription}</p>
      </Alert>
    );
  }

  return (
    <div className="space-y-8">
      <Alert tone="brand" title={labels.liveBadge}>
        <p>{labels.disclosure}</p>
      </Alert>
      <Card padding="lg" className="relative z-10">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void runSearch(1);
          }}
          className="grid gap-4 lg:grid-cols-4"
        >
          <div className="lg:col-span-2">
            <label
              htmlFor="viator-destination"
              className="text-foreground-muted mb-1.5 block text-xs font-semibold tracking-wide uppercase"
            >
              {labels.destination}
            </label>
            <input
              id="viator-destination"
              list="viator-destinations"
              value={destinationName}
              onChange={(event) => setDestinationName(event.target.value)}
              placeholder={labels.destinationPlaceholder}
              className={inputClass}
              required
            />
            <datalist id="viator-destinations">
              {destinationOptions.map((item) => (
                <option key={item.destinationId} value={item.name}>
                  {item.type}
                </option>
              ))}
            </datalist>
            <p className="text-foreground-muted mt-1.5 text-xs">
              {labels.destinationHint}
            </p>
          </div>
          <InputShell
            id="viator-start-date"
            label={labels.startDate}
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
          <InputShell
            id="viator-end-date"
            label={labels.endDate}
            type="date"
            min={startDate || undefined}
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
          />
          <SelectShell
            id="viator-category"
            label={labels.category}
            value={tag}
            onChange={(event) => setTag(event.target.value)}
            options={[
              { value: "", label: labels.allCategories },
              ...tags
                .slice(0, 300)
                .map((item) => ({ value: String(item.tagId), label: item.name })),
            ]}
          />
          <InputShell
            id="viator-minimum-price"
            label={labels.minimumPrice}
            type="number"
            min="0"
            step="1"
            value={minimumPrice}
            onChange={(event) => setMinimumPrice(event.target.value)}
          />
          <InputShell
            id="viator-maximum-price"
            label={labels.maximumPrice}
            type="number"
            min="0"
            step="1"
            value={maximumPrice}
            onChange={(event) => setMaximumPrice(event.target.value)}
          />
          <SelectShell
            id="viator-sort"
            label={labels.sort}
            value={sort}
            onChange={(event) => setSort(event.target.value)}
            options={[
              { value: "DEFAULT:ASCENDING", label: labels.sortDefault },
              { value: "PRICE:ASCENDING", label: labels.sortPriceLow },
              { value: "PRICE:DESCENDING", label: labels.sortPriceHigh },
              { value: "TRAVELER_RATING:DESCENDING", label: labels.sortRating },
            ]}
          />
          <SelectShell
            id="viator-currency"
            label={labels.currency}
            value={currency}
            onChange={(event) => setCurrency(event.target.value)}
            options={["USD", "CAD", "EUR", "GBP", "AUD"].map((value) => ({
              value,
              label: value,
            }))}
          />
          <label className="border-border bg-background-muted flex min-h-12 items-center gap-3 rounded-lg border px-4 lg:col-span-2">
            <input
              type="checkbox"
              checked={freeCancellation}
              onChange={(event) => setFreeCancellation(event.target.checked)}
              className="accent-brand-700 size-4"
            />
            <span className="text-foreground text-sm font-medium">
              {labels.freeCancellation}
            </span>
          </label>
          <div className="flex items-end lg:col-span-2">
            <Button type="submit" disabled={!destination || loading} fullWidth>
              {loading ? labels.searching : labels.search}
            </Button>
          </div>
        </form>
      </Card>

      {failed ? (
        <Alert tone="warning" title={labels.unavailableTitle}>
          <p>{labels.unavailableDescription}</p>
        </Alert>
      ) : null}
      {result ? (
        <section aria-labelledby="viator-results-heading">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h2
              id="viator-results-heading"
              className="text-foreground text-xl font-semibold"
            >
              {labels.resultsTitle}
            </h2>
            <Badge tone="neutral">
              {result.totalCount} {labels.resultCount}
            </Badge>
          </div>
          {result.products.length ? (
            <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {result.products.map((product) => {
                const image = product.images[0];
                return (
                  <Card
                    key={product.productCode}
                    as="li"
                    padding="none"
                    className="flex min-h-full flex-col overflow-hidden"
                  >
                    {image ? (
                      <div className="bg-background-muted relative aspect-[4/3] overflow-hidden">
                        <Image
                          src={image.src}
                          alt={`${labels.imageAlt} ${product.title}`}
                          fill
                          sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
                          className="object-cover"
                        />
                      </div>
                    ) : null}
                    <div className="flex flex-1 flex-col gap-3 p-5">
                      <div className="flex flex-wrap gap-2">
                        {product.freeCancellation ? (
                          <Badge tone="success" size="sm">
                            {labels.freeCancellationBadge}
                          </Badge>
                        ) : null}
                      </div>
                      <h3 className="text-foreground line-clamp-2 font-semibold">
                        {product.title}
                      </h3>
                      <div className="text-foreground-muted flex flex-wrap gap-x-4 gap-y-1 text-sm">
                        {product.rating !== null ? (
                          <span>
                            ★ {product.rating.toFixed(1)} ·{" "}
                            {product.reviewCount ?? 0} {labels.reviews}
                          </span>
                        ) : null}
                        {durationLabel(product, labels) ? (
                          <span>{durationLabel(product, labels)}</span>
                        ) : null}
                      </div>
                      {product.fromPrice !== null && product.currency ? (
                        <p className="text-brand-ink-strong mt-auto text-lg font-semibold">
                          {labels.from} {product.currency}{" "}
                          {product.fromPrice.toFixed(2)}
                        </p>
                      ) : (
                        <div className="mt-auto" />
                      )}
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Button
                          variant="secondary"
                          onClick={() => void openDetails(product.productCode)}
                        >
                          {labels.details}
                        </Button>
                        {product.redirectRef ? (
                          <ButtonLink
                            external
                            href={`/api/outbound/viator/product?ref=${encodeURIComponent(product.redirectRef)}&locale=${encodeURIComponent(locale)}`}
                          >
                            {labels.viewOnViator}
                          </ButtonLink>
                        ) : null}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </ul>
          ) : (
            <Alert tone="info">
              <p>{labels.noResults}</p>
            </Alert>
          )}
          <div className="mt-6 flex justify-center gap-3">
            <Button
              variant="secondary"
              disabled={page <= 1 || loading}
              onClick={() => void runSearch(page - 1)}
            >
              {labels.previous}
            </Button>
            <Button
              variant="secondary"
              disabled={result.products.length < result.count || loading}
              onClick={() => void runSearch(page + 1)}
            >
              {labels.next}
            </Button>
          </div>
        </section>
      ) : null}

      <ModalShell
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        title={details?.details.title ?? labels.details}
        closeLabel={labels.close}
        description={labels.externalBooking}
        className="max-h-[90vh] max-w-3xl overflow-y-auto"
      >
        {detailsFailed ? (
          <Alert tone="warning">
            <p>{labels.detailsUnavailable}</p>
          </Alert>
        ) : details ? (
          <div className="space-y-5">
            {details.details.images[0] ? (
              <div className="relative aspect-video overflow-hidden rounded-xl">
                <Image
                  src={details.details.images[0].src}
                  alt={`${labels.imageAlt} ${details.details.title}`}
                  fill
                  sizes="(max-width: 768px) 100vw, 768px"
                  className="object-cover"
                />
              </div>
            ) : null}
            {details.details.description ? (
              <p className="text-foreground-secondary text-sm leading-relaxed">
                {details.details.description}
              </p>
            ) : null}
            <Alert tone={details.availability.hasScheduleData ? "success" : "info"}>
              <p>
                {details.availability.hasScheduleData
                  ? labels.scheduleAvailable
                  : labels.scheduleUnavailable}
              </p>
            </Alert>
            {details.redirectRef ? (
              <ButtonLink
                external
                fullWidth
                href={`/api/outbound/viator/product?ref=${encodeURIComponent(details.redirectRef)}&locale=${encodeURIComponent(locale)}`}
              >
                {labels.viewOnViator}
              </ButtonLink>
            ) : null}
          </div>
        ) : (
          <p className="text-foreground-muted text-sm">
            {dictionary.common.loading}
          </p>
        )}
      </ModalShell>
    </div>
  );
}
