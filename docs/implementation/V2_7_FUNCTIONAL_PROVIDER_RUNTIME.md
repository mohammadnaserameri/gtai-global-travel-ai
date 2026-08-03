# GTAI V2.7 — Functional Provider Runtime Foundation

**Status:** Implemented locally through V2.7, **uncommitted**, pending external review.
**Base checkpoint:** `7f0d6ba0baf2609ed8e074c5f6f0ea8faabb7074` (V2.6 — Functional Flight Details, frozen)
**Specification:** `docs/reference/09_PROVIDER_RUNTIME.md`
**Branch:** `v2.7-functional-provider-runtime`

---

## 1. Scope implemented

| Capability                                                   | State                   |
| ------------------------------------------------------------ | ----------------------- |
| Server-only provider runtime under `src/server`              | Done                    |
| Trusted provider registry with construction-time validation  | Done                    |
| Local deterministic provider adapter (only enabled provider) | Done                    |
| Extracted shared offer generator                             | Done                    |
| Internal `POST /api/flights/search` with manual validation   | Done                    |
| Versioned, client-safe response envelope                     | Done                    |
| Orchestration with per-provider abort scopes                 | Done                    |
| Typed failure taxonomy (8 codes)                             | Done                    |
| Provider-output validation with exact-key rejection          | Done                    |
| Canonical aggregation and deterministic ordering             | Done                    |
| Privacy-minimized audit model, no-op sink                    | Done                    |
| `ApiFlightOfferRepository` with full response validation     | Done                    |
| Results and Details on the API runtime                       | Done                    |
| Server-side production scenario gate                         | Done                    |
| Byte-bounded streaming body reader                           | Done                    |
| Exact provider-outcome and API-envelope validation           | Done                    |
| HTTP/envelope agreement and redirect refusal                 | Done                    |
| One request under React Strict Mode                          | Done                    |
| Partial-coverage contract, surfaced to the customer          | Done                    |
| Intent-aware offer validation at both boundaries             | Done                    |
| Semantic API envelope validation                             | Done                    |
| Deterministic verification (`verify:providers`)              | Done — 227/227          |
| Real provider, live inventory, redirect, booking, payment    | Not started (by design) |

## 2. Architecture

```
src/features/flights/                     (client-safe)
  demo-offer-generation.ts       extracted pure generator — one source of truth
  demo-flight-offer-repository.ts  compatibility wrapper for verification only
  flight-offer-repository.ts     contract + DevelopmentScenario allowlist
  flight-offer-validation.ts     canonical FlightOffer validator, exact keys
  flight-search-api-contract.ts  versioned wire types, forbidden-key sweep
  api-flight-offer-repository.ts the runtime repository
  runtime-repository.ts          single shared instance + scenario reader

src/server/                               (server-only)
  server-only.ts                 in-repo guard, no dependency added
  flights/flight-search-request-validation.ts
  flights/flight-search-response.ts
  flights/providers/provider-runtime-types.ts
  flights/providers/provider-registry.ts
  flights/providers/provider-timeout.ts
  flights/providers/provider-search-validation.ts
  flights/providers/provider-response-normalizer.ts
  flights/providers/provider-audit.ts
  flights/providers/provider-search-orchestrator.ts
  flights/providers/adapters/local-deterministic-provider-adapter.ts

src/app/api/flights/search/route.ts
scripts/verify-providers.ts
```

Nothing was duplicated. Search Intent validation, offer generation, offer-id creation, filter logic, sort logic, highlight logic, Details resolution, locale parsing and error-state copy are all the existing implementations, imported.

## 3. The generator extraction

`demo-flight-offer-repository.ts` was 738 lines of generator plus a thin class. The generator moved wholesale to `demo-offer-generation.ts` and now exposes `generateDemoOffers(intent)`; the old file is a ~75-line wrapper.

