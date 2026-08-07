import "../server-only";

export interface TravelImageEnvironment {
  readonly enabled: boolean;
  readonly previewEligible: boolean;
  readonly productionEligible: boolean;
  readonly productionDeployment: boolean;
  readonly productionBlocked: boolean;
  readonly unsplashAccessKey: string | null;
  readonly pexelsApiKey: string | null;
  readonly pixabayApiKey: string | null;
  readonly cronSecret: string | null;
}

type Environment = Readonly<Record<string, string | undefined>>;

function safeValue(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function resolveTravelImageEnvironment(
  environment: Environment = process.env,
): TravelImageEnvironment {
  const requested = environment.TRAVEL_IMAGE_ENGINE_ENABLED === "true";
  const unsplashAccessKey = safeValue(environment.UNSPLASH_ACCESS_KEY);
  const pexelsApiKey = safeValue(environment.PEXELS_API_KEY);
  const pixabayApiKey = safeValue(environment.PIXABAY_API_KEY);
  const previewDeployment = environment.VERCEL_ENV === "preview";
  const productionDeployment = environment.VERCEL_ENV === "production";
  const previewEligible =
    previewDeployment &&
    requested &&
    [unsplashAccessKey, pexelsApiKey, pixabayApiKey].some(Boolean);
  const productionEligible =
    productionDeployment &&
    requested &&
    environment.GTAI_PRODUCTION_IMAGE_ENGINE_ENABLED === "true" &&
    environment.GTAI_PRODUCTION_IMAGE_ENGINE_APPROVED === "true" &&
    pexelsApiKey !== null;
  return Object.freeze({
    enabled: previewEligible || productionEligible,
    previewEligible,
    productionEligible,
    productionDeployment,
    productionBlocked: productionDeployment && !productionEligible,
    unsplashAccessKey,
    pexelsApiKey,
    pixabayApiKey,
    cronSecret: safeValue(environment.CRON_SECRET),
  });
}
