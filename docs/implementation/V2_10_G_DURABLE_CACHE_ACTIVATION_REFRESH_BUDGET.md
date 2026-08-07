# GTAI V2.10-G — Durable Cache Activation and Refresh Budget

## Current state

Production travel images remain server-side, `liveProduction`, and Pexels-only. Daily UTC rotation uses normalized assets while flight search remains the local demonstration provider. Durable caching is optional; memory caching remains the safe fallback.

## Durable cache activation

The REST adapter activates only when all three server-only values are present and valid:

- `TRAVEL_IMAGE_DURABLE_CACHE_ENABLED=true`
- `TRAVEL_IMAGE_DURABLE_CACHE_URL` is an HTTPS URL without embedded credentials
- `TRAVEL_IMAGE_DURABLE_CACHE_TOKEN` is non-empty

Missing or invalid configuration leaves the runtime in memory mode. Read, write, timeout, malformed-response, or delete failures are caught and reported only as `durableUnavailable`; they never fail the UI. No `NEXT_PUBLIC` cache variable exists.

## Minimal REST contract

The server addresses one encoded destination/category key at `TRAVEL_IMAGE_DURABLE_CACHE_URL/travel-images/{key}`:

- `GET` returns `404` for a miss or `{ "version": 1, "assets": [...] }`.
- `PUT` receives `{ "version": 1, "assets": [...], "expiresAt": "ISO date" }`.
- `DELETE` is optional and may expire a key; `404` is accepted.

Authentication is a server-only Bearer header. Responses are bounded, validated, and rejected if a non-empty asset list contains no valid normalized asset.

## Stored data shape

Only normalized `TravelImageAsset` metadata is stored: namespaced ID, provider, approved HTTPS rendering URLs, dimensions, safe alt/query text, attribution names and approved source URLs, fetch time, and the non-fallback marker. The envelope adds only version and expiry.

Never store provider/cache credentials, Authorization, environment values, raw provider request or response data, stack traces, or booking, passenger, payment, order, or affiliate data.

## Refresh budget defaults

All limits are server-only, parsed as integers, and hard-clamped:

| Limit                      |  Default | Hard maximum |
| -------------------------- | -------: | -----------: |
| Destinations per run       |        8 |           12 |
| Categories per destination |        4 |            7 |
| Provider requests per run  |       12 |           20 |
| Provider timeout           | 4,500 ms |     8,000 ms |
| Assets per key             |        6 |            6 |

Optional overrides are `TRAVEL_IMAGE_REFRESH_MAX_DESTINATIONS`, `TRAVEL_IMAGE_REFRESH_MAX_CATEGORIES`, `TRAVEL_IMAGE_REFRESH_MAX_PROVIDER_REQUESTS`, `TRAVEL_IMAGE_REFRESH_TIMEOUT_MS`, and `TRAVEL_IMAGE_MAX_ASSETS_PER_KEY`. Invalid values use defaults. Daily target selection is stable for one UTC date and rotates bounded categories across later dates. Batches use `Promise.allSettled`, so partial provider, zero-image, and cache failures are isolated.

## Rollback and failure behavior

Set `TRAVEL_IMAGE_DURABLE_CACHE_ENABLED=false` or remove either durable URL/token, then redeploy. The application immediately uses memory cache. To stop live images entirely, disable the existing image-engine Production gate; static fallbacks remain. Cron continues to require `CRON_SECRET` with timing-safe comparison.

## Production verification checklist

- Status is `liveProduction`, provider scope is `pexelsOnly`, and rotation is enabled.
- `refreshBudgetConfigured` is true and `maxAssetsPerKey` is bounded.
- Cache mode is `memory`, `durable`, or safe `durableUnavailable`.
- Asset count and selected index are valid; attribution follows the selected asset.
- Homepage and product surfaces render without client provider/cache calls.
- No key, token, Authorization, environment value, or raw payload is exposed.
- Flight search remains exactly 12 `gtai-local-demo` offers; Duffel remains inactive.
- Booking, payment, Orders, passenger data, and affiliate redirects remain absent.
- Sitemap, robots, and noindex policy remain unchanged.