That wrapper is no longer the runtime. It survives only so the deterministic verification scripts can exercise generation in-process without standing up an HTTP server, and so the scenario shape stays comparable across both paths. There is one generator with two callers, not two implementations — which is why offer ids through the full server runtime are byte-identical to the frozen V2.6 set.

## 4. Server-only without a dependency

V2.7 was not allowed to install anything, so `import "server-only"` (an npm package) was unavailable. `src/server/server-only.ts` provides the same guarantee in-repo: it throws at module-evaluation time if `window` exists, and every server entry module imports it.

The runtime throw is the backstop. The load-bearing part is static: `verify:providers` asserts no file under `src/components` or `src/features` imports `src/server`, no client-safe module re-exports one, and the client repository imports no registry, adapter or orchestrator.

One consequence worth recording: server modules use relative imports rather than the `@/` alias, because the verification harness runs compiled CommonJS under plain Node, which does not resolve the bundler alias. This is the same accommodation V2.6 made for `flight-details-url.ts` and `i18n/routing.ts`.

## 5. Corrections made during this round

- **Unknown properties could reach a canonical offer.** `isCanonicalFlightOffer` originally checked only the fields it expected, so an extra one — a provider offer reference, a commission weight, a freshness timestamp — would have passed and then flowed into Filters, Sort, Highlights, Details and the API response. It now checks keys **exactly** at every level (offer, itinerary, segment, layover, local date-time, baggage, fare, ranking metadata). "No provider-specific property reaches `FlightOffer`" is now a property of the code rather than a hope about adapters.
- **`verify:details` check 63 was tied to one construction call.** It matched the literal `createRepository(devScenario)` and a fixed dependency array. Once the runtime moved behind the API that check would have passed vacuously, so it was rewritten as an architectural assertion: the invalid-offer-id guard must precede _every_ repository acquisition and _every_ `AbortController` in the effect body, and both preconditions must be dependencies — matched independently of spelling or array order.
- **Two verification-authoring bugs**, both found by running the suite: an envelope check asserted the departure date was absent from a success response, but an offer legitimately contains its own schedule (corrected to assert the canonical Search Intent and its parameter vocabulary are absent); and a no-auto-retry check used a `/retry/i` regex that the legitimate `retryToken` field defeated (corrected to assert the call count).
- **Fixture registrations disagreed with their adapters' ids**, which the registry correctly refused. The fixtures were fixed, not the registry — the rejection is a feature, and it is now check 76.

## 5a. Request identity and the two experiences

Both experiences now resolve their repository through one shared module (`runtime-repository.ts`), which holds a single `ApiFlightOfferRepository` instance and the single definition of how the development-scenario escape hatch is read. Previously each page carried its own copy of both; they can no longer drift into different runtimes or different scenario vocabularies.

The fetch key is `serializeSearchIntent(intent) # retryToken # devScenario` on both pages — unchanged from V2.6 in structure, and now carrying the scenario as a validated allowlist member rather than a raw string. `verify:providers` extracts each key's template literal and asserts on its interpolations directly, so Filters, Sort, offer id, card expansion, timeline state, provider-preview state, canonicalization and scroll position are all provably absent rather than merely believed to be.

The V2.6 no-fetch gates survive intact and now prevent a _network request_ rather than an in-process generation: an invalid offer id or an invalid Search Intent yields a `null` key, and the effect returns before acquiring a repository or constructing an `AbortController`. Effect cleanup aborts obsolete requests; results are tagged with the key they answer, so a superseded completion is ignored during render rather than overwriting newer state. Retry bumps the token, which changes the key, which authorizes exactly one new request — and `retryToken` was added to the Details effect's dependency array so React hook correctness is preserved rather than traded away for request count.

## 5b. What the boundary actually forbids

Three things are enforced structurally rather than by review:

