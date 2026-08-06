# V2.8-B — Real Provider Integration Readiness

## What this stage is

V2.8-B makes the repository technically ready to accept a live flight provider.
It does not accept one.

Both halves matter and both are individually easy. Readiness alone can be faked
with types nobody exercises; not-accepted alone is achieved by writing nothing.
What is hard, and what this stage is for, is having the arguments about
redaction, retries, capability honesty and credential handling **before** an
integration is approved and somebody is under delivery pressure to ship it in a
week.

After V2.8-B:

- a provider-neutral contract exists for every part of a live integration —
  transport, request construction, response mapping, failure normalization,
  retry, timeout, rate limiting, secrets, audit;
- all of it is exercised by deterministic neutral fixtures;
- no external call is made, no credential exists, no provider is activated;
- the local deterministic demonstration provider remains the only enabled
  provider, exactly as in V2.7;
- the public site is byte-for-byte unchanged.

`verify:provider-integration-readiness` is **305 checks**.

## What is deliberately absent

No client for any named provider. No API call to any external hostname. No real
credential, no client-visible credential. No booking, no payment, no affiliate
redirection. No live pricing, no live availability. No public claim that a
provider is connected or that approval has been received.

## Where it lives

```
src/server/flights/providers/external/
  external-provider-types.ts              the contract surface
  external-provider-search-shape.ts       neutral search, legs, derivation
  external-provider-transport.ts          transport interface + inactive default
  external-provider-request-contract.ts   outbound request construction
  external-provider-offer-mapping.ts      provider payload → normalized offers
  external-provider-failures.ts           the 15-category taxonomy
  external-provider-error-normalizer.ts   status/cause → category
  external-provider-retry.ts              retry, backoff, abort, budget
  external-provider-rate-limit.ts         rate, burst, concurrency, queue
  external-provider-secrets.ts            the secret boundary
  external-provider-redaction.ts          request/response/diagnostic redaction
  external-provider-audit.ts              privacy-minimized audit summary
  external-provider-activation.ts         four-state activation model
  external-provider-configuration.ts      shipped (empty) config + registry gates
  fixtures/fixture-identity.ts            the fixture's id, alone
  fixtures/external-contract-fixture.ts   an inert provider implementation
  fixtures/neutral-provider-fixtures.ts   32 deterministic scenarios
```

Every executing module imports the repository's server-only guard. The two
type/constant-only modules do not, because there is nothing in them to execute.

## The decisions worth defending

### 1. There is a transport, and it reaches nothing

The first draft of this stage omitted the transport and called the omission
deliberate. That was wrong. Without a transport _interface_ the layer has no
seam, so the first integration invents one under pressure — and the inactive
default, the thing that makes "no external call" a property of the code rather
than of nobody having written one yet, never exists at all.

`ExternalProviderTransport` declares the future method. The only implementation
shipped is `InactiveExternalProviderTransport`, which:

- performs zero network calls (no `fetch`, no `node:http`, no socket anywhere in
  the directory — asserted);
- returns a typed `notConfigured` failure;
- honours an already-aborted signal **first**, producing `aborted` rather than
  `notConfigured` — recording a navigated-away visitor as a configuration fault
  would make them countable as a provider problem, which is exactly the
  conflation V2.7 already refuses;
- is deterministic;
- contains no hostname and no credential;
- is a _member_ of each provider definition, so a future integration must
  **replace** it — a visible act — rather than merely add the first call.

### 2. Configuration complete ≠ activated

`ExternalProviderActivationState` has four values and `configured` is the one
that earns its place. Without it, "we finished the setup" and "we turned it on"
become the same event, and an integration goes live the moment the last
environment variable lands in a deployment.

The operator directive is consulted **first**, so no amount of complete
configuration reaches `active` without it, and an `enable` directive with
missing or empty credentials still resolves to `unavailable`. `suspended` is
distinct from `unavailable`: one means somebody decided against, the other means
nobody has decided.

Shipped: `SHIPPED_OPERATOR_DIRECTIVE = "withheld"` and an **empty**
`SHIPPED_EXTERNAL_PROVIDERS`. Not a populated array of disabled entries — a
disabled entry is one boolean away from an enabled one.

