import "../../server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { withViatorWeeklyCache } from "./viator-cache";
import { mapViatorLocale, resolveViatorConfiguration } from "./viator-config";
import { requestViator, ViatorProviderError } from "./viator-client";
import type {
  ViatorAvailabilitySummary,
  ViatorDestination,
  ViatorImage,
  ViatorProductDetails,
  ViatorProductSummary,
  ViatorSearchInput,
  ViatorSearchResult,
  ViatorTag,
} from "./viator-types";

type RecordValue = Record<string, unknown>;
const VIATOR_REDIRECT_HOSTS = new Set([
  "viator.com",
  "www.viator.com",
  "shop.live.rc.viator.com",
]);
const MAX_DESTINATIONS = 10_000;
const MAX_TAGS = 5_000;

function record(value: unknown): RecordValue | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as RecordValue)
    : null;
}

function text(value: unknown, max = 2_000): string | null {
  if (typeof value !== "string") return null;
  const clean = value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return clean && clean.length <= max ? clean : clean.slice(0, max).trim() || null;
}

function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function integer(value: unknown): number | null {
  const result = number(value);
  return result !== null && Number.isInteger(result) ? result : null;
}

function strings(value: unknown, max = 100): readonly string[] {
  return Array.isArray(value)
    ? value
        .map((item) => text(item, 256))
        .filter((item): item is string => Boolean(item))
        .slice(0, max)
    : [];
}

function numericIds(value: unknown, max = 100): readonly number[] {
  return Array.isArray(value)
    ? value
        .map(integer)
        .filter((item): item is number => item !== null && item >= 0)
        .slice(0, max)
    : [];
}

function validProductCode(value: string): boolean {
  return /^[A-Za-z0-9_-]{2,80}$/.test(value);
}

function validDate(value: string | undefined): boolean {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value
  );
}

function normalizeImage(value: unknown): ViatorImage | null {
  const image = record(value);
  if (!image) return null;
  const variants = Array.isArray(image.variants) ? image.variants : [];
  const candidates = variants
    .map(record)
    .filter((item): item is RecordValue => item !== null);
  const selected = candidates.sort(
    (a, b) => (number(b.width) ?? 0) - (number(a.width) ?? 0),
  )[0];
  const src = text(selected?.url ?? image.url, 2_048);
  const width = integer(selected?.width ?? image.width);
  const height = integer(selected?.height ?? image.height);
  if (!src || !width || !height || width < 100 || height < 100) return null;
  try {
    const url = new URL(src);
    if (url.protocol !== "https:" || url.username || url.password) return null;
  } catch {
    return null;
  }
  return Object.freeze({ src, width, height });
}

function normalizeDuration(
  value: unknown,
): ViatorProductSummary["durationMinutes"] {
  const duration = record(value);
  if (!duration) return null;
  const fixed = integer(duration.fixedDurationInMinutes);
  const from = integer(duration.variableDurationFromMinutes) ?? fixed;
  const to = integer(duration.variableDurationToMinutes) ?? fixed;
  return from !== null && to !== null && from >= 0 && to >= from
    ? Object.freeze({ from, to })
    : null;
}

function normalizeProduct(value: unknown): ViatorProductSummary | null {
  const product = record(value);
  const productCode = text(product?.productCode, 80);
  const title = text(product?.title, 300);
  if (!product || !productCode || !validProductCode(productCode) || !title)
    return null;
  const images = (Array.isArray(product.images) ? product.images : [])
    .map(normalizeImage)
    .filter((item): item is ViatorImage => item !== null)
    .slice(0, 12);
  const reviews = record(product.reviews);
  const pricing = record(product.pricing);
  const pricingSummary = record(pricing?.summary);
  const flags = strings(product.flags);
  const destinationRefs = (
    Array.isArray(product.destinations) ? product.destinations : []
  )
    .map(record)
    .map((item) => text(item?.ref, 32))
    .filter((item): item is string => Boolean(item));
  return Object.freeze({
    productCode,
    title,
    description: text(product.description, 1_200),
    images: Object.freeze(images),
    rating: number(reviews?.combinedAverageRating),
    reviewCount: integer(reviews?.totalReviews),
    fromPrice: number(pricingSummary?.fromPrice),
    currency: text(pricingSummary?.currency, 3) ?? text(pricing?.currency, 3),
    tags: Object.freeze(numericIds(product.tags)),
    destinations: Object.freeze(destinationRefs),
    durationMinutes: normalizeDuration(
      record(product.itinerary)?.duration ?? product.duration,
    ),
    freeCancellation: flags.includes("FREE_CANCELLATION"),
  });
}

