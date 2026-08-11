import "../../server-only";

const WEEK_MS = 7 * 24 * 60 * 60 * 1_000;
const MAX_ENTRIES = 8;
const entries = new Map<string, { expiresAt: number; value: unknown }>();
const pending = new Map<string, Promise<unknown>>();

export async function withViatorWeeklyCache<T>(
  key: string,
  load: () => Promise<T>,
): Promise<T> {
  const cached = entries.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value as T;
  const existing = pending.get(key);
  if (existing) return existing as Promise<T>;
  const promise = load()
    .then((value) => {
      if (entries.size >= MAX_ENTRIES)
        entries.delete(entries.keys().next().value ?? "");
      entries.set(key, { expiresAt: Date.now() + WEEK_MS, value });
      return value;
    })
    .finally(() => pending.delete(key));
  pending.set(key, promise);
  return promise;
}

export function getViatorCacheStatus(): Readonly<{
  entries: number;
  ttlSeconds: number;
  bounded: true;
}> {
  return Object.freeze({
    entries: entries.size,
    ttlSeconds: WEEK_MS / 1_000,
    bounded: true,
  });
}
