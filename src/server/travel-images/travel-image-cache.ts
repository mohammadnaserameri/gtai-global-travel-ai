import "../server-only";

import type { TravelImageAsset } from "../../features/travel-images/travel-image-types";
import { resolveTravelImageRefreshBudget } from "./travel-image-refresh-budget";

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
  readonly durableCacheProvider: "upstash" | "generic" | "none";
  readonly durableCacheConfigured: boolean;
  readonly durableCacheActive: boolean;
  readonly durableReadSucceeded: boolean;
  readonly durableWriteSucceeded: boolean;
}

/** Compatibility name retained for the V2.10-A engine constructor. */
export type TravelImageMetadataCache = TravelImageMetadataStore;

export class MemoryTravelImageMetadataCache implements TravelImageMetadataStore {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly clock: () => number;
  private readonly maximumEntries: number;
  private readonly maximumAssetsPerKey: number;
  private readonly defaultTtlMs: number;

  constructor(
    options: {
      readonly clock?: () => number;
      readonly maximumEntries?: number;
      readonly maximumAssetsPerKey?: number;
      readonly defaultTtlMs?: number;
    } = {},
  ) {
    this.clock = options.clock ?? Date.now;
    this.maximumEntries = options.maximumEntries ?? 256;
    this.maximumAssetsPerKey =
      options.maximumAssetsPerKey ??
      resolveTravelImageRefreshBudget().maxAssetsPerKey;
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
      assets: Object.freeze(assets.slice(0, this.maximumAssetsPerKey)),
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
  readonly provider: "upstash" | "generic" | "none";
}

type Environment = Readonly<Record<string, string | undefined>>;

export const DURABLE_TRAVEL_IMAGE_CACHE_CONTRACT_VERSION = 1;
export const MAX_DURABLE_TRAVEL_IMAGE_RESPONSE_BYTES = 128 * 1024;

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
  const requestedProvider = safeValue(
    environment.TRAVEL_IMAGE_DURABLE_CACHE_PROVIDER,
  );
  const provider =
    requestedProvider === "upstash"
      ? "upstash"
      : requestedProvider === null || requestedProvider === "generic"
        ? "generic"
        : "none";
  const url = safeDurableUrl(
    safeValue(
      provider === "upstash"
        ? environment.UPSTASH_REDIS_REST_URL
        : environment.TRAVEL_IMAGE_DURABLE_CACHE_URL,
    ),
  );
  const token = safeValue(
    provider === "upstash"
      ? environment.UPSTASH_REDIS_REST_TOKEN
      : environment.TRAVEL_IMAGE_DURABLE_CACHE_TOKEN,
  );
  return Object.freeze({
    enabled:
      provider !== "none" &&
      environment.TRAVEL_IMAGE_DURABLE_CACHE_ENABLED === "true" &&
      url !== null &&
      token !== null,
    url,
    token,
    provider,
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
    width <= 0 ||
    typeof height !== "number" ||
    !Number.isFinite(height) ||
    height <= 0 ||
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

async function readBoundedDurableJson(response: Response): Promise<unknown> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_DURABLE_TRAVEL_IMAGE_RESPONSE_BYTES
  ) {
    throw new Error("durable cache unavailable");
  }
  if (!response.body) throw new Error("durable cache unavailable");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_DURABLE_TRAVEL_IMAGE_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error("durable cache unavailable");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error("durable cache unavailable");
  }
}

interface DurableTravelImageMetadataStore extends TravelImageMetadataStore {
  readonly provider: "upstash" | "generic";
}

export class RestDurableTravelImageMetadataStore implements DurableTravelImageMetadataStore {
  readonly enabled = true;
  readonly mode = "durable" as const;
  readonly provider = "generic" as const;
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetcher: typeof fetch;
  private readonly maximumAssetsPerKey: number;

