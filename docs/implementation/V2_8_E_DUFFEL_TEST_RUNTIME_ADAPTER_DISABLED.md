# GTAI V2.8-E — Duffel Test Runtime Adapter, Disabled by Default

## Scope

V2.8-E adds a server-only authenticated transport seam for a future controlled
Duffel test-mode exercise. It does not activate or register Duffel, add a
credential, or change public behavior. The activation directive remains
`withheld`; `gtai-local-demo` remains the sole runtime provider.

## Transport boundary

The transport requires an opaque credential capsule, an injected fetch-like
function, and a request from the V2.8-C builders. It allowlists only
`https://api.duffel.com`, `POST /air/offer_requests`, and `GET /air/offers`.
Authorization is constructed only inside the server module and is never
returned, logged, serialized, stored, or placed in a URL.

Allowed endpoints are exactly `POST /air/offer_requests` and
`GET /air/offers`. Forbidden endpoints include Orders, Payments, price actions,
passenger updates or identity endpoints, private fares, airline credits, and
loyalty endpoints.

It reuses the V2.8-B deadline and retry contracts: bounded attempts and
backoff, clamped Retry-After, abort propagation, bounded bodies, safe malformed
JSON rejection, and normalized failures. Aborted, invalid, unauthorized, and
forbidden requests are never retried.

## Disabled activation

`composeDisabledDuffelRuntimeAdapter` always reports `unavailable`, `withheld`,
and `runnable: false`, even with a valid-looking token. It is not imported by
the registry, API, or client.

## Future local or Preview-only test

A separately approved release may use a token stored only in `.env.local` or a
Vercel Preview secret, resolve it server-side, inject an approved fetch seam,
and call this transport outside production search. That release must define
operator ownership, rate-limit coordination, redacted log review, rotation,
rollback, and a separate explicit activation directive.

V2.8-E does not create `.env.local`, require a token, or perform a real request.
Verification uses in-memory fake fetch functions only.

No token belongs in source, chat, screenshots, browser code, public runtime
configuration, logs, audit summaries, mapped offers, or failure text. Request
headers, Bearer values, and query-token values use the existing redacted marker.

### Manual local-test checklist

1. Obtain explicit approval and an isolated test credential.
2. Store it only in ignored `.env.local`; never paste it into chat.
3. Confirm production search and the active registry still exclude Duffel.
4. Use the server-only harness and review only redacted output.
5. Stop on any unexpected endpoint, body, retry, or disclosure.
6. Remove or rotate the credential immediately after testing.

### Preview-only checklist and production conditions

Use a Vercel Preview secret only after local fake and controlled tests pass.
Confirm the execution guard is Preview-scoped, the request budget and response
bound are enforced, rollback ownership is assigned, and logs expose no secret.
Production promotion remains prohibited until a separate reviewed release adds
an explicit server directive, commercial approval, monitoring, rate-limit
coordination, rollback criteria, and public-disclosure review.

Rollback immediately on credential exposure, unexpected network origin or
endpoint, retry amplification, malformed response escape, public-copy drift,
or any booking/payment/passenger-data surface.

## Exclusions

No production activation, booking, payment, Orders API, price action, passenger
identity, passport, loyalty account, affiliate redirect, public provider claim,
or dependency change is included.

> V2.8-F adds a separate server-only, fake-first manual-test eligibility gate.
> It remains local/Vercel Preview-only, blocks Production, keeps this default
> adapter disabled, and does not register Duffel in public search.