- **The client cannot reach the runtime.** No file under `src/components` or `src/features` imports `src/server`; no client-safe module re-exports one; `ApiFlightOfferRepository` imports no registry, adapter or orchestrator; and no external host appears in client source.
- **The client cannot configure the runtime.** `providerId`, `timeoutMs` and `maximumOfferCount` are absent from the request allowlist and never read by request validation, so no payload can select a provider, extend a timeout or raise an offer ceiling.
- **The runtime cannot leak into the client.** The response envelope has no field for a provider payload, provider error, URL, credential or `searchContextId`; a forbidden-key sweep rejects any that appear at any depth; and the client validates the envelope structurally rather than casting it.

## 5c. Pre-approval corrections

Seven corrections plus one cleanup, applied before external review. Each fixed something that was genuinely wrong rather than merely unpolished:

1. **The scenario gate was client-side only.** The client returned `"normal"` in production, but anyone could POST `error` or `slow` straight to the route and be served. Validation now takes an explicit `allowDevelopmentScenarios` policy that the route decides from the environment and passes down; production rejects all three with the same 400 an unknown scenario gets. Verified live: on the production build `empty`, `error` and `slow` all return 400 while `normal` returns 200.
2. **A cancellation was audited as a provider failure** — `search.failed` with `failureCode: "cancelled"`. Any fault tally would have counted it. There is now a distinct `search.cancelled` event and `cancelled` status with a `null` failure code. The old verification check _certified_ the wrong behaviour by accepting `failureCode === "cancelled"` as proof of non-fault handling; it was rewritten to require one started event, one cancelled event, zero failed events, and a null code.
3. **Provider-outcome validation was partial.** It checked the discriminant and the offers but not the outcome's key set, not the failure's key set, not the failure code against a runtime allowlist, and not whether `retryAfterMs` belonged on that code at all. All four are now exact, the forbidden-key sweep covers the whole outcome, and the orchestrator consumes the rebuilt validated failure instead of the adapter's object.
4. **The body was read before it was bounded.** `request.text()` consumed the whole stream and `raw.length` then measured UTF-16 units — so a limit of 8,192 accepted a 16,096-byte Persian payload. `readBoundedRequestBody` now streams, counts `byteLength`, cancels the reader on excess and decodes only accepted bytes. Content-Type matching became an exact media-type comparison, which is what rejects `application/jsonp` and `text/application/json`.
5. **The client trusted HTTP and envelope independently.** It now requires them to agree, checks the response Content-Type before parsing, enforces exact envelope and provider-summary keys, runs the forbidden-key sweep over error envelopes too, and sets `redirect: "error"`.
6. **Strict Mode produced two development requests.** The first mount's `fetch` was already on the wire before its cleanup ran. One microtask yield plus a second signal check means the abandoned run never opens a connection — verified as exactly one request for both Results and Details on the development server.
7. **Partial coverage was discarded.** The API preserved `status: "partial"` and the repository threw it away, making a reduced result set indistinguishable from a complete one. `FlightOfferSearchResult` now carries `coverage`, and both pages surface it.

The cleanup: `runWithAbortScope` attached an abort listener with `{ once: true }` and never removed it when the work finished first. A named handler is now detached in a `finally`.

## 5d. Boundary-defect corrections

A second adversarial pass against a real generated offer found that structural validation, however exact about keys and types, said almost nothing about _meaning_. Seven further corrections:

