# GTAI current release state

## Release lineage

| Release                      | Git reference                  | Purpose                                                                                                            |
| ---------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| V2.9.0 Public Beta           | `v2.9.0-public-beta`           | Public-beta closure and hard-disabled Production live-provider control.                                            |
| V2.9.1 Public Beta UI Hotfix | `v2.9.1-public-beta-ui-hotfix` | Location autocomplete across product tabs, conservative typo matching, and search overlay/calendar clipping fixes. |

Current `main` and `origin/main`: `bf3e220799875817a342414a23cc58083745e0b8`.

## Production state

- URL: https://gtai-global-travel-ai.vercel.app
- Mode: public beta, demonstration only.
- Runtime provider registry: `gtai-local-demo` only.
- Flight Results: exactly 12 deterministic demonstration offers.
- Details: demonstration offers resolve; Results and Details remain noindex.
- Duffel: inactive and unavailable in Production.
- Booking, payment, Orders, passenger data, and affiliate redirects: not implemented.
- Sitemap: 24 public URLs; robots allows public crawling and disallows `/api/`.

## Preview state

- Duffel test search is possible only in an authorized Vercel Preview with all server-only gates and its protected credential present.
- Successful offers are normalized and labelled **Live Preview**.
- Live Details require the unexpired, intent-bound, same-tab snapshot.
- Missing gates or unsafe states fail closed; Production behavior is unaffected.
- Preview activation is technical evidence, not Production or commercial approval.

## Known limitations

- The Production catalog is fictional demonstration data and is not bookable.
- The local location directory does not cover every global city, airport, property, or depot.
- Stays, Cars, and Packages expose search-form UX but no inventory or Results implementation.
- Live Preview availability and counts vary with the provider test environment.
- Live Preview Details expire and are not designed for cross-tab persistence.
- Accounts, saved trips, booking, payments, fulfillment, passenger profiles, and post-booking support are absent.
- No provider partnership, affiliate relationship, or Production-live claim is authorized.

## Recommended next release

Recommended V2.9.2 scope: freeze this documentation-only demo package and partner-readiness baseline without runtime changes. After that, prioritize evaluation of a licensed, versioned global location dataset or service behind the existing repository contract, including multilingual coverage, typo quality, rate limits, caching, privacy, and fallback tests.

Any Production live-provider activation should remain a separate later release with recorded commercial, legal, privacy, security, operational, and rollback approval. It must not be bundled into the documentation release.