function normalizeNamedList(value: unknown): readonly string[] {
  return (Array.isArray(value) ? value : [])
    .map(record)
    .map((item) => text(item?.description ?? item?.otherDescription, 500))
    .filter((item): item is string => Boolean(item))
    .slice(0, 20);
}

function normalizeDetails(value: unknown): ViatorProductDetails | null {
  const summary = normalizeProduct(value);
  const product = record(value);
  if (!summary || !product) return null;
  const itinerary = record(product.itinerary);
  const logistics = record(product.logistics);
  const travelerPickup = record(logistics?.travelerPickup);
  const cancellation = record(product.cancellationPolicy);
  const options = (
    Array.isArray(product.productOptions) ? product.productOptions : []
  )
    .map(record)
    .map((option) => {
      const code = text(option?.productOptionCode, 80);
      const title = text(option?.title ?? option?.description, 240);
      return code && title ? Object.freeze({ code, title }) : null;
    })
    .filter(
      (item): item is Readonly<{ code: string; title: string }> => item !== null,
    )
    .slice(0, 20);
  return Object.freeze({
    ...summary,
    description: text(product.description, 8_000),
    inclusions: Object.freeze(normalizeNamedList(product.inclusions)),
    exclusions: Object.freeze(normalizeNamedList(product.exclusions)),
    itinerarySummary: text(itinerary?.itineraryType, 80),
    logisticsSummary: text(
      travelerPickup?.pickupOptionType ?? logistics?.start,
      300,
    ),
    cancellationSummary: text(cancellation?.type ?? cancellation?.description, 500),
    productOptions: Object.freeze(options),
  });
}

function normalizeDestination(value: unknown): ViatorDestination | null {
  const item = record(value);
  const destinationId = integer(item?.destinationId);
  const name = text(item?.name, 200);
  const type = text(item?.type, 80);
  if (destinationId === null || destinationId < 1 || !name || !type) return null;
  const center = record(item?.center);
  const latitude = number(center?.latitude);
  const longitude = number(center?.longitude);
  return Object.freeze({
    destinationId: String(destinationId),
    name,
    type,
    parentDestinationId:
      integer(item?.parentDestinationId) === null
        ? null
        : String(integer(item?.parentDestinationId)),
    defaultCurrencyCode: text(item?.defaultCurrencyCode, 3),
    timeZone: text(item?.timeZone, 100),
    coordinates:
      latitude !== null && longitude !== null
        ? Object.freeze({ latitude, longitude })
        : null,
  });
}

function normalizeTag(value: unknown): ViatorTag | null {
  const item = record(value);
  const tagId = integer(item?.tagId);
  let name = text(item?.name ?? item?.tagName, 200);
  if (!name && Array.isArray(item?.allNames)) {
    name =
      item.allNames
        .map(record)
        .map((entry) => text(entry?.name, 200))
        .find(Boolean) ?? null;
  }
  return tagId !== null && tagId > 0 && name
    ? Object.freeze({
        tagId,
        name,
        parentTagIds: Object.freeze(numericIds(item?.parentTagIds, 20)),
      })
    : null;
}

