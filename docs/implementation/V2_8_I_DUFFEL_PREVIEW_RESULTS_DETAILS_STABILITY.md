# GTAI V2.8-I — Duffel Preview Results/Details stability

## Purpose

V2.8-I keeps a selected real Preview offer stable between Results and Details. Duffel offer identifiers can change when the same search is independently repeated, so Details must resolve the exact normalized public offer selected by the visitor instead of issuing another provider search.

## Safe same-tab handoff

The browser stores only GTAI's validated `FlightOffer` allowlist in `sessionStorage`, keyed by its namespaced `duffel:off_…` identifier. Snapshots are bound to the canonical Search Intent, have an exact schema, a 15-minute expiry, and a 128 KiB ceiling. Demonstration offers, malformed identifiers, unexpected fields, intent mismatches, expired entries, and non-canonical offers are rejected. Raw Duffel payloads, credentials, Authorization headers, booking links, and passenger data are never stored.

Details reads the snapshot before constructing the repository. A valid snapshot resolves without a provider request. A missing, expired, malformed, or mismatched live snapshot renders the existing safe unavailable state and also makes no provider request. Invalid Details IDs continue to stop before any search. Filtering and sorting operate on the in-memory Results set and do not contact a provider.

## Environment boundaries and rollback

Production remains `gtai-local-demo`; V2.8-I does not change activation, public copy, SEO, sitemap, or robots policy. Removing this release restores the earlier independent Details lookup. Removing either Preview activation flag or its server-side credential continues to roll Preview back to demonstration behavior without a code change.

## Limitations

The handoff is intentionally same-tab and session-scoped. Opening a live Details deep link in a separate browser session, after expiry, or after storage was unavailable produces the safe unavailable state. Booking, payment, Orders, passenger personal data, loyalty accounts, and affiliate redirects remain out of scope.
