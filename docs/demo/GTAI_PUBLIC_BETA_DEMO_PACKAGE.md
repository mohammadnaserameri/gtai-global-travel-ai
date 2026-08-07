# GTAI Public Beta demo package

## Release snapshot

- **Production:** https://gtai-global-travel-ai.vercel.app
- **Current public release:** `v2.9.1-public-beta-ui-hotfix`
- **Current main commit:** `bf3e220799875817a342414a23cc58083745e0b8`
- **Production provider mode:** demonstration only (`gtai-local-demo`)
- **Preview Duffel test status:** technically verified behind server-only Preview gates; unavailable unless the approved Preview environment and all gates are present.

## What works now

- Multilingual public pages in English, French, Arabic, and Persian.
- Flight origin and destination autocomplete with city, airport, IATA, localized-name, prefix, and conservative typo matching.
- The same location autocomplete surface in Stays, Cars, and Packages, while those products remain planned and non-transactional.
- Flight date, traveler, cabin, result sorting/filtering, and demonstration Details flows.
- Exactly 12 deterministic demonstration flight offers in Production.
- Clear demonstration disclosures, provider labels, SEO controls, and noindex Results/Details pages.
- A safe public-beta status endpoint at `/api/system/public-beta-status`.

## Production versus Preview

Production is intentionally demo-only. It never selects Duffel, does not read a Duffel credential for search, and cannot be changed by client input, query parameters, Preview flags, or a credential alone. Its runtime registry contains only `gtai-local-demo`.

An authorized Vercel Preview can run real Duffel test search only when every server-side Preview activation gate and the server-held Preview credential are present. Successful Preview results are labelled **Live Preview**. Details resolve from an intent-bound, same-tab snapshot and fail closed if that snapshot is missing, invalid, mismatched, or expired.

The latest recorded Preview verification returned normalized YUL–CDG test offers and resolved the first offer's Details snapshot. Offer counts, airlines, prices, and availability are variable test-provider outputs and are not Production inventory or a commercial partnership claim.

## Not implemented

- Booking or booking links.
- Payment collection or payment fields.
- Duffel Orders API.
- Passenger names, passport details, loyalty accounts, or other passenger personal data.
- Affiliate redirects or commission-earning links.
- Live-provider search in Production.

## Provider safety boundary

- Credentials and Authorization values remain server-only and must never use a `NEXT_PUBLIC_` name.
- The browser cannot choose or force a provider.
- Production fails closed to `gtai-local-demo` before credential resolution.
- Provider payloads are mapped to GTAI's allowlisted offer model; raw payloads and raw provider errors never reach public responses.
- Missing gates, invalid credentials, timeouts, upstream failures, and unusable mappings return safe states rather than silently changing providers.
- Preview activation is technical test permission, not Production or commercial approval.

## Public beta limitations

- Production prices, schedules, airlines, and booking-provider identities are fictional demonstration data.
- The built-in location directory is intentionally limited and is not a complete global place database.
- Stays, Cars, and Packages accept location input for UX evaluation but do not return inventory.
- Preview Duffel availability depends on the protected Preview environment and provider test service.
- Live Preview Details are same-tab and time-limited.
- No account, saved-trip, booking, payment, fulfillment, or post-booking support exists.

## Before any Production live activation

1. Obtain written commercial approval and review enforceable provider terms.
2. Complete legal, privacy, security, accessibility, localization, and public-copy reviews.
3. Issue a Production-specific least-privilege credential outside source control with rotation and revocation procedures.
4. Approve quotas, cost controls, latency objectives, rate limits, retry policy, failure budgets, and monitoring.
5. Measure mapping coverage across representative routes, dates, cabins, currencies, carriers, stops, and edge cases.
6. Test redacted logging and alerting with no token, Authorization, passenger data, or raw provider payload.
7. Rehearse and assign ownership for rollback to `gtai-local-demo`.
8. Create a separate reviewed release that explicitly enables the server-only Production gate. Preview success alone is insufficient.

## Safe product demonstration script

1. Open https://gtai-global-travel-ai.vercel.app and state: “This public beta uses locally generated demonstration flight data; it is not live availability and cannot be booked.”
2. In Flights, type one or two letters in **From** and show progressive city/airport suggestions.
3. Type `istanl` in **To** and show Istanbul as the safe **Best match** typo correction.
4. Select two different locations, choose valid future dates, travelers, and cabin class, then run Search.
5. State that Production returned exactly 12 deterministic demonstration offers from `gtai-local-demo`.
6. Demonstrate Best/Cheapest/Fastest sorting and filters, explaining that these operations do not trigger another provider request.
7. Open one Details page and point out the demonstration disclosure and unavailable booking/payment state.
8. Return home and open Stays, Cars, and Packages to demonstrate their shared location autocomplete; clearly state that inventory search is not implemented for those products.
9. If an authorized protected Preview is available, separately demonstrate a Duffel test search and say: “This is Live Preview test inventory, not Production availability; booking and payment remain unavailable.”
10. End by confirming that Production remains demo-only and that provider activation requires a separate approved release.