### 3. A secret may be used but never stringified

Most credential leaks are accidental: a `JSON.stringify` of a config object, a
template literal in an error, a `console.log` while debugging. Each is a normal
thing to write and each publishes the secret.

So a resolved credential is an opaque holder whose `toString`, `toJSON` and Node
inspection hook all return `[redacted]`, and whose value is a non-enumerable
branded field — so spread, `Object.keys` and default serialization omit it
before the hooks even run. Reading plaintext requires `revealSecret(x)`, a
standalone named function with **exactly one call site** in the codebase
(asserted), where `x.value` would blend into ordinary property access.

Three structural rejections: a `NEXT_PUBLIC_*` name (already in the browser
bundle), an empty or whitespace value (counts as missing — a provider that
activates because `API_KEY=""` was set is precisely the silent activation this
stage forbids), and an absent variable.

### 4. The request builder carries everything a provider needs and nothing else

`buildNeutralQuery` emits trip shape, every leg's origin/destination/date,
adults, children, infants in seat, infants on lap, cabin class, direct-only,
market, content locale, requested locale, currency, correlation id and timeout
budget.

The requested locale is carried **separately** from the content locale.
Providers negotiate on what the visitor asked for, which can differ from what
GTAI renders on an unauthored locale; collapsing them asks a provider for the
wrong language.

No name, email, passport, payment instrument, account id, raw browser header or
credential can appear — not because they are filtered, but because the neutral
search has no such fields. `PROHIBITED_REQUEST_FIELDS` exists so verification
can assert that against a real built request.

Unsupported shapes and capabilities return **typed failures**, never silent
coercion. A three-leg search quietly truncated to two returns confidently wrong
prices.

### 5. Response mapping distrusts everything

Checked at the boundary: leg and segment structure, segment chaining (each
origin equals the previous destination), chronology, airport identity, carrier
identity, timestamps, duration consistency against the timestamps, stop count
recomputed from segments, cabin class, currency, freshness, and traveller
pricing that must sum to the stated total.

Provider-declared duration and stop count are **checked, never trusted**. A
mismatch means one of the two is wrong and GTAI cannot tell which, so the offer
is dropped rather than displayed contradicting itself. "1 stop" on a
three-segment itinerary is the kind of error a traveller discovers at an
airport.

Prices are accepted only as safe-integer minor units. Negative and zero are
separate rejection reasons — one is a provider defect, the other is usually an
award or placeholder fare, and neither is a purchasable amount.

Offer ids are deterministic and namespaced (`ext-<provider>-<hash>`), so the
same offer keeps its id across a refetch; Details resolves an offer by id from a
re-run search, and a random id would break it.

A booking or deep link is **discarded** and recorded as a
`bookingLinkDiscarded` warning. `NormalizedExternalOffer` has no field for one,
so a live outbound URL cannot end up one render away from a traveller.

Individually invalid offers are dropped, not fatal. A response where _nothing_
maps is a `mappingFailure`; an empty response is a legitimate "no flights".

### 6. Fifteen failure categories, mapped without loss

V2.7 has eight codes chosen for what the orchestrator acts on. A live provider
produces distinctions that taxonomy cannot express: `401` and `403` are both
"authentication" to V2.7 but mean different things to an operator, and "we never
configured this" is not "it is configured and down".

So there are fifteen external categories, each mapped onto the V2.7 code the
runtime already understands, with the external category carried forward in
`internalCode` so the distinction survives into audit.

A normalized failure carries only: `category`, `retryable`, `publicCode`,
`internalCode`, `runtimeCode`, `providerId`, `requestId`, `safeMessage`,
`retryAfterMs`, `statusCode`, `occurredAt`. No raw upstream message, body,
credential, stack trace or authorization header — absent from the _type_.
`safeMessage` is drawn from a fixed vocabulary; the normalizer never reads a
response body, because provider error text routinely echoes the request, and
the request is the traveller's search.

`publicCode` is deliberately coarser: `unauthorized` and `forbidden` produce the
same client-facing code, because publishing the distinction tells an attacker
whether a credential was valid.

