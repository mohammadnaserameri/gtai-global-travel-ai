# GTAI — Provider Runtime

**Module:** 08 — the server-side search runtime that sits behind Results and Details.
**Status:** Implemented locally through V2.7, pending external review.
**Base checkpoint:** `7f0d6ba0baf2609ed8e074c5f6f0ea8faabb7074` (V2.6 — Functional Flight Details, frozen)
**Implementation record:** `docs/implementation/V2_7_FUNCTIONAL_PROVIDER_RUNTIME.md`
**Related:** `07_PROVIDER_INTEGRATION_BLUEPRINT.md` (the eventual _external_ provider plan, still pending)

---

## 1. What this module is, and what it is not

V2.7 gives GTAI a real server boundary. The browser no longer generates offers; it asks an internal GTAI endpoint, which runs a provider orchestration pipeline server-side and returns a narrow, versioned envelope.

Everything in that pipeline is real — the registry, the adapter contract, cancellation, timeouts, response validation, normalization, the failure taxonomy, the audit model. The only thing that is not real is the inventory: the single enabled adapter generates offers locally and deterministically.

That is the point of the stage. It is **not** a live-provider integration, and it must not be described as one. What it proves is that a real provider can later be added without provider payloads, URLs, failures or secrets leaking into the client — because the machinery that prevents that already exists and is already under test.

```
Client (Results / Details)
  └─ ApiFlightOfferRepository            src/features/flights/
       └─ POST /api/flights/search       src/app/api/flights/search/route.ts
            └─ request validation        src/server/flights/
                 └─ orchestrator         src/server/flights/providers/
                      └─ registry → adapter (local, deterministic)
                           └─ response validation → normalization
                                └─ versioned client envelope
```

## 2. The trusted boundary

`src/server/**` is server-only. Two layers enforce it, because one is not enough:

- **Runtime.** Every server entry module imports `src/server/server-only.ts`, which throws at module-evaluation time if `window` exists. GTAI has shipped every version with three runtime dependencies and V2.7 adds none, so the usual `import "server-only"` npm package is unavailable; this is the in-repo equivalent.
- **Static.** `verify:providers` asserts that no file under `src/components` or `src/features` imports `src/server`, that no client-safe module re-exports one, and that the client repository imports no registry, adapter or orchestrator. That check is what actually holds the line; the throw is the backstop.

Types the client legitimately needs live in `src/features/flights/flight-search-api-contract.ts`, which imports nothing from `src/server`.

## 3. Provider registry

`provider-registry.ts` is the only place that decides which providers exist and how they run. A registration carries `providerId`, `enabled`, an operator `label`, the `adapter`, `timeoutMs`, `maximumOfferCount` and a deterministic `priority`.

There is deliberately **no** `baseUrl`, credential, affiliate template or client-supplied timeout on that type. Nothing in a request can add, name, enable, re-time or re-limit a provider: an attacker who fully controls the payload still cannot select a provider or extend a timeout, because those values are never read from a request.

The registry rejects, at construction rather than at first search: empty or whitespace-padded ids, duplicate ids, a timeout outside 100 ms–30 s or non-integer, a maximum offer count outside 1–200, a non-integer priority, and a registration whose adapter disagrees about its own id (which would misattribute every audit event). Enabled providers run in `priority` order with `providerId` as the tiebreak, so aggregation never depends on scheduling.

V2.7 enables exactly one provider: `gtai-local-demo`. Fixture adapters used to prove partial-failure, timeout and cancellation behaviour are built by the verification script against `createProviderRegistry`; they are never registered here and cannot appear in the interface.

## 4. Adapter lifecycle

An adapter receives a `ProviderSearchContext`: the normalized Search Intent, an `AbortSignal`, an opaque `searchContextId`, and the allowlisted development scenario. It receives no raw query string, no return URL, no passenger names, no account id, no cookies, no authorization header and no client tracking data.

It returns a `ProviderSearchOutcome` — a discriminated result, not a thrown error — so a genuine zero-offer response, a cancellation and each failure mode stay distinct. The orchestrator still defends against a throw, because an adapter is untrusted by policy.

