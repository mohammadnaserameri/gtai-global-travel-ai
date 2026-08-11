# GTAI V2.11 — Trip.com Production Affiliate Flight Redirect

## Business model

GTAI is an affiliate travel metasearch and referral product. GTAI helps a traveller describe and compare a search, then may refer the traveller to an approved partner. The partner is the seller and merchant of record: booking, payment, ticketing, settlement, changes, cancellations, and refunds occur outside GTAI.

Trip.com is the first Production affiliate redirect provider because GTAI has an active affiliate account and the official Affiliate Platform supplies tracked flight links. This integration uses only a validated configurable affiliate-link template. It does not scrape Trip.com and does not call an undocumented API.

## Inventory provider versus affiliate redirect provider

An `inventoryProvider` supplies live searchable fares that can be normalized and compared. Trip.com is not an inventory provider in V2.11; GTAI has not integrated a Trip.com live fare API. Production flight offers therefore remain exactly the locally generated demonstration set from `gtai-local-demo`.

An `affiliateRedirectProvider` supplies a tracked outbound referral capability. `trip-com-affiliate` is registered separately with `flightRedirect` and `trackedOutboundClick` capabilities. It has no booking, payment, order, ticketing, refund, or passenger-submission capability.

## Safe redirect architecture

The Results UI builds only a same-origin link to `GET /api/outbound/trip-com/flight`. The server revalidates the route, dates, trip type, cabin, traveller counts, locale, and currency. It then fills the configured template and accepts the result only when it is HTTPS on the exact `trip.com` or `www.trip.com` host. Callers cannot supply a destination URL or select another host.

The CTA is search-level and states that the displayed GTAI prices remain demonstration data. It says “Check live options on Trip.com,” not “Book this fare.” The disclosure states that booking and payment are completed on Trip.com and that GTAI may earn an eligible affiliate commission.

## Server-only configuration

Required Production variables:

- `TRIP_COM_AFFILIATE_ENABLED`
- `TRIP_COM_AFFILIATE_BASE_URL`
- `TRIP_COM_AFFILIATE_TEMPLATE`
- `TRIP_COM_AFFILIATE_ID`
- `TRIP_COM_AFFILIATE_SID`

Optional variables:

- `TRIP_COM_AFFILIATE_DEFAULT_LANGUAGE`
- `TRIP_COM_AFFILIATE_DEFAULT_CURRENCY`

The template must be an official, manually validated Trip.com pattern and contain the required placeholders for origin, destination, affiliate ID, SID, and `trip_sub1`. Unsupported parameters are not invented. Configuration is server-only, never `NEXT_PUBLIC_*`, and partial configuration fails closed.

## Attribution and privacy boundary

Every redirect receives a random internal click ID. `trip_sub1` contains only the `gtai_flight_` prefix and a short SHA-256 derivative of that ID. It contains no name, email, IP address, account, cookie, passport, passenger, or payment data.

The bounded in-process click telemetry contains only click ID, provider ID, route, dates, locale, currency, timestamp, and redirect result. It does not create or infer bookings or conversions; Trip.com remains the source of truth for eligible transactions and commissions. The initial telemetry is operational and ephemeral across serverless instances.

## Security and failure model

- Exact HTTPS Trip.com host allowlist; no arbitrary URL input or open redirect.
- Strict template placeholder allowlist and CR/LF rejection.
- Strict query-key and input validation.
- No affiliate identifiers, template, credentials, full tracked URL, raw payload, cookies, or stack traces in status, logs, or error responses.
- No client-side Trip.com API call or client-side credential.
- Missing, disabled, or invalid configuration returns an unavailable state and emits no untracked link.
- Production Duffel remains inactive and flight inventory remains demonstration-only.

## Rollback

Set `TRIP_COM_AFFILIATE_ENABLED=false` and redeploy. The CTA disappears, the outbound route fails closed, and the existing GTAI demonstration search continues unchanged.

## Production activation and verification

1. Enter the server-only variables in Vercel Production using the official validated Trip.com link pattern; never place values in source or `.env.local` through this release process.
2. Redeploy Production and confirm `/api/status` reports the affiliate redirect configured, enabled, and active while booking/payment/order remain false.
3. Search Montreal to Toronto and confirm the separate partner CTA is truthful.
4. Confirm the GTAI endpoint returns 302 to an exact Trip.com HTTPS host with internal tracking.
5. Confirm malformed inputs, unknown query keys, and arbitrary redirect parameters are rejected.
6. Confirm the browser bundle, HTML, errors, and logs contain no private configuration.
7. Confirm 12 `gtai-local-demo` offers, inactive Production Duffel, active Pexels images, durable Upstash cache, sitemap count, robots, and noindex policies remain unchanged.

## Remaining limitations

Trip.com live fare inventory is not integrated. GTAI cannot state that its demonstration price exists on Trip.com. Click telemetry is bounded and process-local; commission and conversion reporting remain exclusively on Trip.com. Template parameters must be validated against the official affiliate tool before Production activation.
