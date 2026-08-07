# GTAI partner readiness notes

## Company and product positioning

GTAI — Global Travel AI is a multilingual travel-comparison product developed by GROUPE AMERI INC. in Quebec, Canada. The current public beta demonstrates explainable flight comparison and a reusable search experience for future travel verticals. GTAI is not currently a booking agent, merchant of record, payment processor, or publicly claimed provider partner.

The product direction is provider-transparent metasearch: normalized offers, clear source identity, understandable ranking, and explicit separation between comparison and a future partner-completed transaction.

## Current technical readiness

- Next.js application deployed on Vercel with Production and protected Preview separation.
- Provider-independent Search Intent, normalized Flight Offer model, validation, timeout, retry, redaction, audit, and safe-error contracts.
- Deterministic Production demonstration adapter returning 12 offers.
- Multilingual location discovery with localized aliases, airport/city grouping, prefix search, and bounded typo tolerance.
- Stable Results-to-Details behavior: demonstration IDs in Production and same-tab normalized snapshots for Preview live test offers.
- Automated verifiers for location, flight, provider, credential, adapter, Preview activation, Details stability, UI readiness, and Production launch control.
- Public-beta status response exposes only an allowlisted non-secret state.

## Provider integration readiness

The Duffel adapter can build validated Offer Request inputs, use server-held test credentials, map an allowlisted response subset, reject malformed offers, report partial mapping safely, and normalize transient failures without exposing raw provider data. Production registration remains hard-disabled.

No browser input can select a provider. Production exits to `gtai-local-demo` before Preview activation or credential resolution. The future Production launch variable names are planning notes only and have no active code path in this release.

## Preview-only live-search proof

Authorized Vercel Preview testing has demonstrated:

- Server-only gated Duffel test activation.
- Real test Offer Request/List Offers transport.
- More than zero normalized test offers for YUL–CDG.
- Results presentation labelled **Live Preview**.
- First-offer Details resolution from the same-tab snapshot.
- Safe handling of rejected/partially mapped offers without raw payload exposure.
- Production remaining demo-only during and after Preview testing.

This proof establishes technical feasibility only. It does not establish Production approval, contractual status, guaranteed coverage, or a public partnership.

## Production launch prerequisites

- Written provider and commercial approval, including permitted display, caching, attribution, and test/Production usage.
- Legal review of roles, terms, customer disclosures, geography, consumer protection, and dispute boundaries.
- Privacy assessment covering request fields, logs, retention, subprocessors, data location, user rights, and incident response.
- Production credential issuance, least privilege, secure storage, rotation, revocation, and access ownership.
- Agreed quotas, rate limits, cost caps, latency targets, timeout/retry policy, service objectives, and escalation contacts.
- Mapping acceptance criteria for schedule, timezone, price, currency, taxes/fees, baggage, conditions, carrier identity, and partial results.
- Redacted observability, dashboards, alerting, and an incident runbook.
- Accessibility, localization, customer-support, and public-copy approval.
- Rehearsed fallback to `gtai-local-demo` and an authorized rollback owner.
- A separate, independently verified Production activation release.

## Compliance, privacy, and security notes

- No token, Authorization header, or raw provider payload is exposed to the browser or public status endpoint.
- No credential belongs in source control, `.env.local` commits, documentation, screenshots, chat, or client-prefixed variables.
- Booking, payment, Orders, passenger names, passports, loyalty accounts, and affiliate redirects are outside the current system boundary.
- Current flight search uses route/date/traveler-count/cabin/currency intent, not passenger identity.
- Logs and diagnostics are restricted to allowlisted phases, categories, counts, booleans, and safe reason codes.
- Public copy must continue distinguishing demonstration Production data from Live Preview test data.

## Rollback and fallback

Preview fails closed to demonstration mode if an activation gate or Preview credential is absent. Production always resolves to the local demonstration registry in this release. For a future live release, rollback must be a tested server-side switch that removes live registration, preserves safe errors, and restores `gtai-local-demo` without requiring client changes.

Operational rollback criteria should include elevated error rate, timeout rate, mapping rejection rate, rate-limit pressure, material price/schedule defects, secret-handling concerns, provider incident notification, or loss of required approval.

## Questions for a provider or partner discussion

1. Which test and Production APIs, credentials, scopes, regions, and rate limits would apply to GTAI?
2. What commercial agreement and approval are required before public display of live offers?
3. What attribution, trademark, provider naming, deep-link, caching, and freshness rules apply?
4. Which prices, taxes, fees, conditions, baggage, refundability, and changeability fields are authoritative?
5. What are the expected availability, latency, timeout, retry, pagination, and error-handling practices?
6. How should duplicate, partial, stale, or withdrawn offers be handled?
7. What logging and retention are permitted for request metadata and provider identifiers?
8. What security controls, credential rotation, incident notification, and revocation processes are required?
9. Which user or passenger data becomes necessary only if a later transaction phase is separately approved?
10. Who owns customer support before redirect, after redirect, during provider outage, and for price discrepancies?
11. What sandbox-to-Production certification or launch checklist must be completed?
12. What rollback, maintenance-window, status-page, and escalation channels are available?

These notes support discovery and readiness review; they do not claim an existing partnership or Production approval.
