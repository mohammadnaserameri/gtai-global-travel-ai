# GTAI V2.13 — Real Viator Affiliate API Sandbox Integration

## Release boundary

V2.13 connects GTAI Explore to the Viator Partner API **Sandbox** through a server-only affiliate content adapter. The runtime base is fixed to `https://api.sandbox.viator.com/partner`. The documented production base, `https://api.viator.com/partner`, is not selected by this release.

Activation requires both `VIATOR_AFFILIATE_ENABLED=true` and a valid server-only `VIATOR_API_KEY`. No `NEXT_PUBLIC_` Viator variable is supported. Production must remain unconfigured until a separately reviewed launch release.

## Basic Access endpoints

- `GET /destinations` — cached for seven days in a bounded server cache.
- `GET /products/tags` — cached for seven days in a bounded server cache.
- `POST /products/search` — destination, tags, dates, price range, free-cancellation flag, supported sorting, pagination and currency only.
- `GET /products/{product-code}` — details on demand.
- `GET /availability/schedules/{product-code}` — schedule summary when permitted by the active Basic Access key.

V2.13 does not call `/availability/check` and contains no booking, payment, order, voucher, refund or traveler-submission endpoint.

## Affiliate redirect

The browser receives a short-lived signed internal product reference, never a Viator URL from request input. The outbound route resolves the product server-side, uses Viator's returned `productUrl` without rebuilding its attribution, checks an exact HTTPS Viator host allowlist, records bounded non-PII telemetry and responds with a 302 redirect.

## Content and UI truthfulness

Explore uses normalized real Sandbox destinations, tags, product summaries, details and schedules. When the adapter is inactive or the Sandbox cannot respond, the page states that live activity results are temporarily unavailable. It does not show fabricated fallback activities. Product-detail responses and the Explore surface remain `noindex`.

The localized disclosure explains that GTAI may earn a commission and that booking and payment happen on Viator. GTAI remains an affiliate/metasearch surface and never becomes merchant of record.

## Security and operations

- API key is read only inside server modules and sent only as `exp-api-key`.
- Every request sends the API v2 media type and a mapped `Accept-Language`.
- Calls have an eight-second timeout and a bounded 30-request-per-minute process budget.
- Provider responses are parsed defensively, size-bounded and never logged raw.
- Status output contains aggregate booleans only; it excludes keys, headers, affiliate URLs and payloads.
- The real verifier fails explicitly with `credential-required` or `enable-flag-required` when real Sandbox activation is unavailable.

## Launch limitations

The in-memory taxonomy cache is bounded and safe for serverless instances but is not a durable cross-region cache. Sandbox product content and affiliate links are test evidence, not Production inventory. Production activation requires separate Viator approval, credential scoping, legal review, monitoring and a dedicated launch gate.