export async function getViatorDestinations(
  locale: string,
): Promise<readonly ViatorDestination[]> {
  const language = mapViatorLocale(locale);
  return withViatorWeeklyCache(`destinations:${language}`, async () => {
    const raw = await requestViator("/destinations", { locale: language });
    const container = record(raw);
    const source = Array.isArray(raw)
      ? raw
      : Array.isArray(container?.destinations)
        ? container.destinations
        : null;
    if (!source) throw new ViatorProviderError("malformedResponse", 200, false);
    const result = source
      .map(normalizeDestination)
      .filter((item): item is ViatorDestination => item !== null)
      .slice(0, MAX_DESTINATIONS);
    if (!result.length)
      throw new ViatorProviderError("malformedResponse", 200, false);
    return Object.freeze(result);
  });
}

export async function getViatorTags(locale: string): Promise<readonly ViatorTag[]> {
  const language = mapViatorLocale(locale);
  return withViatorWeeklyCache(`tags:${language}`, async () => {
    const raw = await requestViator("/products/tags", { locale: language });
    const container = record(raw);
    const source = Array.isArray(raw)
      ? raw
      : Array.isArray(container?.tags)
        ? container.tags
        : null;
    if (!source) throw new ViatorProviderError("malformedResponse", 200, false);
    const result = source
      .map(normalizeTag)
      .filter((item): item is ViatorTag => item !== null)
      .slice(0, MAX_TAGS);
    if (!result.length)
      throw new ViatorProviderError("malformedResponse", 200, false);
    return Object.freeze(result);
  });
}

export function isValidViatorSearchInput(input: ViatorSearchInput): boolean {
  return (
    /^\d{1,10}$/.test(input.destinationId) &&
    validDate(input.startDate) &&
    validDate(input.endDate) &&
    (!input.startDate || !input.endDate || input.endDate >= input.startDate) &&
    (input.tags?.every((tag) => Number.isInteger(tag) && tag > 0) ?? true) &&
    (input.lowestPrice === undefined ||
      (Number.isFinite(input.lowestPrice) && input.lowestPrice >= 0)) &&
    (input.highestPrice === undefined ||
      (Number.isFinite(input.highestPrice) && input.highestPrice >= 0)) &&
    (input.lowestPrice === undefined ||
      input.highestPrice === undefined ||
      input.highestPrice >= input.lowestPrice) &&
    /^[A-Z]{3}$/.test(input.currency ?? "USD") &&
    (input.page ?? 1) >= 1 &&
    (input.page ?? 1) <= 100 &&
    (input.count ?? 12) >= 1 &&
    (input.count ?? 12) <= 50
  );
}

export async function searchViatorProducts(
  input: ViatorSearchInput,
  locale: string,
): Promise<ViatorSearchResult> {
  if (!isValidViatorSearchInput(input))
    throw new ViatorProviderError("upstreamRejected", 400, false);
  const page = Math.trunc(input.page ?? 1);
  const count = Math.trunc(input.count ?? 12);
  const filtering: RecordValue = { destination: input.destinationId };
  if (input.tags?.length) filtering.tags = input.tags.slice(0, 20);
  if (input.startDate) filtering.startDate = input.startDate;
  if (input.endDate) filtering.endDate = input.endDate;
  if (input.lowestPrice !== undefined) filtering.lowestPrice = input.lowestPrice;
  if (input.highestPrice !== undefined) filtering.highestPrice = input.highestPrice;
  if (input.freeCancellation) filtering.flags = ["FREE_CANCELLATION"];
  const raw = await requestViator("/products/search", {
    method: "POST",
    locale: mapViatorLocale(locale),
    body: {
      filtering,
      sorting: { sort: input.sort ?? "DEFAULT", order: input.order ?? "ASCENDING" },
      pagination: { start: (page - 1) * count + 1, count },
      currency: input.currency ?? "USD",
    },
  });
  const container = record(raw);
  const source = Array.isArray(container?.products) ? container.products : null;
  if (!source) throw new ViatorProviderError("malformedResponse", 200, false);
  const products = source.map(normalizeProduct);
  const accepted = products.filter(
    (item): item is ViatorProductSummary => item !== null,
  );
  return Object.freeze({
    products: Object.freeze(accepted),
    totalCount: integer(container?.totalCount) ?? accepted.length,
    page,
    count,
    rejectedCount: products.length - accepted.length,
  });
}

