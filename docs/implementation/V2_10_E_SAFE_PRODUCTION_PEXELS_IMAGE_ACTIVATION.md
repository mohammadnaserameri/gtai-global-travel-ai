# GTAI V2.10-E — Safe Production Pexels Image Activation

## Root cause

The V2.10-D resolver deliberately limited live travel images to Vercel Preview. A Production credential and redeploy therefore remained fallback-only with the safe reason `productionDisabled`.

## Explicit activation gate

Preview requires `VERCEL_ENV=preview`, `TRAVEL_IMAGE_ENGINE_ENABLED=true`, and at least one server-only configured image provider.

Production activates only when all of the following server-side conditions are true:

- `VERCEL_ENV=production`
- `TRAVEL_IMAGE_ENGINE_ENABLED=true`
- `GTAI_PRODUCTION_IMAGE_ENGINE_ENABLED=true`
- `GTAI_PRODUCTION_IMAGE_ENGINE_APPROVED=true`
- `PEXELS_API_KEY` is configured

Missing any condition keeps Production disabled and prevents provider calls. Client query parameters and `NEXT_PUBLIC_*` variables are not activation inputs.

## Production provider scope

V2.10-E permits Pexels only in Production. Unsplash and Pixabay remain inactive there even if their server-side credentials exist. Preview retains the existing configured-provider behavior.

The public status endpoint exposes only bounded operational metadata: mode, provider scope, attempt/success booleans, normalized count, attribution/fallback state, cache mode, and a safe reason code. It never returns credentials, environment values, Authorization, raw provider responses, or sensitive URLs.

## Rollback

Any one of these actions immediately restores fallback-only behavior after redeployment:

- set `GTAI_PRODUCTION_IMAGE_ENGINE_ENABLED=false`; or
- set `GTAI_PRODUCTION_IMAGE_ENGINE_APPROVED=false`; or
- remove `PEXELS_API_KEY`.

Setting `TRAVEL_IMAGE_ENGINE_ENABLED=false` is an additional global image-engine rollback switch.

## Safety boundaries

- Provider calls remain server-side; no browser provider API calls or scraping are introduced.
- Existing local fallback images and accessible attribution remain unchanged.
- Duffel remains inactive in Production.
- Flight search remains demonstration-only.
- Booking, payment, Orders API, passenger personal data, and affiliate redirects remain absent.
- Existing SEO, sitemap, robots, and noindex rules are unchanged.
