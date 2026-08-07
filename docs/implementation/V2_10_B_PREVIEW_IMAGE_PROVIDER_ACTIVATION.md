# GTAI V2.10-B — Preview Image Provider Activation

V2.10-B permits the server-side Dynamic Travel Image Engine to use configured official image-provider APIs only in Vercel Preview. Production is hard-blocked and remains on GTAI local fallback artwork even if the feature flag is accidentally present.

## Activation boundary

The engine is eligible only when both `TRAVEL_IMAGE_ENGINE_ENABLED=true` and `VERCEL_ENV=preview`. Provider credentials remain server-only. No `NEXT_PUBLIC_` image credential or browser-side provider request exists.

`GET /api/travel-images/status` returns only a safe operational summary: mode, three anonymous provider-configuration booleans, cache count, fallback state, server-only assertion and a bounded refresh status. It never returns credentials, environment values, authorization headers, provider request URLs, payloads, errors or stack traces.

## UI behavior

Homepage hero, destination cards, Explore, Stays, Cars and Packages continue to use the normalized image contract. A successful Preview lookup supplies a landscape asset and visible attribution. Missing configuration, provider errors, empty responses or rejected assets select local SVG fallbacks without changing layout. Persian RTL uses the same logical layout and fixed aspect-ratio surfaces.

## Production safety

Production cannot activate the image engine in this release. Robots, sitemap, noindex rules, public copy, Duffel provider selection, demonstration search, booking, payments, Orders, passenger data and affiliate behavior are unchanged.