The local adapter (`adapters/local-deterministic-provider-adapter.ts`) makes no network request, reads no environment variable and touches no file. It calls the single shared generator in `demo-offer-generation.ts`, extracted in V2.7 so the adapter and the verification scripts have one source of truth rather than two implementations. Offers are a pure function of the normalized intent, so ids stay identical to the frozen V2.6 set.

## 5. Internal API request

`POST /api/flights/search`, same-origin, JSON only.

```json
{
  "version": 1,
  "searchIntent": { "v": "1", "trip": "roundTrip", "origin": "…", "…": "…" },
  "locale": "en",
  "retryToken": 0,
  "scenario": "normal"
}
```

`searchIntent` uses the canonical URL parameter _names_ so there is one description of what a search is — but it is emphatically not "the URL as the payload": there is no query string, no view state, no `returnTo` and no offer id. `locale` sits at the top level because it comes from the route segment, not from the shareable link.

Validation is manual and dependency-free, and treats the body as hostile even though a well-behaved GTAI client would get it right:

| Condition                                      | Result                       |
| ---------------------------------------------- | ---------------------------- |
| Method other than `POST`                       | `405` (framework)            |
| Missing/non-JSON `Content-Type`                | `415`                        |
| Empty body, oversized body, malformed JSON     | `400`                        |
| Unknown top-level or intent property           | `400`                        |
| Unsupported `version`                          | `400`, `unsupportedVersion`  |
| Invalid Search Intent, retry token or scenario | `400`                        |
| Every provider failed                          | `503`, `providerUnavailable` |
| Success, partial or empty                      | `200`                        |

**Development scenarios are refused server-side in production.** The route decides the policy once — `allowDevelopmentScenarios: process.env.NODE_ENV !== "production"` — and passes it explicitly to request validation, which never reads the environment itself. In production, `empty`, `error` and `slow` are rejected with the same safe 400 an unknown scenario gets, so the response reveals nothing about which environment is running. The client returning `"normal"` in production is a convenience; this is the boundary.

The client’s own validation is never load-bearing: the server re-derives the intent from scratch through the same shared validator the Results page uses. Rejection reasons come from a closed set and never echo a submitted value, so the endpoint cannot be turned into a reflector. **The body is stream-read under a byte ceiling.** `readBoundedRequestBody` refuses an oversized declared `Content-Length` before reading, then reads through `request.body.getReader()` counting `Uint8Array.byteLength`, stops and cancels the reader the moment the limit is crossed, and only decodes bytes it has accepted (with a `fatal` `TextDecoder`, so malformed UTF-8 is a rejection rather than replacement characters). The stream is consumed exactly once and `request.text()` is never called. A body refused on its declared length is still cancelled rather than merely abandoned, so a hostile sender is not left with a pipe this process would keep open, and the reader lock is released on the accepted, rejected and unreadable paths alike. Counting a decoded string's length would under-measure multibyte text by roughly half: an 8,096-character Persian payload is 16,096 bytes, and a string-length limit of 8,192 would have accepted it.

The `Content-Type` policy compares only the media type — everything from the first `;` is a parameter list — after trimming and lowercasing, and compares it **exactly**. So `application/json; charset=utf-8` is accepted while `application/jsonp` and `text/application/json` are refused; a substring test would have waved both through.

Responses carry `Content-Type: application/json`, `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`, and **no CORS headers at all** — a permissive `Access-Control-Allow-Origin` would hand any site the ability to run searches through the deployment.

## 6. Versioned response contract

```ts
type FlightSearchApiResponse =
  | {
      version: 1;
      status: "success" | "partial" | "empty";
      mode: "demonstration";
      offers: readonly FlightOffer[];
      providerSummary: readonly ClientProviderSummary[];
    }
  | {
      version: 1;
      status: "error";
      mode: "demonstration";
      errorCode: ClientFlightSearchErrorCode;
    };
```

`mode` is a standing machine-checkable assertion that nothing on the wire is live inventory; the client rejects any other value, so a future real-provider build cannot quietly reuse the demonstration client.

`ClientProviderSummary` carries `providerId`, `status`, `offerCount` and a coarse `durationBucket` — a band rather than a measured latency, because an exact figure is a side channel nobody needs. There is no raw payload, error text, URL, credential or `searchContextId` on that type; those fields do not exist rather than being filtered out.

