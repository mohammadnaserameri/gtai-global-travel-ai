# GTAI V2.8-G — Duffel Local Manual Real Test Harness

## Purpose

V2.8-G provides a server-only CLI harness for one controlled local Duffel test-mode exercise. It does not activate Duffel in the application, register Duffel as a public search provider, or change public behavior. Normal Results and Details continue to use only `gtai-local-demo`.

## Local configuration

Create `.env.local` only on the developer machine. The file is gitignored and must never be committed. Add exactly these server-only variables:

```text
DUFFEL_ACCESS_TOKEN=
DUFFEL_MANUAL_TEST_ENABLED=true
GTAI_DUFFEL_LOCAL_REAL_TEST_ENABLED=true
```

Never paste a token into chat, issues, source, terminal transcripts, or logs. Never screenshot a token. Never use a `NEXT_PUBLIC_` token or activation variable.

## Running the harness

Run:

```text
npm.cmd run test:duffel-local-real
```

With any variable absent or invalid, the command exits successfully with `SKIPPED_LOCAL_REAL_TEST`, performs zero network calls, and reminds the developer to configure `.env.local` privately.

With all three requirements satisfied locally, the harness makes one Create Offer Request for a one-way YUL–CDG economy search at least 90 days in the future, followed by one List Offers request. It uses one adult, `max_connections=1`, `return_offers=false`, and `supplier_timeout=10000`, then maps offers through GTAI's existing Duffel mapper.

Expected output contains only a redacted credential state and an allowlisted summary: provider, offer count, currencies, minimum and maximum price minor units, airlines, route, partial count, and rejection count. It never prints Authorization, token material, raw payloads, raw slices or segments, booking links, or raw offer identifiers, and it never writes a provider response to disk.

## Safety boundary

Production and every Vercel environment are blocked. Duffel remains unavailable and is not in the runtime registry. Preview remains blocked unless a separately approved release changes that policy. The harness is a CLI script only; no public route, API, browser control, query field, or client flag can invoke it.

There is no booking, payment, Orders API, passenger name, passport, loyalty account, passenger personal-data collection, or affiliate redirect. Public copy, SEO, sitemap, robots, Results, Details, and demonstration search behavior are unchanged.

## Rollback

Stop the command, remove the three local variables, delete `.env.local`, and rotate the token if exposure is suspected. The application needs no rollback because the public registry and production search never reference the harness.

## Next step

After a successful local test, retain only the safe summary. Review mapper compatibility, request budgeting, provider terms, credential rotation, monitoring, and legal approval before proposing any separately reviewed Preview test. Production activation remains out of scope.
