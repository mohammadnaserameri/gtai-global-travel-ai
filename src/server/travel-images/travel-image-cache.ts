import "../server-only";

import type { TravelImageAsset } from "../../features/travel-images/travel-image-types";

interface CacheEntry {
  readonly assets: readonly TravelImageAsset[];
  readonly expiresAt: number;
}

type MaybePromise<T> = T | Promise<T>;

export interface TravelImageMetadataStore {
  get(key: string): MaybePromise<TravelImageAsset | null>;
  set(key: string, asset: TravelImageAsset, ttlMs?: number): MaybePromise<void>;
  getMany(key: string): MaybePromise<readonly TravelImageAsset[] | null>;
  setMany(
    key: string,
    assets: readonly TravelImageAsset[],
    ttlMs?: number,
  ): MaybePromise<void>;
  delete(key: string): MaybePromise<void>;
  clear(): MaybePromise<void>;
  size(): number;
}

export type TravelImageCacheMode =
  "memory" | "nextFetchCache" | "durable" | "durableUnavailable";

export interface TravelImageCacheRuntimeStatus {
  readonly cacheMode: TravelImageCacheMode;
  readonly durableCacheConfigured: boolean;
  readonly durableCacheActive: boolean;
}

/** Compatibility name retained for the V2.10-A engine constructor. */
export type TravelImageMetadataCache = TravelImageMetadataStore;

