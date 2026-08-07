# GTAI V2.10-I — Upstash durable travel image cache adapter

## Purpose and boundary

GTAI can persist normalized travel-image metadata through the Upstash Redis REST API from server code only. The in-memory cache remains the first write and the safe fallback. This release does not change Production flight search, Duffel activation, booking, payment, Orders, passenger data, affiliate behavior, SEO, or public copy.

## Required server-only environment variables

- `TRAVEL_IMAGE_DURABLE_CACHE_PROVIDER=upstash`
- `TRAVEL_IMAGE_DURABLE_CACHE_ENABLED=true`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

All four values are required. Missing or invalid configuration leaves the site healthy in memory-cache mode. No Upstash value may use a `NEXT_PUBLIC_` prefix.

## Activation

1. Provision Upstash Redis through Vercel Marketplace or an approved existing Upstash account.
2. Add the four variables above as encrypted server-only variables for the intended Vercel environment.
3. Redeploy that environment.
4. Confirm `/api/travel-images/status` reports `durableCacheProvider: "upstash"`, configured/active booleans, and no secret-bearing fields.
5. Exercise one image read and write, then confirm only the safe read/write success booleans.

## Stored contract

Keys use `gtai:travel-images:v1:{destinationKey}:{category}`. Values are a versioned JSON envelope containing only destination/category identifiers, normalized `TravelImageAsset` metadata, attribution, safe render URLs, provider identity, dimensions, query/fetch time, and expiry. Redis TTL is applied with `PX`.

Never store provider or Upstash credentials, Authorization, raw Pexels requests/responses, raw provider payloads, stack traces, booking/payment/Order/passenger/affiliate data, or unrelated visitor data.

## Failure and fallback

REST operations have a three-second timeout and bounded response parsing. Malformed responses, timeouts, read failures, and write failures are contained. Memory is written first; a durable write failure is non-fatal, and a durable read failure falls back to memory. Public status exposes only provider classification, cache mode, configured/active booleans, tested read/write booleans, and a safe reason code.

## Rollback

Set `TRAVEL_IMAGE_DURABLE_CACHE_ENABLED=false` or remove the Upstash provider selection and redeploy. The application immediately returns to memory cache. Disabling the independent image-engine Production flags returns image surfaces to local static fallbacks.

## Production verification checklist

- Production deployment is READY for the expected commit.
- Image status is HTTP 200, `liveProduction`, `pexelsOnly`, and rotation remains enabled.
- Durable cache is either active Upstash or a healthy memory fallback.
- Assets, selected index, attribution, and safe image rendering remain valid.
- No browser request targets Upstash or a provider API.
- No key, token, Authorization, environment value, or raw payload is exposed.
- Flight search remains exactly 12 demonstration offers from `gtai-local-demo`.
- Duffel and booking/payment/Orders/passenger/affiliate functionality remain inactive.
