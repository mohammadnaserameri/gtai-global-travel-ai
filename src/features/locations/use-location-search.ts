"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { locationRepository } from "@/features/locations/location-repository";
import type {
  LocationContext,
  LocationGroup,
} from "@/features/locations/location-types";

export type LocationSearchStatus = "idle" | "loading" | "ready" | "error";

interface UseLocationSearchOptions {
  readonly enabled: boolean;
  readonly query: string;
  readonly context: LocationContext;
  readonly locale: string;
  readonly recentIds: readonly string[];
}

interface LocationSearchState {
  readonly status: LocationSearchStatus;
  readonly groups: readonly LocationGroup[];
  readonly total: number;
  readonly retry: () => void;
}

/** Debounce for typed queries. Empty-query suggestions resolve immediately. */
const DEBOUNCE_MS = 180;

const NO_GROUPS: readonly LocationGroup[] = [];

interface Settled {
  readonly key: string;
  readonly groups: readonly LocationGroup[];
  readonly total: number;
  readonly failed: boolean;
}

/**
 * Drives the selector's repository calls.
 *
 * Two properties matter here:
 *
 * - **Status is derived, not stored.** A settled result carries the key of the
 *   request that produced it; if that key differs from the current one the
 *   hook is by definition still loading. No `setState` happens in the effect
 *   body, and the loading indicator can never desynchronise from the query.
 * - **Stale responses are discarded.** Every request carries an incrementing
 *   id and an `AbortController`, so a slow reply for "mont" can never overwrite
 *   the results for "montreal" — blueprint §39.
 */
export function useLocationSearch({
  enabled,
  query,
  context,
  locale,
  recentIds,
}: UseLocationSearchOptions): LocationSearchState {
  const [settled, setSettled] = useState<Settled | null>(null);
  const [attempt, setAttempt] = useState(0);
  const requestId = useRef(0);

  const trimmed = query.trim();
  const key = enabled
    ? JSON.stringify([trimmed, context, locale, recentIds, attempt])
    : null;

  useEffect(() => {
    if (key === null) return;

    const id = ++requestId.current;
    const controller = new AbortController();
    const wait = trimmed.length > 0 ? DEBOUNCE_MS : 0;

    const timer = setTimeout(() => {
      locationRepository
        .search({ query: trimmed, context, locale, recentIds }, controller.signal)
        .then((response) => {
          if (id !== requestId.current) return;
          setSettled({
            key,
            groups: response.groups,
            total: response.total,
            failed: false,
          });
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          if (id !== requestId.current) return;
          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }
          setSettled({ key, groups: NO_GROUPS, total: 0, failed: true });
        });
    }, wait);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, trimmed, context, locale, recentIds]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  if (key === null) {
    return { status: "idle", groups: NO_GROUPS, total: 0, retry };
  }

  const current = settled?.key === key ? settled : null;

  if (!current) {
    return { status: "loading", groups: NO_GROUPS, total: 0, retry };
  }

  return {
    status: current.failed ? "error" : "ready",
    groups: current.groups,
    total: current.total,
    retry,
  };
}
