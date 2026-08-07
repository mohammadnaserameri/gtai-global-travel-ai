import "../server-only";

import type { TravelImageAsset } from "../../features/travel-images/travel-image-types";

interface CacheEntry {
  readonly asset: TravelImageAsset;
  readonly expiresAt: number;
}

export interface TravelImageMetadataCache {
  get(key: string): TravelImageAsset | null;
  set(key: string, asset: TravelImageAsset, ttlMs?: number): void;
  delete(key: string): void;
  clear(): void;
  size(): number;
}

export class MemoryTravelImageMetadataCache implements TravelImageMetadataCache {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly clock: () => number;
  private readonly maximumEntries: number;
  private readonly defaultTtlMs: number;

  constructor(
    options: {
      readonly clock?: () => number;
      readonly maximumEntries?: number;
      readonly defaultTtlMs?: number;
    } = {},
  ) {
    this.clock = options.clock ?? Date.now;
    this.maximumEntries = options.maximumEntries ?? 256;
    this.defaultTtlMs = options.defaultTtlMs ?? 86_400_000;
  }

  get(key: string): TravelImageAsset | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= this.clock()) {
      this.entries.delete(key);
      return null;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.asset;
  }

  set(key: string, asset: TravelImageAsset, ttlMs = this.defaultTtlMs): void {
    this.entries.delete(key);
    this.entries.set(key, {
      asset,
      expiresAt: this.clock() + Math.max(1, ttlMs),
    });
    while (this.entries.size > this.maximumEntries) {
      const oldest = this.entries.keys().next().value;
      if (typeof oldest !== "string") break;
      this.entries.delete(oldest);
    }
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }

  size(): number {
    return this.entries.size;
  }
}

export const travelImageMetadataCache = new MemoryTravelImageMetadataCache();