1. **Offers are now validated against the Search Intent.** The previous validator accepted a mutated offer with arbitrary ranking totals, a segment duration divorced from its own timestamps, an itinerary departure that did not match its first segment, a disconnected route, a layover at an airport never visited, a broken price relationship, two outbound legs on a round trip, and a `"99:99"` clock. `flight-offer-intent-validation.ts` is one shared pure module applied on both sides of the boundary; see `09_PROVIDER_RUNTIME.md` for the rule set.
2. **A pre-aborted scope no longer invokes the adapter.** The abort promise resolved immediately but `work(scope.signal)` was still called, so an abandoned search reached the provider anyway. The guard now returns before `work` is referenced.
3. **A synchronous adapter throw no longer escapes with a listener attached.** The adapter call moved inside the `try`, and a synchronous throw is normalized into the ordinary rejected-work path.
4. **An adapter-reported cancellation is now a cancellation.** `{ ok: false, failure: { code: "cancelled" } }` previously became `search.failed` with a `cancelled` code — the exact conflation the earlier round had fixed for race-detected cancellations only.
5. **Outcome shapes are exact plain objects.** `hasOnlyKeys` accepted prototype-supplied fields and an own `retryAfterMs: undefined`; both are now rejected.
6. **The API envelope is validated semantically.** It previously accepted `success` with zero offers, `empty` with offers, `success` beside a failed provider, `partial` with all providers succeeding, duplicate offer ids, duplicate provider ids and a failed provider reporting a positive offer count.
7. **Abort survives response reading.** An abort thrown by `response.json()`, or a signal flipping during parsing, previously became the customer-visible error state — so navigating away could show a failure that never happened.

Plus body cleanup: a declared-oversize body is now cancelled rather than abandoned, and the reader lock is released on every path.

Three verification fixtures were themselves contradictory (`empty` with no provider summary, `partial` with all providers succeeding) and were corrected rather than exempted — they were precisely the shapes correction 6 now rejects.

## 5e. Boundary-integrity corrections

A third pass found six defects that structural _and_ intent-aware validation both missed, because each one is about a fact the payload asserts rather than a relationship between fields it already carries.

1. **Same-turn cancellation now invokes zero adapter work.** The pre-abort guard only covered a signal that was _already_ aborted. A caller that aborted in the same JavaScript turn as the call still reached the provider, because everything up to the first `await` runs synchronously during the call; the abort then won the race and the outcome read `cancelled`, which was true and beside the point. One microtask yield after registering the listener, then re-checking the signal, makes the invocation count zero. Normal execution still invokes exactly once; timeout, synchronous throw and asynchronous rejection all still reach cleanup.
2. **A `LocalDateTime` must be its own epoch, read at its own airport.** Nothing required the displayed date and time to match the authoritative epoch minute, so a payload could show a schedule that does not exist while every epoch-based check passed. Departure is now re-derived in the origin airport's zone and arrival in the destination's, through the shared `resolveAirportTimeZone` + `toLocalDateTime`. The flexibility window is checked against that re-derived date rather than the submitted string.
3. **Every segment and layover airport must exist in the GTAI directory.** `ZZZ`, `ABC` and `XXX` were regex-valid and therefore accepted. Membership is decided by the shared location/timezone source of truth, not a second allowlist, and a layover must equal both the preceding destination and the following origin.
4. **Round-trip turnaround comes from one shared policy.** The generator required 60 minutes; the validator required only "inbound after outbound", so it accepted a one-minute turnaround. `MIN_ROUND_TRIP_TURNAROUND_MINUTES` now lives in `flight-offer-policy.ts` and both sides import it.
5. **Generator and validator share one demonstration identity catalog.** The validator accepted any non-empty carrier and provider name, so `AC` / _Air Canada_ and `Booking.com` were valid on an offer the interface calls a demonstration. `demo-flight-catalog.ts` owns the fictional identities; carrier id, carrier name, flight-number mark, validating carrier and booking provider are all checked against it, as pairs rather than individually.
6. **API envelopes are contribution-aware.** `offers.length <= sum(offerCount of succeeded summaries)`. Equality is deliberately not required — deduplication and the aggregate ceiling legitimately make the final count **lower** — but nothing downstream can create an offer, so a final list **larger** than the contribution is impossible and was previously accepted (twelve offers beside one succeeded provider reporting one). The four status-specific shapes are stated in `09_PROVIDER_RUNTIME.md` §12.