Error codes are deliberately coarse (`invalidRequest`, `unsupportedVersion`, `searchUnavailable`, `providerUnavailable`). The server's richer internal taxonomy is operator-facing, and collapsing it here is what stops an operational detail from becoming a customer-visible one. Customer wording stays in the locale dictionaries.

## 7. Cancellation and timeout

`provider-timeout.ts` gives each provider an abort scope combining the caller's signal with the provider's own timeout, while tracking _which_ fired.

The naive `Promise.race([work, timeout])` is wrong three ways and all three matter: the losing operation is never cleaned up, a late rejection becomes an unhandled rejection, and the caller cannot tell a visitor navigating away from a slow provider. The scope fixes each — `dispose()` clears the timer and removes the upstream listener and is idempotent (the orchestrator calls it from `finally`), a late resolution is ignored while its promise is still consumed, and `reason()` keeps `cancelled` and `timedOut` distinct.

The abort listener on the internal scope signal is attached through a named handler and removed in a `finally`, so it is detached on **every** path — success, provider failure, timeout and cancellation alike. `{ once: true }` only detaches after the event fires, which would leave it attached in exactly the common case where the work finishes first.

**A pre-aborted scope never invokes the adapter at all.** The guard returns before `work` is referenced, so no provider is contacted and no side effect can begin for a search the caller already abandoned. The adapter call itself sits inside the `try`, so a _synchronous_ throw takes the same path as an asynchronous rejection and still reaches the `finally` that detaches the listener — previously such a throw escaped with the listener attached.

**Same-turn cancellation also prevents adapter invocation.** A caller that aborts in the same JavaScript turn as the call — `const pending = runWithAbortScope(scope, work); controller.abort();` — previously still reached the provider, because everything up to the first `await` runs synchronously during the call itself. The abort then won the race and the outcome read `cancelled`, which was true but beside the point: the search had already been sent. After registering the abort listener the scope now yields exactly one microtask and asks the signal again, so that cancellation lands first and the adapter is invoked **zero** times. It is a microtask — not a timer, not an environment branch, not a cache, not deduplication. Normal execution still invokes the adapter exactly once, a timeout stays distinguishable from a cancellation, and both a synchronous throw and an asynchronous rejection still reach cleanup with no listener left behind.

Consequences the runtime guarantees: an already-aborted request never arms a timer; a cancellation is never recorded as a provider fault; a timeout is never flattened into `unknown`.

## 8. Provider-output validation

Adapter output is untrusted input — including from the local adapter, because the boundary's value comes precisely from not depending on which adapter is behind it.

**Offers are validated against the Search Intent, not merely against their own shape.** Structural validation establishes that the fields exist, have the right types and carry no extra keys. That is necessary and not sufficient: a payload can satisfy every structural rule and still be nonsense. Before this layer existed, a real generated offer could be mutated to change its ranking totals, break a segment's duration away from its own timestamps, move an itinerary's departure away from its first segment, disconnect the route, put a layover at an airport the flight never touches, break the price-per-traveler relationship, declare two outbound legs on a round trip, or read `"99:99"` on the clock — and every one was accepted.

`isCanonicalFlightOfferForIntent` (in `flight-offer-intent-validation.ts`) closes that. It is one shared pure module used at **both** boundaries — the server over adapter output, the client over API responses — because a rule implemented twice eventually disagrees with itself. It checks three things: that the offer answers _this_ search (currency, itinerary count and direction, endpoints drawn from the intent's own airport codes, departure dates inside the flexibility window, cabin on every segment); that it is internally consistent (real 24-hour clock readings; each segment's stated duration equal to its epoch difference; itinerary endpoints equal to the first and last segment in all three fields; each leg starting where the previous ended; stop and layover counts, layover airports and layover durations all derived from the segments; itinerary duration reached two independent ways — endpoint difference _and_ flying time plus ground time); and that its totals reconcile (ranking duration and stop count summed from the itineraries, `totalPrice` equal to `pricePerTraveler` × the chargeable traveler count, operating carriers exactly the set actually flying). Dates are compared through the project's ISO helpers rather than `new Date(...)`, which is UTC-anchored and would shift a boundary date for anyone west of Greenwich.

