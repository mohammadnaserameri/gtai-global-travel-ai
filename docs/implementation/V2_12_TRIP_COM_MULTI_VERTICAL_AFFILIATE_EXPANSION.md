# GTAI V2.12 — Trip.com Multi-Vertical Affiliate Expansion

## Business and capability boundary

GTAI remains an affiliate/metasearch referral platform. A traveller searches or explores in GTAI, follows a tracked outbound link, and completes booking and payment on Trip.com. GTAI does not become merchant of record, collect card or passenger data, create bookings or supplier orders, issue tickets, or manage refunds, chargebacks, or settlement.

`trip-com-affiliate` is an `affiliateRedirect` provider, not an inventory provider. Its registered verticals are Flights, Hotels, Trains, Attractions & Tours, Flight + Hotel, and Car Rentals. GTAI demonstration cards and prices remain `gtai-local-demo` content and are never represented as Trip.com inventory or prices.

## Redirect states

Flights retain the V2.11 manually validated dated round-trip pattern: economy, one adult, no children. Other flight shapes fail closed.

Hotels, trains, attractions, packages, and cars initially use only category landing-page referral templates generated and validated with Trip.com's official Affiliate Link tool. GTAI sends no destination, date, guest, pickup, drop-off, route, or time values for these categories. Requests containing query parameters are rejected rather than silently dropping them. Each CTA explicitly says that it opens a generic external Trip.com category search.

## Server-only configuration

The shared variables remain `TRIP_COM_AFFILIATE_ENABLED`, `TRIP_COM_AFFILIATE_BASE_URL`, `TRIP_COM_AFFILIATE_ID`, `TRIP_COM_AFFILIATE_SID`, and `TRIP_COM_AFFILIATE_TEMPLATE`. Optional landing templates are `TRIP_COM_HOTEL_AFFILIATE_TEMPLATE`, `TRIP_COM_TRAIN_AFFILIATE_TEMPLATE`, `TRIP_COM_ATTRACTION_AFFILIATE_TEMPLATE`, `TRIP_COM_PACKAGE_AFFILIATE_TEMPLATE`, and `TRIP_COM_CAR_AFFILIATE_TEMPLATE`.

Each category template accepts only `{affiliateId}`, `{sid}`, and `{trip_sub1}`. It must resolve to HTTPS on exactly `trip.com` or `www.trip.com`. Missing or invalid category configuration disables only that category; it does not disable Flights. `TRIP_COM_AFFILIATE_ENABLED=false` is the global rollback.

## Attribution, telemetry, and security

`trip_sub1` is a one-way SHA-256-derived token with `gtai_flight_`, `gtai_hotel_`, `gtai_train_`, `gtai_attraction_`, `gtai_package_`, or `gtai_car_` prefix. It contains no PII. `trip_sub3` is not emitted. Affiliate IDs, SID values, and templates remain server-only and are excluded from status JSON and logs. Redirect destinations cannot be supplied by callers; credentials, non-HTTPS schemes, user-info URLs, arbitrary hosts, and unrecognized parameters fail closed.

Telemetry is bounded and operational only. It records a click ID, provider ID, vertical, timestamp, and redirect result without tracked URLs, credentials, cookies, authorization data, or PII.

## UI truthfulness and next validation

Stays, Cars, Packages, Explore, and the travel-services area for Trains show a CTA only when that category's safe template is active. Copy says booking and payment occur on Trip.com and distinguishes the generic external live search from GTAI's demonstration content.

Before any category becomes parameter-preserving, manually validate its official Affiliate Link tool output for every supported field and document the exact fail-closed search shape. Validate hotel destination/dates/guests, train route/date, attraction destination/date, package route/date, and car pickup/drop-off/date/time independently. Do not infer one category's parameters from another.
