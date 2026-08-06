# GTAI V2.8-H — Duffel Preview-only real provider activation

## Purpose

V2.8-H permits authenticated Duffel test inventory only in a Vercel Preview deployment or an explicitly enabled local manual session. Production remains the `gtai-local-demo` demonstration provider.

## Preview-only activation

Set these server-side Vercel Preview variables: `DUFFEL_ACCESS_TOKEN`, `DUFFEL_MANUAL_TEST_ENABLED=true`, and `GTAI_DUFFEL_PREVIEW_REAL_TEST_ENABLED=true`. All gates must pass. Local execution instead requires `GTAI_DUFFEL_LOCAL_REAL_TEST_ENABLED=true`. Never create a `NEXT_PUBLIC_` version of any credential or activation flag.

Production is blocked before credential use even if every flag is present. A missing, malformed, or public-named credential falls back to demonstration search without a Duffel request. The public request cannot select a provider.

Only validated flight Search Intent reaches the adapter. The response is mapped to GTAI's allowlisted `FlightOffer`; no raw Duffel payload, Authorization value, provider error, booking link, payment, Orders API, passenger name, passport, loyalty account, or affiliate redirect reaches the browser. Never place a token in chat, logs, screenshots, source, or documentation.

## Rollback

Remove either Preview activation flag or the Preview credential. The registry immediately resolves to `gtai-local-demo`; no code rollback is necessary. Reverting V2.8-H also removes the gated registry path.

## Next step

After a successful Preview-only test, review mapped-offer coverage and operational telemetry using redacted metadata. Any Production proposal requires a separate security and product release; this release never enables booking, payment, or Orders.
