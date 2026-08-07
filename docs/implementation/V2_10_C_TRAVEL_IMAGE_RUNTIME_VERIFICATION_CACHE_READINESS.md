# GTAI V2.10-C — Travel Image Runtime Verification and Cache Readiness

## Current state

The Dynamic Travel Image Engine remains eligible only in Vercel Preview when its explicit server-only flag and at least one server-only provider credential are configured. Production remains hard-disabled and renders GTAI local fallback artwork.

## Safe runtime verification

`GET /api/travel-images/status` executes a server-only verification function. Its response is restricted to mode, provider-attempt and success booleans, normalized asset count, attribution presence, fallback state, a bounded cache mode, anonymous provider-configuration booleans and a fixed safe reason code. Provider keys, environment values, authorization, provider request URLs, raw identifiers, raw responses, errors and stack traces are discarded.

Preview deployments are protected by Vercel SSO in the current project. External automated HTTP verification may therefore receive a redirect instead of application content. In that case, deterministic verification and server-side simulations are the available evidence; no browser result is inferred.

## Cache readiness

The current selected-asset metadata store is bounded in-process memory. Provider fetches additionally use the Next.js fetch cache. `TravelImageMetadataStore` is the stable boundary for future persistence. `DurableTravelImageMetadataStoreUnavailable` implements that contract as a hard-disabled no-op, requiring no database, blob store, dependency or credential.

Future options include an approved Vercel Runtime Cache integration or an approved key-value/database metadata store with TTL, regional consistency, bounded records and credential isolation. No durable service is active in this release.

## Why Production remains disabled

Live Production images still require provider terms review, attribution validation, quota and abuse monitoring, durable metadata behavior, fallback drills and explicit launch approval. Preview flags and provider keys cannot cross the server-side Production gate.

## Future Production activation checklist

1. Approve provider licensing and attribution behavior.
2. Approve a durable metadata store and rollback plan.
3. Configure server-only Production credentials without `NEXT_PUBLIC_` variables.
4. Add quota, timeout and safe operational monitoring.
5. Verify responsive and RTL surfaces with live assets.
6. Run fallback and provider-outage drills.
7. Obtain explicit Production activation approval and ship it as a separate release.

Duffel, demonstration search, robots, sitemap, noindex, booking, payments, Orders, passenger data and affiliate behavior are unchanged.
