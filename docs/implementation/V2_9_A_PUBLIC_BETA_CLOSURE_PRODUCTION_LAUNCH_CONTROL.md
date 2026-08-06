# GTAI V2.9-A — Public beta closure and Production launch control

## Current state

GTAI's public beta is commercially closed: Production serves only the `gtai-local-demo` demonstration provider, 12 locally generated flight offers, and no booking or payment capability. Vercel Preview can exercise normalized Duffel test inventory only when every existing Preview-only server gate and its server-held test credential are present. Preview is labelled Live Preview and is not a Production inventory or partnership claim.

V2.9-A adds a second server-only Production launch control. It is disabled and unapproved as source constants. It does not read credentials, Preview flags, client input, query parameters, or future approval variables. A Duffel token by itself therefore cannot change Production, and the Production registry remains `gtai-local-demo`.

The future-only planning names `GTAI_PRODUCTION_LIVE_PROVIDER_ENABLED` and `GTAI_PRODUCTION_LIVE_PROVIDER_APPROVED` are deliberately not active behavior in this release. They must not use a `NEXT_PUBLIC_` prefix and must not be configured as a substitute for a reviewed release.

## Public-beta status contract

`GET /api/system/public-beta-status` returns a fixed allowlisted status object: GTAI public-beta mode, Production demonstration mode, Preview capability availability, and explicit false values for Production live provider, booking, payments, Orders, affiliate redirects, and token exposure. It reads no credential or environment value and returns no provider URL, credential state, Authorization value, raw payload, internal error, or stack.

## Why Production is not live

Preview test success is technical evidence, not Production approval. Before any separate Production live-search release, all of the following require named owners, recorded approval, and a tested rollback:

- [ ] Commercial provider approval and enforceable provider terms.
- [ ] Legal review of search presentation and provider responsibilities.
- [ ] Privacy review of requests, logs, retention, infrastructure, and user rights.
- [ ] Monitoring and logging review proving secrets and raw payloads remain excluded.
- [ ] Rate-limit, quota, latency, failure-budget, and cost review.
- [ ] Rehearsed rollback to `gtai-local-demo`, with clear decision authority.
- [ ] Customer-support plan for stale prices, outages, mapping defects, and complaints.
- [ ] Terms, affiliate, provider-disclosure, and public-copy review.
- [ ] Security review of Production credential issuance, scope, storage, rotation, and revocation.
- [ ] Production-like mapping and availability testing across routes, dates, cabins, currencies, and carriers.
- [ ] A new source release that makes approval explicit, server-only, fail-closed, reversible, and independently verified.

## Explicitly forbidden in this release

- No booking workflow or booking link.
- No payment collection or payment field.
- No Duffel Orders API.
- No passenger names or other passenger personal data.
- No passport data.
- No loyalty account data.
- No affiliate redirect or commission link.
- No live Production inventory claim.
- No provider partnership or commercial approval claim.

## Rollback and remaining boundary

Removing either Preview activation flag or its Preview credential returns Preview to demonstration mode. Production requires no operational rollback for V2.9-A because live activation has no code path. Any future launch must replace the disabled source constant only through a separately reviewed, tested, frozen, and approved release.