**A `LocalDateTime` must agree with its own airport and epoch.** The type carries a local date, a wall clock and a UTC epoch minute, and only the epoch is authoritative. Nothing previously required the other two to _be_ that instant, so a payload could state 08:00 on the departure date while its epoch pointed at 23:59 the day before, and every downstream check — durations, chronology, ordering, the flexibility window — still passed, because they all read the epoch. Only the interface, which renders the date and time, would show a schedule that does not exist. Each segment's departure is now re-derived from its epoch in the **origin** airport's zone and its arrival in the **destination** airport's zone, through the same shared `resolveAirportTimeZone` + `toLocalDateTime` the generator uses, and both must match exactly. DST is therefore handled by the project's one timezone architecture, from ICU data for the exact instant, never by a fixed offset or by `new Date(dateOnlyString)`. The flexibility window is checked against that re-derived airport-local date rather than the submitted string, so a payload cannot sit inside the window by assertion while its instant falls outside it. Persian and Arabic remain Gregorian throughout.

**Every airport must exist in the GTAI directory.** Segment origins, segment destinations and layover airports are all resolved against the shared location/timezone source of truth — there is no second allowlist to keep in sync. A regex-valid invention such as `ZZZ`, `ABC` or `XXX` has no zone and is therefore not an airport, and an unknown code is a rejection rather than a skipped check: unverifiable must not read as valid. A layover must additionally equal both the preceding segment's destination and the following segment's origin, stated from each side independently. Directory membership is required _in addition to_ the endpoint match against the Search Intent, not instead of it.

**Round-trip turnaround comes from one shared policy.** `MIN_ROUND_TRIP_TURNAROUND_MINUTES` lives in `flight-offer-policy.ts` and is imported by both the demonstration generator and the canonical validator. Previously the generator enforced a 60-minute minimum while the validator required only "inbound after outbound", so a one-minute turnaround the generator would never produce was accepted at the boundary. Zero, thirty and fifty-nine minutes are rejected; sixty is the boundary and is accepted. The comparison uses UTC instants only — a local wall clock says nothing useful across two zones.

**The generator and the validator share one demonstration identity catalog.** `demo-flight-catalog.ts` owns the fictional carrier ids, names and flight-number marks and the fictional booking-provider names; the generator draws from it and the validator rejects anything not in it. That second half was missing: a validator that accepts any non-empty string for `carrierName` would accept `AC` / _Air Canada_ or `Booking.com` on an offer the interface labels as a demonstration. Each segment's carrier id must be catalogued, its name must be the one belonging to _that_ id, and its `DEMO-<mark>-<number>` flight number's mark must belong to that same carrier — `DEMO-AUR-483` on a Maple Wings segment is internally inconsistent even though both halves are fictional. The validating carrier is checked the same way and must actually operate a segment of the offer, and the booking provider must be one of the catalogued fictional providers. Real airline and travel-agency names appear in verification only as adversarial fixtures that must be rejected.

**Validation is total: it rejects, it never throws.** Canonical integers are checked with `Number.isSafeInteger` rather than `Number.isInteger` — past 2^53 the integers stop being distinct, so a duration, price, stop count or ranking total beyond that range quietly stops satisfying the identities every other check depends on. Epoch minutes get a stricter shared predicate, `isValidEpochMinutes`, which additionally bounds them to the ECMAScript time-value range (±8,640,000,000,000,000 ms, expressed once as `MAX_EPOCH_MINUTES`, both signs). That bound is not cosmetic: every canonical instant is eventually handed to `Intl.DateTimeFormat` to be read in an airport's zone, and that call **throws `RangeError: Invalid time value`** outside the range. An offer whose epochs were shifted far out of range while remaining perfectly self-consistent — chronology, durations, itinerary totals and ranking totals all still agreeing — therefore took the validators down instead of being rejected by them.

Totality is layered rather than trusted to a single check. The range predicate is the primary fix; on top of it, the airport-local conversion, the server's provider validation and the client's envelope validation each wrap their call narrowly, so an unexpected throw becomes a rejection rather than an escaping exception. Those `catch` blocks accept no data and inspect nothing: the server classifies it as `invalidOffer` → `malformedResponse`, the client returns `null`, and the repository maps that to the ordinary translated `FlightOfferRepositoryError` the pages already render. No raw `RangeError` reaches Results or Details.