### 7. Retry refuses the caller-abort case first

`decideRetryForCategory` checks `aborted` **before** retryability, attempts or
deadline. A caller that has gone away must never cause another request: it
spends a provider's quota on a result nobody will read, and with a shared key on
behalf of everyone else using it. No "this failure is retryable" outranks "there
is nobody to retry for".

Non-retryable by category: `unauthorized`, `forbidden`, `invalidRequest`,
`unsupportedSearch`, `aborted`, `mappingFailure`, `malformedResponse`,
`partialResponse`, `notConfigured`, `unavailable`. `isValidRetryPolicy`
**rejects** a policy that would retry an operator fault.

Jitter is a parameter, not an internal `Math.random()`, so the policy is
assertable; it shifts a delay downward within `[base × (1 − ratio), base]` and
can never exceed the declared ceiling. A provider-supplied `Retry-After` is
honoured when longer, but only after clamping — a provider asking GTAI to wait
an hour is not a reason to hold a traveller's request for an hour.

Three refusal reasons stay distinct because they mean different things:
`failureNotRetryable` is a property of the failure, `attemptsExhausted` of the
policy, `deadlineExceeded` of this request having already been slow.

### 8. Rate limiting is a sliding window with a bounded queue

Fields: `requestsPerSecond`, `burst`, `concurrentRequests`, `queueLimit`,
`maximumWaitMs`, `honoursRetryAfter`. Admission is typed; every refusal
(`rateExhausted`, `concurrencyExhausted`, `queueFull`, `waitTooLong`) carries
positive retry guidance. Nothing is dropped silently.

A fixed window would permit a burst of `2 × limit` across a boundary — all of
one window's allowance at its end and all of the next at its start, exactly the
shape that trips a provider's burst protection while looking compliant.

State is caller-owned and contains only timestamps and counts: no URL, no query,
no credential, no search intent. A module-scoped counter would be invisible to
tests, shared between unrelated searches, and in a serverless deployment
silently per-instance — enforcing nothing while appearing to. No Redis, no
persistence: coordinating limits across instances is a real problem and a later
one, and pretending to solve it with process-local state would be worse than not
solving it.

### 9. The audit summary cannot carry a trip

Fields: `providerId`, `activationState`, `requestId`, `searchShape`,
`resultCount`, `rejectedOfferCount`, `partialResult`, `durationMs`,
`failureCategory`, `retryCount`, `rateLimitDecision`, `occurredAt`.

`searchShape` is the interesting inclusion. An operator genuinely needs to know
whether round-trip searches fail more than one-way ones. `"roundTrip"` answers
that. `"YUL→CDG 2026-09-15"` would answer it too, and would also be somebody's
trip.

Absent from the type — not filtered at write time: raw request, raw response,
credential, authorization header, external URL, passenger identity, email,
passport, payment, IP, user agent, stack trace, origin, destination, dates.
`durationMs` is bucketed on every path by the single constructor, because an
exact per-request latency is a side channel nobody intended to publish.

The shipped sink declares `persistent: false` and discards what it is given —
deliberately not `console.log`. **Before any persistent sink is introduced**,
four policies must exist in writing: retention period, access control,
encryption at rest and in transit, and deletion on request. An audit trail that
exists before those decisions is a liability, not an asset.

### 10. The fixture is named nothing and points nowhere

`external-contract-fixture` on `https://external-contract-fixture.invalid`.

A fixture named after a real provider becomes, over a few commits, a
half-written client for it — and then somebody wires it up. `.invalid` is
reserved by RFC 2606 as permanently unresolvable, so even a mistaken call cannot
reach a host. Every capability is `false` or empty, which is the honest
declaration for a provider that is not connected and also makes the fixture
useless as a shortcut.

Its id lives in its own module so `external-provider-configuration.ts` can
_refuse it by name_ without importing the fixture — a shipped configuration that
imported the thing it exists to exclude would be its own counter-argument.

### 11. Registry integration is two gates, not one

The V2.7 registry decides what runs and does not import this layer at all.
`isExecutableProviderId` is a second gate that refuses the fixture **by name**
even if an external provider is shipped later.

