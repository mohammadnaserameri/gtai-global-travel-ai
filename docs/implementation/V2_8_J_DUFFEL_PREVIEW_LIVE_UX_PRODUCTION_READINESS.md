# GTAI V2.8-J — Duffel Preview live UX and Production readiness

## Release boundary

V2.8-J makes the already-gated Duffel test path understandable in Vercel Preview. It does not approve or activate Duffel in Production. Production continues to resolve only `gtai-local-demo` and continues to describe its 12 locally generated offers as demonstration data.

Preview Results labels normalized Duffel test inventory as **Live Preview**, names the test inventory source, warns that availability and prices may change, and states that booking and payment are unavailable. Preview Details carries the same status only when it resolves an unexpired, intent-bound, same-tab snapshot. A missing, malformed, mismatched, or expired snapshot fails closed without a provider request and asks the tester to return to Results.

## Transient and partial outcomes

- Transport failures, upstream timeouts, Create Offer Request failures, and List Offers failures collapse to the existing safe unavailable response. Raw errors and payloads do not cross the server boundary.
- A partially mapped response may show its usable normalized offers with an incomplete-results warning and retry guidance.
- Zero mapped offers never becomes a live-availability claim. The safe empty or unavailable state is shown.
- Credentials, Authorization values, raw Duffel identifiers outside GTAI's namespaced offer ID, raw payloads, and provider error bodies are forbidden from client responses and UI copy.

## Production launch-readiness checklist

The following items are mandatory before any separate Production activation proposal. This document records gates; it grants no approval.

- [ ] Written commercial approval and provider terms reviewed.
- [ ] Security review of credential storage, rotation, least privilege, and incident revocation.
- [ ] Production-specific credential created outside source control and excluded from every `NEXT_PUBLIC_` variable.
- [ ] Provider availability, latency, rate-limit, timeout, retry, and circuit-breaker objectives approved.
- [ ] Mapping coverage measured across representative routes, dates, cabins, currencies, stops, and carriers.
- [ ] Price, schedule, baggage, refundability, and changeability semantics reviewed against provider documentation.
- [ ] Monitoring and redacted alerting tested without raw payload, token, Authorization, or passenger data.
- [ ] Legal, privacy, accessibility, localization, customer-support, and public-copy reviews completed.
- [ ] Explicit rollback to `gtai-local-demo` rehearsed and owned.
- [ ] Booking, payment, Orders, passenger names, passports, loyalty accounts, and affiliate redirects remain separately designed, reviewed, and approved; none is implied by search activation.
- [ ] A new release verifier proves Production activation is explicit, server-only, reversible, and impossible through client input.
- [ ] A separate release is frozen and approved after Production-like testing. V2.8-J is not that release.

## Rollback and limitations

Removing either Preview activation flag or the Preview-only credential returns Preview to demonstration search. Production needs no rollback because this release never activates Duffel there. Live Details remains intentionally same-tab and expires after 15 minutes; a new tab, storage failure, or expired snapshot safely requires a new Results search.