Separately, `scripts/verify-flights.ts` carried three hard-coded fixture date pairs anchored at `2026-07-31`. Those dates passed into the past, and since GTAI refuses a past departure date by design the fixture stopped **building** rather than stopped passing — `verify:flights` crashed rather than failing a check. The pairs are now relative to `todayIso()` and the sweep was widened from three pairs to six to compensate for no longer pinning those exact generator seeds.

## 5f. Freeze corrections

The last two defects found before freeze. Both are about a check being applied where it does not belong rather than a check being absent.

1. **The canonical validators were not total — they could throw.** Every canonical instant is eventually handed to `Intl.DateTimeFormat`, which raises `RangeError: Invalid time value` outside the ECMAScript time-value range. Shifting every epoch of a valid generated offer by 200,000,000,000 minutes — preserving segment chronology, durations, itinerary totals and ranking totals, so the payload stayed internally consistent in every relationship the validator checks — made `isCanonicalFlightOfferForIntent`, `validateProviderOutcome` and `validateApiResponse` all throw instead of rejecting. A raw `RangeError` would then have escaped past the failure taxonomy, past the audit event and out to Results or Details as a state no page has.

   Two changes, layered. Canonical numeric validation now uses `Number.isSafeInteger` rather than `Number.isInteger` (epochs, durations, prices, stop counts, ranking totals), because past 2^53 the integers stop being distinct and every "total equals the sum of its parts" identity quietly stops being decidable. And epochs additionally go through a shared `isValidEpochMinutes`, which bounds them to the Date range in both directions via one documented `MAX_EPOCH_MINUTES` constant rather than duplicated arithmetic. On top of that, the airport-local conversion and both boundary validators wrap their calls narrowly so an unexpected throw becomes a rejection: the server reports `invalidOffer` → `malformedResponse`, the client returns `null`, and the repository raises the ordinary `FlightOfferRepositoryError`. The `catch` blocks accept and inspect nothing; they cannot turn an invalid offer into a valid one.

2. **One constant carried two meanings.** `MAX_RESPONSE_OFFERS` (60) bounds the final aggregated array, but the client was also using it to bound each provider summary's `offerCount`. A provider that validly contributed 100 offers, of which aggregation kept 60, therefore had its truthful summary rejected — a correct response failing a wrong check. `MAX_PROVIDER_OFFER_COUNT` (200) is now a distinct client-safe constant in the API contract; the trusted registry imports it in place of its private `200`, and the client bounds summaries by it. The summary is **not** capped to 60: it keeps reporting the pre-deduplication contribution, because that is what makes `offers.length <= successfulContribution` a statement about provenance rather than a tautology.

## 6. Deterministic verification

`npm run verify:providers` — **294/294 checks pass**, against a required minimum of 269.

Coverage: registry acceptance, duplicate and empty ids, disabled providers never executed, zero and out-of-range timeouts and offer limits, deterministic ordering, adapter/registration id agreement, and the absence of any request-derived provider selection or timeout; adapter typed success, cross-run determinism, offer ids matching the frozen generator, intent sensitivity, all four scenarios, no network or environment access, no redirect or affiliate field; abort before and during execution, provider timeout, cancellation kept distinct from timeout, timer and listener disposal, idempotent dispose, late resolution ignored, late rejection absorbed, zero unhandled rejections; all eight failure codes staying typed and raw exception text never reaching an envelope; validation rejecting bad discriminants, excessive counts, malformed offers, invalid offer ids, non-finite and non-integer prices, unsupported currencies, invalid itinerary counts, broken chronology, invalid airport codes, URL-bearing fields, and unknown provider fields at top and nested level; orchestration success, empty, partial and aggregate failure, malformed-provider isolation, ceiling enforcement, deterministic and order-independent aggregation, duplicate-id collapse; `searchContextId` opacity, non-derivation and absence from the envelope; audit exclusion of route, dates, travelers, cabin, canonical intent, raw payloads, cookies, IP, user agent and account ids, exact minimized key set, no-op default sink, no persistent logging anywhere; API acceptance and every rejection path including arbitrary provider ids and a raw Results URL as intent, non-reflecting rejection reasons, `no-store`; envelope validation for success, partial, empty and error, and the absence of provider errors, `searchContextId`, URLs and canonical intent; client repository path, method, headers, allowed fields only, supplied signal, pre-aborted short-circuit, single attempt, offer mapping, empty mapping, and rejection of malformed, URL-bearing, wrong-version and wrong-mode responses, plus no logging, no persistence and no unchecked assertion; and the full boundary, dependency and scope assertions.