Nothing is repaired. An inconsistent offer fails and its whole provider response becomes `malformedResponse`.

Validation is **exact**. Shapes are checked as **plain objects with own properties**, not merely as objects. An adapter could otherwise return something whose prototype supplies `ok`, `failure` or `code`: those read like real fields through normal access but are invisible to `Object.keys`, so a key-count check would see an empty object while every field read succeeded. An own `retryAfterMs: undefined` is likewise a third shape the contract does not define, and is rejected rather than treated as absence. An outcome carries precisely the keys its shape defines — `{ ok, offers }` or `{ ok, failure }` — and a failure carries only `code` and, for `rateLimited` alone, `retryAfterMs`. The failure code is checked against `PROVIDER_FAILURE_CODES`, a runtime allowlist that exists as data because the TypeScript union is erased at compile time and proves nothing about a value an adapter returned. A `retryAfterMs` on a timeout or an authentication failure is a shape this contract does not define, and is rejected rather than ignored. The forbidden-key sweep runs over the _whole_ outcome, so a URL, credential or raw payload hidden in a failure object is caught as readily as one inside an offer. The orchestrator then consumes the **rebuilt, validated** failure rather than the adapter's original object, so nothing unchecked survives by reference.

`provider-search-validation.ts` checks the result discriminant, the offers array and its length against the registry's ceiling, then runs every offer through the shared `isCanonicalFlightOffer`: offer-id shape, finite integer money in a supported currency, itinerary count, per-segment and cross-itinerary chronology on authoritative epoch minutes, three-letter airport codes, `DEMO-` flight identifiers, and the demonstration marker. Keys are checked **exactly** at every level, so a provider-specific field cannot ride in beside valid ones. A separate denylist sweep rejects any URL, tracking, credential or correlation field at any depth. A provider-supplied `retryAfterMs` is validated before it is trusted.

V2.7's policy is **whole-response rejection**: one malformed offer fails that provider. Item-level rejection is defensible only alongside a policy that reports how many items were dropped and why; without that, a silently shortened list is a coverage claim nobody verified. A failed provider is isolated — it does not erase a healthy provider's offers.

## 9. Canonical normalization

`provider-response-normalizer.ts` merges validated per-provider lists into one canonical list ordered by price, then total duration, then offer id — a stable canonical order, not a ranking. Results still applies its own Sort, and "Best" is still the existing shared ranking module; nothing commercial participates.

Nothing is added: no provider id stamped onto an offer, no price-freshness timestamp (there is no live price to be fresh), no booking or affiliate URL, no commission field. Duplicate ids across providers collapse deterministically. That is why Filters, Sort, Highlights and Details need no provider-specific branch anywhere — and why a second provider would be a configuration change rather than a rewrite.

## 10. Failure taxonomy

`cancelled`, `timeout`, `rateLimited`, `authentication`, `configuration`, `malformedResponse`, `unavailable`, `unknown`.

**Cancellation is audited separately from failure.** A cancelled provider run has `status: "cancelled"`, emits `search.cancelled` rather than `search.failed`, and carries `failureCode: null`. `cancelled` stays in the internal taxonomy because orchestration still reasons about it, but an operator counting provider faults must not have to filter cancellations back out — a caller going away says nothing about provider health, and conflating the two makes every reliability figure wrong in the same direction. For aggregation a cancellation still counts as a source that did not answer, so it reduces coverage; when _every_ provider cancelled, the search reports failure rather than claiming an empty result, because nobody looked.

This holds for both routes to a cancellation: one detected by the abort race, and one an adapter reports itself as a validated `{ ok: false, failure: { code: "cancelled" } }` outcome. Two paths to the identical event must not be audited differently.

Collapsing any two would lose something a caller acts on. `cancelled` is never a provider fault. `authentication` and `configuration` are operator problems that should never be retried at the customer's expense. `malformedResponse` names data this boundary refused. An adapter that throws becomes one failed provider with `unknown`, and the thrown value is never inspected, formatted or forwarded.