export async function getViatorProductDetails(
  productCode: string,
  locale: string,
): Promise<ViatorProductDetails> {
  if (!validProductCode(productCode))
    throw new ViatorProviderError("upstreamRejected", 400, false);
  const raw = await requestViator(`/products/${encodeURIComponent(productCode)}`, {
    locale: mapViatorLocale(locale),
  });
  const details = normalizeDetails(raw);
  if (!details) throw new ViatorProviderError("malformedResponse", 200, false);
  return details;
}

export async function getViatorAvailabilitySchedule(
  productCode: string,
  locale: string,
): Promise<ViatorAvailabilitySummary> {
  if (!validProductCode(productCode))
    throw new ViatorProviderError("upstreamRejected", 400, false);
  try {
    const raw = await requestViator(
      `/availability/schedules/${encodeURIComponent(productCode)}`,
      { locale: mapViatorLocale(locale) },
    );
    const schedule = record(raw);
    if (!schedule) throw new ViatorProviderError("malformedResponse", 200, false);
    const items = Array.isArray(schedule.bookableItems)
      ? schedule.bookableItems.map(record).filter(Boolean)
      : [];
    const seasonCount = items.reduce(
      (sum, item) => sum + (Array.isArray(item?.seasons) ? item.seasons.length : 0),
      0,
    );
    return Object.freeze({
      supported: true,
      productCode,
      currency: text(schedule.currency, 3),
      optionCount: items.length,
      seasonCount,
      hasScheduleData: items.length > 0 && seasonCount > 0,
    });
  } catch (error) {
    if (
      error instanceof ViatorProviderError &&
      (error.httpStatus === 403 || error.httpStatus === 404)
    ) {
      return Object.freeze({
        supported: false,
        productCode,
        currency: null,
        optionCount: 0,
        seasonCount: 0,
        hasScheduleData: false,
      });
    }
    throw error;
  }
}

function signReference(payload: string, key: string): string {
  return createHmac("sha256", key)
    .update(`viator-product:${payload}`)
    .digest("base64url");
}

export function createViatorProductReference(
  productCode: string,
  now = Date.now(),
): string | null {
  const configuration = resolveViatorConfiguration();
  if (
    !configuration.active ||
    !configuration.apiKey ||
    !validProductCode(productCode)
  )
    return null;
  const payload = Buffer.from(
    JSON.stringify({ code: productCode, expires: now + 30 * 60_000 }),
  ).toString("base64url");
  return `${payload}.${signReference(payload, configuration.apiKey)}`;
}

export function resolveViatorProductReference(
  reference: string,
  now = Date.now(),
): string | null {
  const configuration = resolveViatorConfiguration();
  if (!configuration.active || !configuration.apiKey || reference.length > 512)
    return null;
  const [payload, signature, extra] = reference.split(".");
  if (!payload || !signature || extra) return null;
  const expected = signReference(payload, configuration.apiKey);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const data = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as unknown;
    const item = record(data);
    const code = text(item?.code, 80);
    const expires = integer(item?.expires);
    return code && validProductCode(code) && expires !== null && expires >= now
      ? code
      : null;
  } catch {
    return null;
  }
}

export async function resolveViatorAffiliateDestination(
  productCode: string,
  locale: string,
): Promise<URL | null> {
  if (!validProductCode(productCode)) return null;
  const raw = await requestViator(`/products/${encodeURIComponent(productCode)}`, {
    locale: mapViatorLocale(locale),
  });
  const item = record(raw);
  const productUrl = text(item?.productUrl, 2_048);
  if (!productUrl) return null;
  try {
    const url = new URL(productUrl);
    return url.protocol === "https:" &&
      VIATOR_REDIRECT_HOSTS.has(url.hostname) &&
      !url.username &&
      !url.password
      ? url
      : null;
  } catch {
    return null;
  }
}

export function isAllowedViatorRedirectHost(hostname: string): boolean {
  return VIATOR_REDIRECT_HOSTS.has(hostname.toLowerCase());
}