The correction round added 34 more: the production gate rejecting each non-normal scenario and accepting `normal`, development accepting all four, and the gated rejection being indistinguishable from an unknown one; invented failure codes, extra outcome and failure keys, misplaced and invalid `retryAfterMs`, and URL/rawPayload/stack-bearing failures all rejected, plus the orchestrator consuming the rebuilt failure; declared-length and streamed-length rejection, the multibyte byte-count proof, empty-body rejection and single-consumption round-trip; exact media-type acceptance and near-miss rejection; error envelopes carrying `redirectUrl`, `searchContextId` or `rawError` rejected, success envelopes with extra diagnostics rejected, provider summaries with extra properties rejected, HTTP 500-with-success, 200-with-error and unexpected statuses rejected, non-JSON content types rejected; pre-aborted and same-turn-aborted searches issuing zero fetches while a normal call issues one and a retry one more, and the deferred start being a microtask rather than a timer or cache; coverage preserved for partial and complete, the demo wrapper reporting complete, both pages' partial architecture, and coverage absent from request identity and URLs; and the abort-listener cleanup across success, failure, timeout and cancellation with zero unhandled rejections.

The boundary-defect round added 47 more: every generated offer still passing intent-aware validation and the frozen offer ids unchanged, plus rejection of mismatched currency, wrong itinerary count, two outbound legs, unrelated origin and destination airports, a disconnected route, `"99:99"` and `"24:00"` clocks, segment duration/epoch mismatch, itinerary departure and arrival mismatches, a layover at an unvisited airport and a wrong layover duration (both driven from an offer that genuinely connects, so the mutation cannot be a no-op), itinerary and ranking total mismatches, a cabin other than the one searched, a price that does not reconcile, and operating-carrier lists that are missing or padded; pre-abort invoking zero work, a normal scope invoking exactly one, a synchronous throw leaving no listener, an adapter-reported cancellation becoming a cancelled run audited with a null code, and an all-cancelled search not claiming empty; prototype-derived outcomes and failures rejected, own `retryAfterMs: undefined` rejected on every code, all four valid shapes accepted and non-plain objects refused; success-with-zero-offers, empty-with-offers, success-beside-failure, partial-with-all-success, duplicate offer ids, duplicate provider ids and status/count disagreement all rejected while the three consistent envelopes are accepted and envelope offers are checked against the intent; abort preserved through `response.json()` rejection and through a mid-parse signal flip, malformed JSON still mapping to the safe error, and a valid response still succeeding; and declared-oversize bodies cancelled without a read, streamed overflow stopping at the first over-limit chunk, and a valid body read once.

