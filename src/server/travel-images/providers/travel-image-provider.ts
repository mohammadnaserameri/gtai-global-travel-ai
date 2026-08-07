import "../../server-only";

import type {
  TravelImageAsset,
  TravelImageProviderId,
} from "../../../features/travel-images/travel-image-types";

export interface TravelImageProviderSearchOptions {
  readonly forceRefresh?: boolean;
  readonly signal?: AbortSignal;
}

export interface TravelImageProvider {
  readonly providerId: Exclude<TravelImageProviderId, "gtai-static">;
  search(
    query: string,
    options?: TravelImageProviderSearchOptions,
  ): Promise<readonly TravelImageAsset[]>;
}

export function safeProviderFetchInit(
  options: TravelImageProviderSearchOptions = {},
): RequestInit & { readonly next?: { readonly revalidate: number } } {
  return options.forceRefresh
    ? { cache: "no-store", signal: options.signal ?? AbortSignal.timeout(4_500) }
    : {
        next: { revalidate: 86_400 },
        signal: options.signal ?? AbortSignal.timeout(4_500),
      };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readString(
  record: Record<string, unknown>,
  key: string,
): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function readNumber(
  record: Record<string, unknown>,
  key: string,
): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