The orchestrator distinguishes four situations: every provider failed (the search could not run — `503`, never presented as "no flights"), some answered and some failed (`partial`, because presenting reduced coverage as complete is a lie), everyone answered with nothing (a real `empty`), and otherwise `success`.

## 11. Privacy-minimized audit

`ProviderAuditEvent` carries `searchContextId`, `providerId`, event, status, a bucketed duration, an offer count, a safe failure category and a timestamp — and nothing else. No origin, destination, date, traveler count, cabin, canonical Search Intent, request or response body, provider URL, affiliate parameter, cookie, IP, user agent, account id or payment data. Those are absent from the _type_, so they cannot be added by accident.

`searchContextId` is `crypto.randomUUID()`. It is not the canonical Search Intent and not a hash of it: a hash over a small, guessable search space is reversible, so treating it as anonymous would be wrong. It never leaves the server — the client envelope has no field to carry it.

V2.7 ships a **no-op sink**. Persistent logging is out of scope, and an audit trail that exists before anyone has decided its retention, access and deletion policy is a liability rather than an asset.

## 12. Client repository

`ApiFlightOfferRepository` is the browser's only route to offers. It knows nothing about providers and cannot import one.

It POSTs to the relative `/api/flights/search` with `credentials: "same-origin"` and `redirect: "error"` — a redirect from our own search endpoint would mean the request left the origin this repository may talk to, so it is refused rather than chased. It rebuilds its body from the normalized intent rather than the address bar, so a stale filter or hand-added parameter cannot ride along. It never retries automatically: Retry is the visitor's decision, and a silent retry loop against a failing backend is how outages get amplified.

**Abort stays abort for the whole response-reading path** — after the headers arrive, around `response.json()` (whether the rejection is itself an `AbortError` or the signal merely flipped while parsing), and once more before offers are handed to the interface. A visitor who navigated away must never be shown the error state; cancellation is not failure. Malformed JSON without a cancellation still maps to the ordinary safe repository error.

Every response is validated structurally before a single offer reaches the UI, with no `as FlightSearchApiResponse` anywhere. "Same origin" says where bytes came from, not whether they are well-formed. Version, `mode`, status discriminant, every offer, the provider summary and the forbidden-key sweep are all checked; anything malformed becomes the same translated repository error the pages already render. Envelope keys are checked **exactly** — a result envelope is precisely `version`, `status`, `mode`, `offers`, `providerSummary`; an error envelope is precisely `version`, `status`, `mode`, `errorCode`; a provider summary is precisely its four fields. An extra property is how a diagnostic URL, a correlation id or a raw error message arrives, and a denylist can only catch the ones we can name. **The envelope is checked for meaning, not only shape.** A structurally perfect response can still contradict itself, and each contradiction would drive the interface into a state the data does not support: `success` with nothing in it, `empty` with twelve offers, `success` alongside a failed provider, `partial` where every provider succeeded, duplicate offer ids, duplicate provider ids, a failed provider reporting offers it did not return. All are rejected. A provider summary's own status and count must agree (only `succeeded` may be non-zero), ids are unique, trimmed and bounded.

**Two different ceilings, and conflating them was a defect.** `MAX_PROVIDER_OFFER_COUNT` (200) is what **one provider** may validly contribute, before aggregation; `MAX_RESPONSE_OFFERS` (60) is what the **final aggregated** `offers` array may carry. The client used to bound each summary's `offerCount` by the final ceiling, so a provider that legitimately returned 100 validated offers — of which aggregation kept 60 — had its truthful summary rejected as malformed. The response was correct; the check was wrong. The fix is emphatically _not_ to cap the reported count at 60: a summary must keep reporting the provider's actual validated contribution **before** deduplication and truncation, because that number is the only thing that makes `offers.length <= successfulContribution` say anything about where the offers came from. Both the trusted registry's `maximumOfferCount` validation and the client's summary validation now read the one shared constant, so neither side keeps a private literal that can drift from the other.

**The offers must be ones the summarized providers could have supplied.** Let `successfulContribution` be the sum of `offerCount` over the summaries whose status is `succeeded`. Then for every result envelope:

```
offers.length <= successfulContribution
```