The boundary-integrity round added 41 more: same-turn abort invoking zero work, returning `cancelled` and leaving no listener, with normal execution still one invocation and timeout plus synchronous-throw behaviour intact (check 208 was confirmed non-vacuous by temporarily removing the microtask yield, at which point it — and only it — failed); false segment departure and arrival times and dates rejected while every generated instant round-trips through its airport's zone, and a search spanning the November DST transition still validating; unknown segment origins, destinations and intermediate airports and unknown layover airports rejected — the intermediate case renamed consistently on both segments and the layover so continuity, layover matching and every duration still agree and directory membership is the only thing broken — with real connection airports still accepted; 0-, 30- and 59-minute turnarounds rejected and 60 accepted, on offers rebuilt through the shared timezone conversion so the shifted instants stay honest, plus a source assertion that the literal `60` exists in exactly one module both sides import; uncatalogued carrier ids, id/name mismatches, a flight-number mark belonging to another carrier, uncatalogued and mismatched validating carriers, and `AC`/_Air Canada_, `BA`/_British Airways_, _Expedia_ and _Booking.com_ fixtures all rejected, every generated identity catalogued, and a source assertion that neither generator nor validator keeps its own copy of the names; twelve offers beside a succeeded contribution of one rejected, partial-with-offers from only empty and failed summaries rejected, partial-with-no-offers beside a succeeded provider rejected, and the four legitimate envelopes — including a success whose final count is lower than the contribution — accepted; and reconfirmation of intent-aware validation, exact provider outcomes, stable offer ids, request-key isolation, the body-byte ceiling and the unchanged dependency set.

The freeze round added 26 more, all driving the real validators and constants rather than restating their logic. Totality: normal generated epochs valid; the boundary epoch accepted and convertible; positive and negative out-of-range epochs rejected; unsafe integers, floats, `Infinity`, `NaN`, strings and `null` rejected; the shifted internally-consistent offer rejected by both validators **without throwing** (a helper records whether a call threw, so "rejected" and "exploded" stay distinguishable); the server reporting `invalidOffer` and not throwing; the client returning `null` and not throwing; the repository raising `FlightOfferRepositoryError` and specifically not a `RangeError`; the orchestrator surfacing zero offers and a failed provider; every generated offer still accepted and offer ids unchanged. Contribution bound: the two constants distinct; the registry accepting exactly `MAX_PROVIDER_OFFER_COUNT` and rejecting one more; a summary accepting exactly it and rejecting one more; **contribution 100 with a final list of 60 accepted**; two-provider deduplication accepted; a final count exceeding the contribution still rejected; `MAX_RESPONSE_OFFERS` still bounding the final array at 61; one shared constant used by registry and client with no private duplicate; the shipped single-provider runtime still contributing exactly 12; partial coverage and request-key isolation unaffected.

Both fixes were confirmed load-bearing by temporarily reverting them: with the epoch range and the shared bound removed, exactly 8 of the 294 checks failed, and a direct probe confirmed `Intl.DateTimeFormat.formatToParts` raises `RangeError: Invalid time value` at the shifted epoch while converting cleanly at `MAX_EPOCH_MINUTES`.

`verify:locations` 42/42, `verify:dates` 66/66, `verify:flights` 142/142, `verify:filters` 149/149, `verify:polish` 88/88 and `verify:details` 106/106 all still pass.

## 7. Browser and network verification

Request counts below were first measured on a **production build** (`next start`). At the time entries A–I were recorded, the initial Results load issued exactly one `POST /api/flights/search` in production while the dev server issued two — the first aborted by React StrictMode's mount → cleanup → mount cycle. The pre-approval correction round removed that doubling: the repository now yields one microtask before calling `fetch` and re-checks the signal, so the abandoned mount never opens a connection. **Development and production both issue exactly one request**, re-measured in entry J.

