# GTAI V2.10-H — Durable Travel Image Cache Provider Adapter

## Chosen approach

GTAI keeps the existing dependency-free, server-only generic HTTPS REST adapter. Travel-image metadata is a small key/value document and does not justify adding Blob, a database, Redis SDK, or a browser dependency. A compatible managed REST key/value service can implement the contract without changing GTAI runtime code.

## REST contract

For an encoded destination/category key, the adapter uses `{baseUrl}/travel-images/{key}`:

- `GET`: `404` is a cache miss; success is exactly `{ "version": 1, "assets": [...] }`.
- `PUT`: receives `{ "version": 1, "assets": [...], "expiresAt": "ISO date" }`.
- `DELETE`: optionally expires the key; `404` is accepted.

Responses are limited to 128 KiB, must use contract version 1, may contain only `version` and `assets`, and are normalized against approved image/source hosts. Requests time out after three seconds. Authorization is sent only from server code.

## Activation

All three server-only settings are required:

- `TRAVEL_IMAGE_DURABLE_CACHE_ENABLED=true`
- `TRAVEL_IMAGE_DURABLE_CACHE_URL=<HTTPS base URL>`
- `TRAVEL_IMAGE_DURABLE_CACHE_TOKEN=<secret token>`

Configure them in the Vercel environment scope that should use the cache, then redeploy. No `NEXT_PUBLIC` equivalent is permitted.

## Safe data shape

Only normalized `TravelImageAsset` metadata is written: namespaced ID, provider, approved rendering URLs, dimensions, safe text/query, attribution metadata, approved source page URL, fetch time, and fallback marker. The envelope adds version and expiry.

Never store API keys, cache tokens, Authorization, environment values, raw provider requests/responses, raw payloads, stack traces, or passenger, booking, payment, order, or affiliate data.

## Failure and fallback

Malformed, oversized, wrong-version, timed-out, failed read, and failed write operations are caught by the resilient store. Memory is written first and remains available. The public UI never depends on durable-cache health, and status reports only `memory`, `durable`, or `durableUnavailable` with safe booleans.

## Rollback

Set `TRAVEL_IMAGE_DURABLE_CACHE_ENABLED=false` or remove its URL/token and redeploy. GTAI returns immediately to memory cache. The independent image-engine Production switch can still return all image surfaces to static fallbacks.

## Production checklist

- Production remains `liveProduction`, Pexels-only, with stable daily rotation.
- Durable cache activates only with all three server-only settings.
- Missing/failing durable cache does not affect rendering.
- Refresh request, timeout, destination/category, and asset caps remain enforced.
- No provider/cache endpoint or credential enters the browser bundle.
- Status contains no token, Authorization, raw payload, URL, or stack.
- Flight search remains 12 `gtai-local-demo` offers and Duffel remains inactive.
- Booking, payment, Orders, passenger data, and affiliate redirects remain absent.
- Sitemap, robots, and noindex behavior remain unchanged.