export class MemoryTravelImageMetadataCache implements TravelImageMetadataStore {
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
    return this.getMany(key)?.[0] ?? null;
  }

  getMany(key: string): readonly TravelImageAsset[] | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= this.clock()) {
      this.entries.delete(key);
      return null;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.assets;
  }

  set(key: string, asset: TravelImageAsset, ttlMs?: number): void {
    this.setMany(key, [asset], ttlMs);
  }

  setMany(
    key: string,
    assets: readonly TravelImageAsset[],
    ttlMs = this.defaultTtlMs,
  ): void {
    this.entries.delete(key);
    this.entries.set(key, {
      assets: Object.freeze([...assets]),
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

interface DurableCacheEnvironment {
  readonly enabled: boolean;
  readonly url: string | null;
  readonly token: string | null;
}

type Environment = Readonly<Record<string, string | undefined>>;

function safeValue(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function safeDurableUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function resolveDurableCacheEnvironment(
  environment: Environment = process.env,
): DurableCacheEnvironment {
  const url = safeDurableUrl(safeValue(environment.TRAVEL_IMAGE_DURABLE_CACHE_URL));
  const token = safeValue(environment.TRAVEL_IMAGE_DURABLE_CACHE_TOKEN);
  return Object.freeze({
    enabled:
      environment.TRAVEL_IMAGE_DURABLE_CACHE_ENABLED === "true" &&
      url !== null &&
      token !== null,
    url,
    token,
  });
}

const APPROVED_IMAGE_HOSTS = new Set([
  "images.pexels.com",
  "images.unsplash.com",
  "pixabay.com",
  "cdn.pixabay.com",
]);
const APPROVED_SOURCE_HOSTS = new Set([
  "www.pexels.com",
  "pexels.com",
  "www.unsplash.com",
  "unsplash.com",
  "www.pixabay.com",
  "pixabay.com",
]);

function safeHttpsUrl(value: unknown, hosts: ReadonlySet<string>): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && hosts.has(url.hostname) ? value : null;
  } catch {
    return null;
  }
}

function normalizedAsset(value: unknown): TravelImageAsset | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const attribution = record.attribution;
  if (
    typeof attribution !== "object" ||
    attribution === null ||
    Array.isArray(attribution)
  ) {
    return null;
  }
  const attributionRecord = attribution as Record<string, unknown>;
  const src = safeHttpsUrl(record.src, APPROVED_IMAGE_HOSTS);
  const thumbnailSrc = safeHttpsUrl(record.thumbnailSrc, APPROVED_IMAGE_HOSTS);
  const provider = record.provider;
  const width = record.width;
  const height = record.height;
  if (
    !src ||
    !thumbnailSrc ||
    !["pexels", "unsplash", "pixabay"].includes(String(provider)) ||
    typeof width !== "number" ||
    !Number.isFinite(width) ||
    typeof height !== "number" ||
    !Number.isFinite(height) ||
    typeof record.id !== "string" ||
    typeof record.alt !== "string" ||
    typeof record.query !== "string" ||
    typeof record.fetchedAt !== "string" ||
    typeof attributionRecord.creatorName !== "string" ||
    typeof attributionRecord.providerName !== "string"
  ) {
    return null;
  }
  return Object.freeze({
    id: record.id,
    provider: provider as TravelImageAsset["provider"],
    src,
    thumbnailSrc,
    width,
    height,
    alt: record.alt,
    attribution: Object.freeze({
      creatorName: attributionRecord.creatorName,
      creatorUrl: safeHttpsUrl(attributionRecord.creatorUrl, APPROVED_SOURCE_HOSTS),
      providerName: attributionRecord.providerName,
      providerUrl: safeHttpsUrl(
        attributionRecord.providerUrl,
        APPROVED_SOURCE_HOSTS,
      ),
    }),
    sourcePageUrl: safeHttpsUrl(record.sourcePageUrl, APPROVED_SOURCE_HOSTS),
    query: record.query,
    fetchedAt: record.fetchedAt,
    isFallback: false,
  });
}

export class RestDurableTravelImageMetadataStore implements TravelImageMetadataStore {
  readonly enabled = true;
  readonly mode = "durable" as const;
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetcher: typeof fetch;

  constructor(options: {
    readonly baseUrl: string;
    readonly token: string;
    readonly fetcher?: typeof fetch;
  }) {
    this.baseUrl = options.baseUrl;
    this.token = options.token;
    this.fetcher = options.fetcher ?? fetch;
  }

  private endpoint(key: string): string {
    return `${this.baseUrl}/travel-images/${encodeURIComponent(key)}`;
  }

  private requestInit(method: "GET" | "PUT" | "DELETE", body?: string) {
    return {
      method,
      cache: "no-store" as const,
      signal: AbortSignal.timeout(3_000),
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body } : {}),
    };
  }

  async get(key: string): Promise<TravelImageAsset | null> {
    return (await this.getMany(key))?.[0] ?? null;
  }

  async getMany(key: string): Promise<readonly TravelImageAsset[] | null> {
    const response = await this.fetcher(
      this.endpoint(key),
      this.requestInit("GET"),
    );
    if (response.status === 404) return null;
    if (!response.ok) throw new Error("durable cache unavailable");
    const payload: unknown = await response.json();
    if (
      typeof payload !== "object" ||
      payload === null ||
      !Array.isArray((payload as Record<string, unknown>).assets)
    ) {
      return null;
    }
    const assets = (payload as { assets: unknown[] }).assets
      .map(normalizedAsset)
      .filter((asset): asset is TravelImageAsset => asset !== null)
      .slice(0, 6);
    return assets.length > 0 ? Object.freeze(assets) : null;
  }

  async set(key: string, asset: TravelImageAsset, ttlMs?: number): Promise<void> {
    await this.setMany(key, [asset], ttlMs);
  }

  async setMany(
    key: string,
    assets: readonly TravelImageAsset[],
    ttlMs = 86_400_000,
  ): Promise<void> {
    const safeAssets = assets
      .map(normalizedAsset)
      .filter((asset): asset is TravelImageAsset => asset !== null)
      .slice(0, 6);
    if (safeAssets.length === 0) return;
    const response = await this.fetcher(
      this.endpoint(key),
      this.requestInit(
        "PUT",
        JSON.stringify({
          version: 1,
          assets: safeAssets,
          expiresAt: new Date(Date.now() + Math.max(1, ttlMs)).toISOString(),
        }),
      ),
    );
    if (!response.ok) throw new Error("durable cache unavailable");
  }

  async delete(key: string): Promise<void> {
    const response = await this.fetcher(
      this.endpoint(key),
      this.requestInit("DELETE"),
    );
    if (!response.ok && response.status !== 404) {
      throw new Error("durable cache unavailable");
    }
  }

  clear(): void {}

  size(): number {
    return 0;
  }
}