- **A. Results success** — one request; `mode: "demonstration"`; 12 offers; ids `demo-1wamnh8-0…11`, identical to V2.6; `Cache-Control: no-store`; no external request; no `searchContextId`, provider URL, affiliate URL, stack trace or raw provider error in the response.
- **B. Request isolation** — twelve interactions (Stops, Carrier, Price, Duration, Sort, chip removal, Clear all, card expansion, provider preview open and close, browser Back and Forward) produced **zero** additional search requests.
- **C. Error and Retry** (dev scenario) — truthful error copy with no technical text; zero requests during a three-second idle, so no automatic retry; Retry produced exactly one; no loop afterwards.
- **D. Empty** (dev scenario) — one request, truthful "0 demonstration options" state, no external request.
- **E. Details deep link** — one request; correct offer; stale `maxDuration=900` and unknown `carriers=BOGUS` canonicalized away; timeline toggle and provider preview produced zero further requests; Back URL canonical.
- **F. Invalid Details** — invalid offer id and invalid Search Intent each produced **zero** search requests; the invalid state rendered with no loading indicator.
- **G. Cancellation** (slow scenario) — navigating away mid-flight left no stale offers, zero unhandled rejections and zero window errors; the abandoned request never completed.
- **H. Responsive and RTL** — full six-width sweep (360/390/768/1024/1280/1440) in English and Persian, plus Arabic and French at 360/768/1440: zero horizontal overflow, zero over-wide elements, zero sub-44 px targets, and all ten RTL route arrows mirrored. The only console error in the whole production session was a deliberate marker.
- **I. Internal API security** — direct probes confirmed `405` for `GET`, `415` for a wrong or missing content type, `400` for malformed JSON, empty body, unknown top-level field, unsupported version, unsupported scenario, negative retry token and invalid intent, `503` for total provider failure, and `200` for empty. No CORS header on any response.

- **J. Boundary-integrity round re-verification** — development and production each issued **exactly one** request on the initial Results load and **exactly one** more on Details. Two sort changes, opening the Filters sheet, a stop-filter toggle, applying it, URL canonicalization, provider-preview expansion and two timeline toggles produced **zero** additional requests. An invalid offer id and an invalid Search Intent each produced **zero**. The dev error scenario produced one request (503) and Retry exactly one more. Navigating away from the slow scenario mid-flight left one aborted request, no error state, no stale offers and zero console errors. Production rejected the `empty`, `error` and `slow` scenarios with `400` while accepting `normal`; both servers accepted `application/json; charset=utf-8` and rejected `application/jsonp` with `415`. Offer ids were `demo-1yuhsd4-0…11`, identical between development and production. Only catalogued fictional identities appeared — Aurora Air, Maple Wings, Skyline Airways, Meridian Air, Atlas Connect, Northstar Travel, Voyage Hub — with flight numbers whose marks matched their carriers (`DEMO-AUR-…` on Aurora Air, `DEMO-MPW-…` on Maple Wings); no real airline or agency name appeared anywhere. Local dates and times were unchanged from V2.6. English, French, Persian and Arabic were checked at 360/390/768/1024/1440 across Results and Details: `dir` correct, Gregorian dates in Persian and Arabic, zero horizontal overflow at every width, zero console errors.

## 8. Known limitations

1. **No real provider exists.** Every schedule, price and identifier is generated locally; the runtime is real, the inventory is not.
2. **Five global footer links are 36 px tall**, below the 44 px target size. They are site chrome present since before V2.7 and unchanged by it, not part of the flight surfaces, and are recorded here rather than silently counted as passing.
3. **The audit sink is a no-op.** Events are constructed and shaped but discarded, because retention policy is out of scope for this stage.
4. **Only one provider is enabled**, so `partial` status and multi-provider aggregation are exercised by fixture adapters in verification rather than by the running product.
5. **Development scenarios are production-gated**, so the error, empty and slow paths can only be exercised on a development server.
6. **`src/server` uses relative imports**, an accommodation for the verification harness rather than a stylistic preference.

## 9. Exclusions

Unchanged from the specification: real provider API, adapter or SDK; provider credentials; any outbound network request; affiliate redirect; runtime trusted hand-off URL builder; commission tracking; real provider branding; provider accounts; booking; payment; seat selection; passenger forms; saved searches; persistent audit logging; persistent cache; analytics or monitoring SDKs; customer accounts; email; PDF; multi-city; whole-month search; AI recommendation.

External provider onboarding and affiliate redirect remain **pending**. Booking and payment remain permanently outside GTAI core.
