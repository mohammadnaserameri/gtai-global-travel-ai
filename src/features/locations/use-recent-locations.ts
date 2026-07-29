"use client";

import { useCallback, useSyncExternalStore } from "react";

import type { LocationContext, TravelLocation } from "./location-types";

const MAX_RECENT = 5;

/** Stable empty reference — required so snapshots never change identity. */
const EMPTY: readonly string[] = [];

function storageKey(context: LocationContext): string {
  return `gtai.recent-locations.${context}`;
}

function readIds(context: LocationContext): readonly string[] {
  try {
    const raw = window.sessionStorage.getItem(storageKey(context));
    if (!raw) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY;
    const ids = parsed
      .filter((value): value is string => typeof value === "string")
      .slice(0, MAX_RECENT);
    return ids.length > 0 ? ids : EMPTY;
  } catch {
    // A blocked or corrupt session store must never break the selector.
    return EMPTY;
  }
}

/**
 * Module-level cache backing `useSyncExternalStore`.
 *
 * `getSnapshot` must return a stable reference between renders, so reads are
 * memoized here and invalidated only when this module writes.
 */
const cache = new Map<LocationContext, readonly string[]>();
const listeners = new Set<() => void>();

function snapshot(context: LocationContext): readonly string[] {
  const cached = cache.get(context);
  if (cached) return cached;
  const value = readIds(context);
  cache.set(context, value);
  return value;
}

function commit(context: LocationContext, ids: readonly string[]): void {
  cache.set(context, ids.length > 0 ? ids : EMPTY);
  try {
    window.sessionStorage.setItem(storageKey(context), JSON.stringify(ids));
  } catch {
    // Private-mode or quota failures are non-fatal; recents are a convenience.
  }
  for (const listener of listeners) listener();
}

interface RecentLocationsApi {
  /** Entity ids, newest first. Empty on the server and during hydration. */
  readonly recentIds: readonly string[];
  readonly remember: (location: TravelLocation) => void;
  readonly clear: () => void;
}

/**
 * Session-scoped recent selections.
 *
 * Three deliberate constraints, from blueprint §24–§25 and §52:
 *
 * - **`sessionStorage`, never `localStorage`.** Recents die with the tab; GTAI
 *   keeps no durable record of where somebody looked.
 * - **Only entity ids are stored.** No raw typed queries, no coordinates, no
 *   traveller data. Ids are re-resolved through the repository on read, so a
 *   stale or renamed entity simply disappears instead of resurfacing wrong.
 * - **Hydration-safe.** The server snapshot is always empty; React swaps in the
 *   real stored value after hydration.
 */
export function useRecentLocations(context: LocationContext): RecentLocationsApi {
  const subscribe = useCallback((onStoreChange: () => void) => {
    listeners.add(onStoreChange);
    return () => {
      listeners.delete(onStoreChange);
    };
  }, []);

  const getSnapshot = useCallback(() => snapshot(context), [context]);
  const getServerSnapshot = useCallback(() => EMPTY, []);

  const recentIds = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const remember = useCallback(
    (location: TravelLocation) => {
      const previous = snapshot(context);
      const next = [
        location.id,
        ...previous.filter((id) => id !== location.id),
      ].slice(0, MAX_RECENT);
      commit(context, next);
    },
    [context],
  );

  const clear = useCallback(() => commit(context, []), [context]);

  return { recentIds, remember, clear };
}
