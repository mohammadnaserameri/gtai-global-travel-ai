# GTAI V2.10-F — Production Image Rotation and Durable Cache

## Current state

Production travel images are enabled only through the V2.10-E approval gate and remain Pexels-only. V2.10-F adds bounded multi-asset rotation and an optional server-side durable metadata cache without changing the UI or flight-provider boundaries.

## Rotation design

Each destination/category stores up to six ranked, normalized assets. Selection uses the UTC date plus a stable destination/category hash. The result is stable for every request on the same UTC day and advances deterministically on a later day when multiple assets exist. Attribution always comes from the selected asset. An empty list, provider failure, or invalid asset returns the existing local fallback.

Coverage uses the existing image wiring for homepage hero, destination cards, Explore, Flights, Stays, Cars, and Packages.

## Durable cache

The optional REST adapter activates only when all three server-only values exist:

- `TRAVEL_IMAGE_DURABLE_CACHE_ENABLED=true`
- `TRAVEL_IMAGE_DURABLE_CACHE_URL`
- `TRAVEL_IMAGE_DURABLE_CACHE_TOKEN`

The URL must use HTTPS and contain no embedded credentials. Reads and writes have a short timeout and are wrapped by a resilient memory adapter. Missing configuration uses memory. A durable failure reports `durableUnavailable` and immediately falls back to memory without failing the site.

## Stored data

Only normalized `TravelImageAsset` metadata is stored: provider, approved rendering URLs, dimensions, alt/query metadata, attribution, safe source page, and fetch/expiry timestamps. Entries and rotation candidates are bounded.

API keys, cache tokens, Authorization headers, raw provider responses, provider request bodies, internal errors, and stack traces are never stored or exposed.

## Daily refresh

The existing authenticated daily cron refreshes the existing 14 destination/category targets in batches of three. The provider-call budget is capped at 14. Per-target failures are isolated, partial refresh is safe, and successful normalized lists write through to durable storage when active or memory otherwise.

## Rollback

- Set `TRAVEL_IMAGE_DURABLE_CACHE_ENABLED=false` to return to memory-only caching.
- Set either Production image approval flag false, remove `PEXELS_API_KEY`, or set `TRAVEL_IMAGE_ENGINE_ENABLED=false` to restore image fallback mode.

## Production verification checklist

- `liveProduction` and `pexelsOnly`
- rotation enabled with a valid asset count/index
- attribution visible
- cache mode safely reported as memory, durable, or durable unavailable
- product pages render without direct browser provider/cache calls
- no credential, Authorization, or raw payload exposure
- 12 demonstration flight offers remain from `gtai-local-demo`
- sitemap, robots, and noindex policy unchanged

Duffel Production activation, booking, payment, Orders API, passenger data, and affiliate redirects remain unchanged and absent.
