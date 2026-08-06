# GTAI V2.8-C — Duffel Test Adapter Contract

## Purpose and status

V2.8-C defines a server-only, inactive contract for a possible future Duffel
test-mode flight adapter. It does not connect GTAI to Duffel, enable a provider,
or change public behavior.

- Provider ID: `duffel-test-contract`
- Activation state: `unavailable`
- Runtime registration: none
- Network transport: inactive and incapable of issuing a request
- Credentials: none configured or read
- Public claims: unchanged

The word "test" describes the future provider environment this contract is
designed for. It is not an active integration and does not imply a partnership.

## Server-only modules

| Module                      | Responsibility                                            |
| --------------------------- | --------------------------------------------------------- |
| `duffel-contract.ts`        | Minimal types, constants, and activation boundary         |
| `duffel-request-builder.ts` | Pure Create Offer Request and List Offers builders        |
| `duffel-response-mapper.ts` | Defensive mapping into a server-only normalized offer     |
| `duffel-failures.ts`        | Safe provider failure classification                      |
| `duffel-fixtures.ts`        | Synthetic valid and invalid contract fixtures             |
| `duffel-transport.ts`       | Inactive transport returning `notConfigured` or `aborted` |
| `duffel-adapter.ts`         | Unavailable facade, deliberately absent from the registry |

The current public `FlightOffer` type explicitly describes fictional
demonstration data. Mapping future provider results into that type would falsely
label external data. V2.8-C therefore uses a dedicated server-only mapped-offer
type and leaves activation for a later, separately reviewed release.

## Credential and network boundary

The contract records only the future server-side secret reference
`DUFFEL_ACCESS_TOKEN`. It never reads or resolves that value, and no
`NEXT_PUBLIC_` credential exists. The only allowed origin literal is
`https://api.duffel.com`; builders return relative request descriptions, and the
inactive transport contains no `fetch`, HTTP client, socket, or SDK call.

The contract models API version `v2` and only these future paths:

- `POST /air/offer_requests`
- `GET /air/offers`

Orders, booking, payment, checkout, affiliate redirects, identity documents,
passenger profiles, and analytics are outside this release.

## Request contracts

The pure Create Offer Request builder supports one-way, round-trip, and
multi-city searches. It creates one slice per leg, uses adult passenger types,
rejects children and infants until their public age semantics are defined, maps
supported cabins explicitly, maps direct-only to zero connections and other
searches to one, sets `return_offers=false` and `supplier_timeout=10000`, and
emits `Duffel-Version: v2` without authorization data.

The pure List Offers builder requires a validated `orq_...` request ID. It
defaults to 50 offers, caps the limit at 200, uses an explicit sort allowlist,
permits only zero or one connection, treats cursors as opaque bounded values,
and emits a relative path with no credential.

## Response and failure contracts

The mapper accepts only the minimal response subset required for search display.
It validates supported currency metadata, decimal precision, positive prices,
base-plus-tax totals, timestamps, durations, airport codes, owner information,
segments, cabin class, and baggage quantities. Money is converted to integer
minor units without floating-point arithmetic.

Mapped IDs are namespaced as `duffel:<provider-id>`. Duplicate IDs keep the first
valid offer, malformed siblings do not discard valid offers, and output is capped
at 200. `live_mode=true`, raw payloads, booking links, orders, payment fields, and
identity data are rejected or excluded. The mapped type is not returned by the
current flight-search route.

Provider-like failures are reduced to safe categories: `aborted`,
`notConfigured`, `timeout`, `invalidRequest`, `authentication`, `rateLimited`,
`providerUnavailable`, `invalidResponse`, or `transport`. Only the category,
retryability signal, optional status, and a bounded public message survive.
Tokens, authorization headers, raw bodies, and provider error payloads do not.

## Verification and non-vacuity

`npm.cmd run verify:duffel-adapter-contract` checks builders, fixtures, mapping,
failure handling, inactivity, registry isolation, client isolation, prohibited
commerce surfaces, and secret boundaries. Its non-vacuity proof injects
representative defects in memory and confirms each is rejected without leaving a
source mutation behind.

## Public behavior and exclusions

V2.8-C does not change routes, UI, SEO, sitemap policy, demonstration disclosure,
or runtime request behavior. Flight Search continues to return the same 12 local
demonstration offers. Results and Details remain `noindex`; planned routes retain
their existing policy. There is no live-provider claim, partnership claim,
booking, payment, Orders API, affiliate redirect, analytics, or provider request.

## Future activation checklist

Activation requires a later release to provide all of the following explicitly:

1. A reviewed offer type that does not mislabel provider data.
2. Server-only credential provisioning and rotation.
3. An authenticated transport with budgets, timeouts, and observability.
4. Runtime registry wiring behind a deliberate activation control.
5. Legal, privacy, provider-policy, and public-copy review.
6. End-to-end test-mode validation, with commerce excluded unless a separate
   release authorizes it.

Until then, the adapter remains unavailable by construction.

## V2.8-D credential deployment boundary

V2.8-D adds a server-only resolver, stable Duffel redaction marker, and shipped
activation guard. A missing, invalid, forbidden-public, or valid-looking present
credential all leave this contract unavailable. No resolver output is wired to
the inactive transport, and the future plaintext accessor has no call site.

Local and Vercel Preview provisioning are deployment plans only. See
`docs/implementation/V2_8_D_DUFFEL_TEST_CREDENTIAL_DEPLOYMENT_PLAN.md`.
