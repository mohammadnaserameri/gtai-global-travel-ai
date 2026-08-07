# GTAI V2.10-D — Live Image Smoke Test and Preview Evidence

## Why this exists

The live image smoke test proves that a server-only provider adapter can fetch, normalize and attribute one real travel image without exposing provider credentials or response payloads. It is operational evidence only; it does not activate the public Production image engine.

## Safe local execution

Keep image-provider credentials in the ignored local environment file. Run `npm.cmd run test:travel-image-live-smoke` only with `TRAVEL_IMAGE_LIVE_SMOKE_TEST_ENABLED=true`. The loader reads only the smoke flag and the three supported server-only provider credential names. Production execution is always refused.

Safe output contains only the execution mode, attempt/success booleans, normalized count, fixed destination/category keys, attribution presence, fallback state, an allowlisted image hostname, dimensions and a fixed reason code.

Forbidden output includes keys, environment values, authorization, complete provider URLs or query strings, provider response bodies, raw provider identifiers, errors and stack traces.

## Preview evidence and SSO

Vercel Preview is protected by SSO in this project. Automated external checks may receive HTTP 302 before reaching the status endpoint. When that occurs, only the READY deployment metadata and deterministic server-side verifier are reported; browser or live-image success is not inferred.

## Production boundary

Production remains hard-disabled and fallback-only. The smoke flag cannot bypass the Production check and cannot be supplied by a browser. No client provider call, public provider key, booking, payment, Orders, passenger data, affiliate behavior or Duffel Production activation is added.

## Before Production image activation

Provider licensing, attribution, quota monitoring, durable metadata storage, outage drills, responsive/RTL review and explicit Production approval remain required. Production activation must be a separate reviewed release.
