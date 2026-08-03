/**
 * The repository's server-only marker.
 *
 * Next.js projects normally write `import "server-only"`, which is a
 * published npm package whose browser export is a hard build error. GTAI has
 * deliberately shipped every version so far with three runtime dependencies
 * and no build-time additions, and V2.7 is explicitly not allowed to install
 * one — so this module provides the same guarantee from inside the codebase.
 *
 * It gives two layers rather than one:
 *
 * 1. **Runtime.** Importing this module in a browser throws immediately, at
 *    module-evaluation time, before any provider code can run. A bundling
 *    mistake fails loudly on the first render instead of silently shipping
 *    the provider runtime to visitors.
 * 2. **Static.** `verify:providers` asserts that no Client Component, and
 *    nothing reachable from `ApiFlightOfferRepository`, imports `src/server`
 *    at all. That check is what actually keeps the boundary honest —
 *    the throw below is the backstop for the case the check missed.
 *
 * Every server runtime entry module imports this first. Pure leaf helpers
 * that the entry modules import do not need to repeat it; the entry points
 * are the doors.
 */
if (typeof window !== "undefined") {
  throw new Error(
    "A GTAI server-only module was imported into a browser bundle. " +
      "The provider runtime must never reach the client.",
  );
}

/**
 * Exported so the import is a value import rather than a side-effect-only one
 * that a bundler might consider tree-shakeable. Never read for its contents.
 */
export const SERVER_ONLY = true;