The inequality is deliberately one-directional, and equality is never required. Deduplication across providers and the aggregate ceiling can make the **final count lower than the contribution count**, which is the normal, correct case; demanding equality would reject good responses. All three of these are valid: contribution 12 with final 12; two providers contributing 12 each with final 12 after duplicate removal; contribution 100 with final 60 after the aggregate ceiling. But nothing downstream of the providers can _create_ an offer, so the final list can **never legitimately be larger** — twelve offers beside a single succeeded provider reporting one describes something that cannot have happened, and that case was previously accepted. Alongside it: `success` requires offers, a positive contribution, no failed or cancelled summary and at least one succeeded one; `empty` requires zero offers, zero contribution and every summary `empty`; `partial` **with** offers requires a positive contribution, at least one failed or cancelled summary and at least one succeeded one; `partial` **without** offers requires zero contribution, at least one failed or cancelled summary, at least one `empty` summary and no succeeded summary — a succeeded provider there would mean offers were contributed and then vanished.

The declared response `Content-Type` is checked before parsing, and **HTTP status and envelope status must agree**: 200 may carry only `success`/`partial`/`empty`, and 400/415/503 may carry only `error`. A 500 with a cheerful success body, or a 200 with an error, means something rewrote the response, so neither half is trusted. An invalid envelope is rejected, never sanitized into a valid one.

**One request, including under React Strict Mode.** The repository yields one microtask before calling `fetch` and re-checks the signal. Strict Mode’s development mount → cleanup → mount cycle would otherwise have the first mount’s request already on the wire before its cleanup ran, so the server saw two searches for a page loaded once. The yield lets the cleanup land first, so the abandoned run never opens a connection. It is a microtask, not a timer, not deduplication, and not environment-specific — it simply refuses to start work the caller has already cancelled. No request body is logged, and no Search Intent is written to `localStorage`, `sessionStorage` or cookies.

**Coverage crosses the boundary with the offers.** `FlightOfferSearchResult` carries `coverage: "complete" | "partial"`, mapped from the envelope status (`success`/`empty` → complete, `partial` → partial; the in-process demo wrapper is always complete). Without it an incomplete search is indistinguishable from a complete one — same cards, same filters, same count — so Results shows a visible disclosure beside the standing demonstration notice when partial coverage returns offers, renders a truthful _incomplete search_ state with Retry instead of the definitive "no options" state when it returns none, and Details shows the same disclosure and replaces "could not be found" with "could not be verified" when the selected offer is missing under partial coverage. Filters, Sort and Highlights still operate over whatever came back, and coverage never enters request identity or any URL.

Request identity is Search Intent + retry token + allowlisted scenario. Filters, Sort, the selected offer id, card expansion, timeline state, provider-preview state, URL canonicalization and scroll position are all absent, so none of them can cause a second search.

## 13. Demonstration-only scope

Every offer remains locally generated and marked `isDemonstration`. The existing disclosures stay visible, and no copy introduces "live results", "confirmed price", "real-time fare", "book now" or "continue to partner". A functional internal API does not make the inventory live.

## 14. Exclusions

Not implemented and not implied: any real provider API, adapter or SDK; provider credentials; outbound network requests of any kind; affiliate redirect or the trusted hand-off URL builder at runtime; commission tracking; real provider branding; booking; payment; seat selection; passenger forms; saved searches; persistent audit logging; persistent caching; analytics or monitoring SDKs; customer accounts; email; PDF; multi-city; whole-month search; AI recommendation.

External provider onboarding and affiliate redirect remain **pending**. Booking and payment remain permanently outside GTAI core.

## Public presentation of the demonstration runtime (V2.8-A)

V2.8-A changed nothing in this module. The registry, adapter contract, cancellation, timeouts, validation, normalization, failure taxonomy and audit model are exactly as frozen in V2.7, and `verify:providers` still passes 294/294.

What changed is how the _public site_ describes the runtime's output. The single enabled provider is `gtai-local-demo`, its offers are locally generated, and the website now says so on the homepage, on Results, on Details, inside the provider preview, and on the About, Terms and Affiliate Disclosure pages — through one shared component reading one shared statement.

Two consequences are worth recording here because they constrain the next stage:

