# GTAI V2.8-D — Duffel Test Credential Deployment Plan

> V2.8-E adds a disabled runtime transport seam. It remains unregistered and
> does not change this credential or activation policy.

## Purpose and scope

V2.8-D defines how a future Duffel test token can be supplied to GTAI without
placing it in source control or exposing it to a browser. It adds a server-only
credential resolver, redaction helpers, an explicit inactive activation guard,
and deterministic verification. It does not add a token, activate Duffel, or
make an external request.

The only permitted future variable name is `DUFFEL_ACCESS_TOKEN`. V2.8-D does
not require it. A token being present is configuration evidence only and cannot
make the provider runnable.

## Why no token is added now

Credentials do not belong in source, documentation examples, screenshots,
messages, build output, or audit records. This release must be reviewable and
buildable without access to a provider account. Any real token must remain in a
secret store controlled by the operator who provisions it.

Never paste a token into ChatGPT, Codex, an issue, a pull request, a terminal
transcript, a screenshot, or a repository file. Rotate it immediately if it is
exposed in any of those places.

## Future local setup

For a later explicitly authorized test, create `.env.local` on the operator's
machine and add the server-only variable there. Use this shape conceptually:

```text
DUFFEL_ACCESS_TOKEN=<paste test token locally only>
```

Rules:

- `.env.local` is covered by the repository's `.env*` ignore rule.
- V2.8-D does not create `.env.local`.
- Never commit, upload, screenshot, or share the file.
- Next.js may read it only in server runtime code after a later activation
  release authorizes a transport.
- Normal development, verification, typechecking, and building require no
  token.

## Future Vercel setup

Use **Vercel Project → Settings → Environment Variables**. Create a Sensitive
environment variable named `DUFFEL_ACCESS_TOKEN` and paste the test token into
the dashboard value field. Do not use a browser-exposed variable name.

Scope it to **Preview first**. Validate a future test transport in a controlled
preview deployment with provider approval, request budgets, redacted logs, and
documented rollback. Add it to **Production only after** that review succeeds
and a separate release explicitly authorizes activation.

Do not print the value in Vercel build commands or logs, expose it through
public runtime configuration, or publish it in screenshots. V2.8-D performs no
Vercel API or CLI write.

## Forbidden public-name pattern

Next.js inlines browser-exposed environment variables into client bundles. A
provider credential must therefore never use a public prefix. The resolver
structurally rejects the forbidden public-name form; it is mentioned in source
only where policy and verification must detect it.

No alternate credential aliases are supported. Using one token name keeps the
configuration boundary auditable and prevents an old alias from silently
surviving rotation.

## Server-only resolver

`resolveDuffelCredential()` accepts an injected environment-shaped object for
tests and defaults to `process.env` only inside its server-only module. It
returns one of four typed states:

- `missing` — the server variable is absent or empty;
- `presentButInactive` — the syntax is conservative, but activation is still
  withheld;
- `invalidShape` — the supplied value fails conservative syntax validation;
- `forbiddenPublicName` — a browser-exposed variable was supplied.

The resolution always carries `activationState: unavailable` and
`activatesProvider: false`. The raw value is held inside a non-enumerable,
opaque capsule. String conversion, JSON serialization, and Node inspection all
produce `[redacted:duffel-token]`.

The only plaintext accessor is a named server-only function reserved for a
future transport constructor. V2.8-D has no call site for it, and the inactive
transport does not import it.

## Redaction and privacy boundary

Duffel redaction is fail-closed:

- authorization and token headers become `[redacted:duffel-token]`;
- bearer material, credential-like values, and URLs are scrubbed from future
  diagnostics;
- no prefix or suffix is retained;
- audit summaries expose only whether configuration exists, the `server-env`
  source, a safe reason, and the stable marker;
- mapped offers, public failures, API responses, and the non-persistent audit
  sink never receive the capsule or plaintext value.

No persistent credential or provider-request audit sink is introduced. Raw
authorization headers, query-token URLs, thrown errors, and console output are
outside the safe summary type.

## Activation guard

`guardDuffelActivation()` always returns `unavailable`, `runnable: false`, and
the shipped directive `withheld`. Missing, invalid, forbidden-public, and
valid-looking present credentials all remain inactive. Module import and
configuration completeness are not activation decisions.

A future release must define a separate explicit server-side directive. V2.8-D
does not implement an enabling environment variable or registry entry. The
runtime registry continues to contain only the local demonstration provider,
and browser input cannot select a provider.

## Rotation guidance

If a token is exposed, revoke or rotate it in Duffel first, replace it in the
appropriate local or Vercel secret store, redeploy affected environments, and
review logs and artifacts for copies. Never reuse an exposed value. Preview and
Production values should be independently scoped where the provider permits.

## Public behavior and exclusions

V2.8-D changes no public route, dictionary, marketing claim, SEO policy,
sitemap, or robots rule. Flight Search continues to return 12 local fictional
demonstration offers. There is no live provider, partnership, booking, payment,
Orders API, affiliate redirect, passenger identity, passport, or loyalty data.

## Future V2.8-E prerequisites

Before any activation release:

1. Obtain commercial and legal approval for provider test access.
2. Provision the token in Preview without exposing it in source or logs.
3. Implement an authenticated server-only transport with strict host/path
   allowlists, timeouts, rate limits, abort propagation, and zero raw logging.
4. Define a separate explicit activation directive and rollback path.
5. Validate redaction, audit retention, bundle isolation, and public API
   envelopes with test-mode traffic.
6. Review provider attribution, disclosure, privacy, and public copy.
7. Keep booking, payment, Orders, and passenger identity outside scope unless a
   separately approved release defines them.
8. Rotate the test token before Production promotion if it has appeared in any
   non-secret environment.

Until all prerequisites are satisfied, Duffel remains unavailable.