  constructor(options: {
    readonly baseUrl: string;
    readonly token: string;
    readonly fetcher?: typeof fetch;
    readonly maximumAssetsPerKey?: number;
  }) {
    this.baseUrl = options.baseUrl;
    this.token = options.token;
    this.fetcher = options.fetcher ?? fetch;
    this.maximumAssetsPerKey =
      options.maximumAssetsPerKey ??
      resolveTravelImageRefreshBudget().maxAssetsPerKey;
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
    const payload: unknown = await readBoundedDurableJson(response);
    if (
      typeof payload !== "object" ||
      payload === null ||
      Array.isArray(payload) ||
      (payload as Record<string, unknown>).version !==
        DURABLE_TRAVEL_IMAGE_CACHE_CONTRACT_VERSION ||
      !Array.isArray((payload as Record<string, unknown>).assets) ||
      Object.keys(payload).some(
        (key) => !["version", "assets", "expiresAt"].includes(key),
      )
    ) {
      throw new Error("durable cache unavailable");
    }
    const assets = (payload as { assets: unknown[] }).assets
      .map(normalizedAsset)
      .filter((asset): asset is TravelImageAsset => asset !== null)
      .slice(0, this.maximumAssetsPerKey);
    if (
      (payload as { assets: unknown[] }).assets.length > 0 &&
      assets.length === 0
    ) {
      throw new Error("durable cache unavailable");
    }
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
      .slice(0, this.maximumAssetsPerKey);
    if (safeAssets.length === 0) return;
    const response = await this.fetcher(
      this.endpoint(key),
      this.requestInit(
        "PUT",
        JSON.stringify({
          version: DURABLE_TRAVEL_IMAGE_CACHE_CONTRACT_VERSION,
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

function upstashCacheKey(key: string): string {
  const [category = "destination", ...destinationParts] = key.split(":");
  const safeCategory =
    category
      .normalize("NFKC")
      .toLocaleLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "destination";
  const destinationKey =
    destinationParts
      .join(":")
      .normalize("NFKC")
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 120) || "global";
  return `gtai:travel-images:v1:${destinationKey}:${safeCategory}`;
}

function normalizedEnvelope(payload: unknown): readonly TravelImageAsset[] | null {
  if (
    typeof payload !== "object" ||
    payload === null ||
    Array.isArray(payload) ||
    (payload as Record<string, unknown>).version !==
      DURABLE_TRAVEL_IMAGE_CACHE_CONTRACT_VERSION ||
    typeof (payload as Record<string, unknown>).destinationKey !== "string" ||
    typeof (payload as Record<string, unknown>).category !== "string" ||
    typeof (payload as Record<string, unknown>).expiresAt !== "string" ||
    !Array.isArray((payload as Record<string, unknown>).assets) ||
    Object.keys(payload).some(
      (key) =>
        !["version", "destinationKey", "category", "assets", "expiresAt"].includes(
          key,
        ),
    )
  ) {
    throw new Error("durable cache unavailable");
  }
  const rawAssets = (payload as { assets: unknown[] }).assets;
  const assets = rawAssets
    .map(normalizedAsset)
    .filter((asset): asset is TravelImageAsset => asset !== null)
    .slice(0, resolveTravelImageRefreshBudget().maxAssetsPerKey);
  if (rawAssets.length > 0 && assets.length === 0) {
    throw new Error("durable cache unavailable");
  }
  return assets.length > 0 ? Object.freeze(assets) : null;
}

export class UpstashDurableTravelImageMetadataStore implements DurableTravelImageMetadataStore {
  readonly provider = "upstash" as const;
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

  private async command(command: readonly unknown[]): Promise<unknown> {
    const response = await this.fetcher(this.baseUrl, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(3_000),
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
    });
    if (!response.ok) throw new Error("durable cache unavailable");
    const payload = await readBoundedDurableJson(response);
    if (
      typeof payload !== "object" ||
      payload === null ||
      Array.isArray(payload) ||
      Object.keys(payload).some((key) => !["result"].includes(key))
    ) {
      throw new Error("durable cache unavailable");
    }
    return (payload as { result?: unknown }).result;
  }

  async get(key: string): Promise<TravelImageAsset | null> {
    return (await this.getMany(key))?.[0] ?? null;
  }

  async getMany(key: string): Promise<readonly TravelImageAsset[] | null> {
    const result = await this.command(["GET", upstashCacheKey(key)]);
    if (result === null) return null;
    if (
      typeof result !== "string" ||
      result.length > MAX_DURABLE_TRAVEL_IMAGE_RESPONSE_BYTES
    ) {
      throw new Error("durable cache unavailable");
    }
    try {
      return normalizedEnvelope(JSON.parse(result));
    } catch {
      throw new Error("durable cache unavailable");
    }
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
      .slice(0, resolveTravelImageRefreshBudget().maxAssetsPerKey);
    if (safeAssets.length === 0) return;
    const [category = "destination", ...destinationParts] = key.split(":");
    const envelope = JSON.stringify({
      version: DURABLE_TRAVEL_IMAGE_CACHE_CONTRACT_VERSION,
      destinationKey: destinationParts.join(":"),
      category,
      assets: safeAssets,
      expiresAt: new Date(Date.now() + Math.max(1, ttlMs)).toISOString(),
    });
    const result = await this.command([
      "SET",
      upstashCacheKey(key),
      envelope,
      "PX",
      Math.max(1, Math.floor(ttlMs)),
    ]);
    if (result !== "OK") throw new Error("durable cache unavailable");
  }

  async delete(key: string): Promise<void> {
    const result = await this.command(["DEL", upstashCacheKey(key)]);
    if (typeof result !== "number") throw new Error("durable cache unavailable");
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
  private readonly durable: DurableTravelImageMetadataStore | null;
  private durableActive = false;
  private durableReadSucceeded = false;
  private durableWriteSucceeded = false;

  constructor(options: {
    readonly memory?: MemoryTravelImageMetadataCache;
    readonly durable?: DurableTravelImageMetadataStore | null;
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
      durableCacheProvider: this.durable?.provider ?? "none",
      durableCacheConfigured: this.durable !== null,
      durableCacheActive: this.durable !== null && this.durableActive,
      durableReadSucceeded: this.durableReadSucceeded,
      durableWriteSucceeded: this.durableWriteSucceeded,
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
        this.durableReadSucceeded = true;
        if (assets) {
          this.memory.setMany(key, assets);
          return assets;
        }
      } catch {
        this.durableActive = false;
        this.durableReadSucceeded = false;
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
      this.durableWriteSucceeded = true;
    } catch {
      this.durableActive = false;
      this.durableWriteSucceeded = false;
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
  const budget = resolveTravelImageRefreshBudget(environment);
  const durable =
    durableEnvironment.enabled && durableEnvironment.url && durableEnvironment.token
      ? durableEnvironment.provider === "upstash"
        ? new UpstashDurableTravelImageMetadataStore({
            baseUrl: durableEnvironment.url,
            token: durableEnvironment.token,
            fetcher: options.fetcher,
          })
        : new RestDurableTravelImageMetadataStore({
            baseUrl: durableEnvironment.url,
            token: durableEnvironment.token,
            fetcher: options.fetcher,
            maximumAssetsPerKey: budget.maxAssetsPerKey,
          })
      : null;
  return new ResilientTravelImageMetadataStore({
    durable,
    memory: new MemoryTravelImageMetadataCache({
      maximumAssetsPerKey: budget.maxAssetsPerKey,
    }),
  });
}

export const travelImageMetadataCache = createTravelImageMetadataStore();
export const durableTravelImageMetadataStore =
  new DurableTravelImageMetadataStoreUnavailable();

export function getTravelImageCacheRuntimeStatus(): TravelImageCacheRuntimeStatus {
  return travelImageMetadataCache.status();
}