- **The demonstration notice is unconditional.** It is correct while every offer is generated. When an approved integration is activated, the notice has to become conditional on the data's actual source; leaving it unconditional would understate a real result, and removing it wholesale would overstate one.
- **Results and Details are `noindex`** precisely because their content is generated. If that stops being true, the indexing decision has to be revisited deliberately rather than inherited.

No external provider, credential, environment variable or outbound request was introduced. The V2.7 boundary protections are re-asserted by regression checks in `verify:partner-readiness` as well as by `verify:providers`.

---

## V2.8-B — the external provider contract layer

The V2.7 runtime described above is **unchanged**. One provider is enabled,
`gtai-local-demo`, it is local and deterministic, and `provider-registry.ts`
does not import the external layer at all.

V2.8-B adds a sibling layer under `providers/external/` that describes what a
_live_ provider integration must satisfy, without performing one.

### Inactive transport

`ExternalProviderTransport` is the interface a live transport will implement.
The only implementation shipped is `InactiveExternalProviderTransport`: zero
network calls, a typed `notConfigured` failure, an already-aborted signal
honoured first so a cancelled caller yields `aborted` rather than a
configuration fault, and fully deterministic. It is a member of each provider
definition, so a future integration must replace it rather than merely add the
first call.

### Activation

Four states — `unavailable`, `configured`, `active`, `suspended`. The operator
directive is consulted before configuration completeness, so credentials landing
in a deployment can never activate a provider on their own. GTAI ships
`withheld` and an empty provider list.

### Failure taxonomy

Fifteen external categories map onto V2.7's eight runtime codes, with the
external category preserved in `internalCode`. The orchestrator continues to see
only the V2.7 vocabulary it already acts on.

### Policies

Retry (bounded attempts, deterministic backoff, parameterized jitter, abort
checked first), timeout (connect / request / total deadline), and rate limiting
(sliding window, burst, concurrency, bounded queue) are pure functions over
caller-owned state. None performs I/O.

### Audit

A separate privacy-minimized summary type whose fields cannot reconstruct a
trip. The shipped sink is non-persistent; a persistent one requires retention,
access, encryption and deletion policies first.

See `docs/implementation/V2_8_B_PROVIDER_INTEGRATION_READINESS.md`.

---

## V2.8-C Duffel test adapter contract

V2.8-C adds an unavailable `duffel-test-contract` facade outside the runtime
registry. It cannot be selected by the provider strategy, and its transport
contains no outbound network implementation. The only modeled origin is
`https://api.duffel.com`, used as contract metadata; request builders emit
relative paths only.

The future secret reference is `DUFFEL_ACCESS_TOKEN`. It is server-only,
unresolved, absent from client configuration, and never logged or included in a
request description. The minimal response subset excludes passenger identity,
documents, booking, order, payment, and raw provider payloads. Safe failures
retain no authorization header or provider response body.

See `docs/implementation/V2_8_C_DUFFEL_TEST_ADAPTER_CONTRACT.md`.

---

## V2.8-D credential deployment plan

V2.8-D permits one future server-only variable name and adds a deterministic
credential resolver. Resolution can report missing, present-but-inactive,
invalid-shape, or forbidden-public-name; every state remains `unavailable`.
The raw value is held in an opaque capsule whose serialization and inspection
produce `[redacted:duffel-token]`.

The shipped Duffel activation directive is `withheld`. The inactive transport
does not import the resolver or its future plaintext accessor, the runtime
registry still excludes Duffel, and the local deterministic provider remains
the sole active provider. Local `.env.local` and Vercel Preview provisioning are
documented for a later controlled release, not performed here.

The privacy boundary stores no raw authorization header, query-token URL,
credential-bearing request, or persistent audit record. See
`docs/implementation/V2_8_D_DUFFEL_TEST_CREDENTIAL_DEPLOYMENT_PLAN.md`.

## V2.8-E disabled Duffel test runtime adapter

V2.8-E adds a server-only authenticated transport and runtime-adapter
composition seam. Both remain excluded from the registry. The activation
directive is `withheld`, normal search still uses `gtai-local-demo`, and
automated verification uses only injected in-memory fetch doubles.
