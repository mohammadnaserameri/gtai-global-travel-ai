# GTAI V2.10-J — Durable Cache Write Verification and Refresh Persistence

## Current state

Production uses the server-only Pexels image provider and an Upstash-backed durable metadata cache. Durable reads were already active. V2.10-J verifies that the protected daily refresh can also write normalized metadata and read it back.

## Protected refresh approach

The existing `GET /api/cron/travel-images` route remains the only write trigger. It requires the server-only cron secret in a Bearer authorization header and uses a timing-safe comparison. Missing or incorrect authorization is rejected. No browser component calls this route, and no additional public write endpoint is introduced.

After the bounded daily refresh writes live assets, the server resolves the first refreshed target again without forcing a provider request. A successful durable cache hit confirms read-after-write persistence. Write or cache failures remain non-fatal because the in-memory fallback stays available.

## Safe output fields

The protected refresh and public status surfaces may report only safe operational metadata, including:

- `durableWriteVerified`
- `durableWriteSucceeded`
- `durableReadAfterWriteSucceeded`
- `durableLastWriteSafeReasonCode`
- cache mode and provider name
- asset count, selected index, attribution presence, and fallback state

They never return credentials, environment values, authorization headers, provider payloads, cache payloads, or stack traces.

## Stored metadata shape

Upstash keys stay inside the versioned GTAI travel-image namespace. Values contain only the contract version, normalized destination key, category, expiry, and normalized `TravelImageAsset` metadata: provider, approved HTTPS image/source URLs, dimensions, safe descriptive metadata, attribution, and fetch time. Refresh and asset budgets remain enforced.

## Forbidden data

The cache and responses must never include Pexels keys, Upstash URL/token, authorization values, raw provider/cache requests or responses, stack traces, booking/payment/order/passenger data, or affiliate redirects. No `NEXT_PUBLIC_*` credential is permitted.

## Read-after-write verification

A positive verification requires all of the following in the same protected refresh execution: a normalized live asset, a successful durable write, a subsequent durable read, and a cache hit. Public status can also confirm persisted metadata when a later serverless invocation obtains a valid durable cache hit.

## Rollback

Set `TRAVEL_IMAGE_DURABLE_CACHE_ENABLED=false` to disable durable caching. The image engine continues with its bounded memory cache and safe static fallback. Production image activation and Pexels-only gates remain independent, and Production flight search remains `gtai-local-demo`.

## Production verification checklist

- Invoke the refresh route only with the configured server-side cron authorization.
- Confirm unauthorized calls are rejected.
- Confirm durable write and read-after-write fields are true after an exercised refresh.
- Confirm cache mode is durable, provider is Upstash, and a normalized asset is selected.
- Confirm attribution and rotation remain valid.
- Confirm browser traffic contains no Pexels or Upstash API requests.
- Confirm no key, token, authorization, or raw payload is exposed.
- Confirm flight search remains 12 demonstration offers from `gtai-local-demo` and Duffel stays inactive.