export class DurableTravelImageMetadataStoreUnavailable implements TravelImageMetadataStore {
  readonly enabled = false;
  readonly mode = "durableUnavailable" as const;

  get(key: string): TravelImageAsset | null {
    void key;
    return null;
  }
  getMany(key: string): readonly TravelImageAsset[] | null {
    void key;
    return null;
  }
  set(key: string, asset: TravelImageAsset, ttlMs?: number): void {
    void key;
    void asset;
    void ttlMs;
  }
  setMany(key: string, assets: readonly TravelImageAsset[], ttlMs?: number): void {
    void key;
    void assets;
    void ttlMs;
  }
  delete(key: string): void {
    void key;
  }
  clear(): void {}
  size(): number {
    return 0;
  }
}

export class ResilientTravelImageMetadataStore implements TravelImageMetadataStore {
  private readonly memory: MemoryTravelImageMetadataCache;
  private readonly durable: RestDurableTravelImageMetadataStore | null;
  private durableActive = false;

  constructor(options: {
    readonly memory?: MemoryTravelImageMetadataCache;
    readonly durable?: RestDurableTravelImageMetadataStore | null;
  }) {
    this.memory = options.memory ?? new MemoryTravelImageMetadataCache();
    this.durable = options.durable ?? null;
  }

  status(): TravelImageCacheRuntimeStatus {
    return Object.freeze({
      cacheMode: this.durable
        ? this.durableActive
          ? "durable"
          : "durableUnavailable"
        : "memory",
      durableCacheConfigured: this.durable !== null,
      durableCacheActive: this.durable !== null && this.durableActive,
    });
  }

  async get(key: string): Promise<TravelImageAsset | null> {
    return (await this.getMany(key))?.[0] ?? null;
  }

  async getMany(key: string): Promise<readonly TravelImageAsset[] | null> {
    if (this.durable) {
      try {
        const assets = await this.durable.getMany(key);
        this.durableActive = true;
        if (assets) {
          this.memory.setMany(key, assets);
          return assets;
        }
      } catch {
        this.durableActive = false;
      }
    }
    return this.memory.getMany(key);
  }

  async set(key: string, asset: TravelImageAsset, ttlMs?: number): Promise<void> {
    await this.setMany(key, [asset], ttlMs);
  }

  async setMany(
    key: string,
    assets: readonly TravelImageAsset[],
    ttlMs?: number,
  ): Promise<void> {
    this.memory.setMany(key, assets, ttlMs);
    if (!this.durable) return;
    try {
      await this.durable.setMany(key, assets, ttlMs);
      this.durableActive = true;
    } catch {
      this.durableActive = false;
    }
  }

  async delete(key: string): Promise<void> {
    this.memory.delete(key);
    if (!this.durable) return;
    try {
      await this.durable.delete(key);
      this.durableActive = true;
    } catch {
      this.durableActive = false;
    }
  }

  clear(): void {
    this.memory.clear();
  }

  size(): number {
    return this.memory.size();
  }
}

export function createTravelImageMetadataStore(
  environment: Environment = process.env,
  options: { readonly fetcher?: typeof fetch } = {},
): ResilientTravelImageMetadataStore {
  const durableEnvironment = resolveDurableCacheEnvironment(environment);
  const durable =
    durableEnvironment.enabled && durableEnvironment.url && durableEnvironment.token
      ? new RestDurableTravelImageMetadataStore({
          baseUrl: durableEnvironment.url,
          token: durableEnvironment.token,
          fetcher: options.fetcher,
        })
      : null;
  return new ResilientTravelImageMetadataStore({ durable });
}

export const travelImageMetadataCache = createTravelImageMetadataStore();
export const durableTravelImageMetadataStore =
  new DurableTravelImageMetadataStoreUnavailable();

export function getTravelImageCacheRuntimeStatus(): TravelImageCacheRuntimeStatus {
  return travelImageMetadataCache.status();
}