`resolveRequestedProviderId` returns `null` for every input — a known id, an
unknown id, an empty string. Uniform refusal means a client cannot use the
response to learn which provider ids exist, and it is a total function rather
than a throw because a throw is itself a distinguishable signal.

`inspectableProviderDefinitions` is separate from `runnableExternalProviders`:
readiness tooling needs to see the fixture, the search runtime must never. One
list for looking, another for running.

## Relationship to V2.7 and V2.8-A

Every V2.7 contract is preserved. `ProviderFailureCode`, `FlightProviderAdapter`,
`ProviderRegistration`, the orchestrator, the registry and the audit sink are
untouched. This is an additive layer that normalizes _into_ V2.7's taxonomy
rather than introducing a competing one.

V2.8-A is untouched. The sitemap is still 24 URLs, `robots.txt` still allows the
noindex routes so their directive is readable, and no dictionary string changed.
Results and Details still use the internal same-origin API, and only normalized
`FlightOffer` objects reach the browser.

## Activating a provider later

1. Write a definition with **real, observed** capabilities — not aspirational.
2. Implement `ExternalFlightProvider`: `buildRequest`, `mapResponse`.
3. Replace `inactiveExternalProviderTransport` with a real transport. This is
   where the first network code in the repository gets written and reviewed on
   its own merits.
4. Declare secret references. Server-side names only, never `NEXT_PUBLIC_*`.
5. Set the environment variables. The provider reaches `configured` — and stops.
6. Only then, supply an `enable` operator directive.
7. Update the public copy. Until step 6 has happened in production, the site
   must keep saying no provider is connected, because that is still true.

Steps 5 and 6 are separate on purpose, and step 7 comes after both.

## Verification

**305 checks**, covering architecture, network prohibition, inactive transport,
activation, secrets, search shape, request contract, response mapping, failure
taxonomy, retry/timeout/abort, rate limiting, audit and redaction, registry
integration, the server-only boundary, fixtures, booking/payment/affiliate
absence, and V2.7 / V2.8-A regression.

Ten defects were reintroduced one at a time and reverted. Each fired the
intended checks and only those:

| Reintroduced defect                              | Checks that fired  |
| ------------------------------------------------ | ------------------ |
| External provider accidentally active            | 265, 266, 272, 277 |
| Real hostname introduced                         | 25                 |
| External `fetch` introduced                      | 21, 28             |
| Client import of the secret resolver             | 282, 283           |
| Credential field added to a public type          | 287                |
| Unsafe cast reintroduced                         | 77                 |
| Inactive transport accidentally registered       | 269                |
| Booking link enabled                             | 148                |
| Raw provider response added to the audit summary | 246                |
| Default audit sink made persistent               | 249                |

### What the non-vacuity pass caught

The credential-field proof initially fired **nothing**. Check 287's regex
carried a stray **backspace control character** (`\x08`) where a word boundary
was intended — introduced by an escaping mistake while editing the script
through a shell heredoc. The pattern could never match, so the check passed
unconditionally and would have kept passing while a credential field sat in a
client-safe type.

The regex was repaired, the whole script was swept for control characters (one
found, one removed), and the proof was re-run: it now fires check 287 alone.
This is the entire reason non-vacuity proofs exist, and it is worth recording
that the suite's own author wrote the vacuous check.

Four further authoring defects were found and fixed while building the suite:

- a `revealSecret` sweep counted the function's own **declaration** as a call
  site, so it would have passed regardless of real callers;
- a retry assertion expected `200ms` where the fixture's `0.2` jitter ratio
  correctly produces `160ms` at jitter 0 — asserting 200 would have asserted
  that jitter does nothing;
- a dictionary sweep for "provider is connected" flagged "**No** package
  provider is connected yet", a sentence saying the opposite of what the check
  looks for;
- two sweeps flagged the codebase's own **prohibition lists**
  (`PROHIBITED_REQUEST_FIELDS`, the API contract's forbidden-field denylist) as
  violations. Those lists are the guard, not the breach; they are now excluded
  the same way comments already were.
