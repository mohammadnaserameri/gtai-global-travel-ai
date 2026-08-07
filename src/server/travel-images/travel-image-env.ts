import "../server-only";

export interface TravelImageEnvironment {
  readonly enabled: boolean;
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
  return Object.freeze({
    enabled: environment.TRAVEL_IMAGE_ENGINE_ENABLED === "true",
    unsplashAccessKey: safeValue(environment.UNSPLASH_ACCESS_KEY),
    pexelsApiKey: safeValue(environment.PEXELS_API_KEY),
    pixabayApiKey: safeValue(environment.PIXABAY_API_KEY),
    cronSecret: safeValue(environment.CRON_SECRET),
  });
}
