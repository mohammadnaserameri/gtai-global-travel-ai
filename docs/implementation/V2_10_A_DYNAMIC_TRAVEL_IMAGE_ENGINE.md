# GTAI V2.10-A - Dynamic Travel Image Engine

## Scope

V2.10-A adds a server-only travel image pipeline for the homepage hero, destination cards, Explore, Flights, Stays, Cars and Packages. Production keeps the engine disabled unless TRAVEL_IMAGE_ENGINE_ENABLED=true is explicitly configured. With the flag absent or with no configured provider credential, GTAI renders original local fallback artwork and performs no external image request.

## Provider boundary

Only official Unsplash, Pexels and Pixabay search APIs are implemented. Every adapter lives below src/server, reads its credential only through the server-only environment resolver, normalizes the provider response immediately, and discards the raw payload. No browser component imports a provider adapter, credential name, API hostname or provider response type. There is no scraping.

Supported server-only variables:

- TRAVEL_IMAGE_ENGINE_ENABLED
- UNSPLASH_ACCESS_KEY
- PEXELS_API_KEY
- PIXABAY_API_KEY
- CRON_SECRET

None has a NEXT_PUBLIC equivalent.

## Normalized asset contract

The UI receives only a GTAI-owned asset record: namespaced identifier, approved image URL, thumbnail URL, dimensions, safe alternative text, public attribution, the public source page, the query used, refresh timestamp and fallback marker. It never receives a credential, request header, provider API URL, raw response, error detail or internal cache state.

## Querying and ranking

Queries are destination- and category-aware. For Istanbul, examples include Istanbul skyline, Istanbul hotel room, Istanbul rental car and Istanbul vacation. The engine fans out one deterministic query to every configured provider, normalizes all successful responses, rejects undersized, portrait, watermarked, illustrated or irrelevant assets, deduplicates canonical image URLs, then ranks by destination/country match, travel keywords, resolution, landscape ratio and attribution completeness. Stable hashing breaks ties so output does not jump between renders.

## Cache and refresh

A bounded metadata cache stores at most 256 normalized selections for 24 hours. Provider fetches also use a one-day Next.js data-cache revalidation window. GET /api/cron/travel-images refreshes a bounded allowlist daily at 04:17 UTC. It requires Vercel Authorization using CRON_SECRET and returns only counts. Missing configuration, invalid authorization and provider failure use fixed safe codes.

The in-process metadata cache is intentionally an optimization, not a durable database. A cold serverless instance safely falls back or repopulates from the official APIs. Durable cross-region metadata persistence is a future operational enhancement.

## UI and safety

All rendering uses next/image, responsive sizes, fixed-height containers, landscape cropping and lazy loading below the fold. The hero is prioritized and uses layered gradients to preserve text/search readability. Attribution is visible for live assets. Local SVG fallbacks need no attribution.

This release does not change public copy, booking, payments, Orders, passenger data, affiliate redirects, flight provider selection, Duffel activation, robots, sitemap or the Results/Details noindex policy.

## Activation checklist

1. Approve provider terms and attribution requirements.
2. Add one or more image API credentials as server-only Vercel variables.
3. Add a strong server-only CRON_SECRET.
4. Enable TRAVEL_IMAGE_ENGINE_ENABLED=true in the intended environment.
5. Deploy and verify attribution, image relevance, rate limits and cache hit rate.
6. Keep a rollback path by removing the flag; local fallbacks activate immediately.
