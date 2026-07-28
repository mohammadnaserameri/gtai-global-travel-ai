"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Tracks a CSS media query from JavaScript.
 *
 * Implemented with `useSyncExternalStore` rather than an effect: `matchMedia`
 * is an external store, so React can read it during render on the client and
 * fall back to `defaultValue` on the server. That keeps hydration consistent
 * without a synchronous `setState` inside an effect.
 *
 * Only use this for behaviour that cannot be expressed in CSS — layout should
 * still be done with breakpoints.
 */
export function useMediaQuery(query: string, defaultValue = false): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onStoreChange);
      return () => list.removeEventListener("change", onStoreChange);
    },
    [query],
  );

  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);

  const getServerSnapshot = useCallback(() => defaultValue, [defaultValue]);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
