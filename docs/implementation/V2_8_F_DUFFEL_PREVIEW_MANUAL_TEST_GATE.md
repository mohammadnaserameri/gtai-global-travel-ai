# GTAI V2.8-F — Duffel Preview-only Manual Test Gate

## Purpose

V2.8-F adds a server-only eligibility gate and fake-first harness for a future,
separately approved Duffel test-mode exercise. It does not activate Duffel,
register it as a search provider, add a token, or make a real provider request.
Normal Results and Details continue to use only `gtai-local-demo`.

## Why the provider is still disabled

Eligibility for an isolated manual test is not provider activation. The
shipped adapter remains `unavailable` and `runnable: false`; its ordinary
activation directive remains `withheld`. The new `manualTestEligible` decision
exists only inside the server-only harness and is never accepted by the public
search API or runtime registry.

Production is denied before any other condition is considered. A token alone,
the manual directive alone, or both together in Production produce a withheld
decision and zero fetch calls.

## Future local or Vercel Preview path

A manual test may become eligible only when every condition is true:

1. the runtime is local development/test or Vercel Preview, never Production;
2. `DUFFEL_ACCESS_TOKEN` is present and conservatively valid-shaped;
3. the server-only `DUFFEL_MANUAL_TEST_ENABLED` directive is exactly `1`;
4. the disabled runtime adapter seam is available;
5. the call carries the server-created internal manual-test capability.

Neither variable is required. Both are absent/off by default. The manual
directive is ignored in Production and must never use a `NEXT_PUBLIC_` prefix.
Client query fields, provider parameters, cookies, headers, or API payloads
cannot create the internal capability and therefore cannot activate the gate.

The only repository examples are commented, empty placeholders:

```text
# DUFFEL_ACCESS_TOKEN=
# DUFFEL_MANUAL_TEST_ENABLED=
```

V2.8-F does not create `.env.local`. A future operator must store a real test
token only in ignored local configuration or a Vercel Preview sensitive
variable. Never paste a token into source, chat, issues, pull requests,
screenshots, terminal transcripts, logs, audit records, URLs, browser storage,
or public runtime configuration.

## Safe manual-test procedure

1. Obtain explicit provider and release-owner approval for one bounded test.
2. Confirm the target is local or Vercel Preview and that Production has no
   manual directive.
3. Add the token and directive only through the approved secret store; never
   reveal their values in chat or logs.
4. Run the server-only harness with its default in-memory fake fetch first.
5. Confirm the registry and public API still expose only `gtai-local-demo`.
6. A real fetch injection requires a separate approval immediately before the
   run, strict request budgeting, endpoint review, and redacted observation.
7. Remove the directive and rotate or remove the token after the test.

Automated verification never performs a real Duffel call. It executes only
injected fake contracts and proves that default, incomplete, and Production
configurations cause zero fetches.

## Privacy and public API boundary

Authorization is constructed only inside the existing server transport. The
gate, credential state, internal capability, Authorization header, raw Duffel
payload, provider URL, and failure details never enter the public response,
mapped offers, browser bundle, query string, log, or audit summary.

Public copy, SEO, the 24-URL sitemap, robots policy, Results/Details noindex
policy, and demonstration-data disclosures remain unchanged.

## Rollback conditions

Disable the directive and stop immediately on any Production eligibility,
unexpected origin or endpoint, request without explicit approval, retry
amplification, credential disclosure, raw payload escape, public API drift,
registry change, browser-bundle leakage, or public-copy/SEO change. Revoke or
rotate any credential that may have been exposed.

## Exclusions and later promotion

There is no booking, payment, Orders API, affiliate redirect, passenger name,
passport, loyalty account, provider partnership claim, or production provider
connection in V2.8-F.

A later release may consider broader activation only after controlled Preview
evidence, commercial and legal approval, credential ownership and rotation,
rate-limit coordination, monitoring, audit retention policy, rollback drills,
public disclosure review, and a separately reviewed Production activation
contract. V2.8-F itself permanently blocks Production activation.
