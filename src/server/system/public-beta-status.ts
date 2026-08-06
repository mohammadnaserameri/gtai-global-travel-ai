import "../server-only";

export interface PublicBetaStatus {
  readonly app: "GTAI";
  readonly mode: "publicBeta";
  readonly productionProviderMode: "demonstration";
  readonly livePreviewAvailable: true;
  readonly bookingEnabled: false;
  readonly paymentsEnabled: false;
  readonly ordersEnabled: false;
  readonly affiliateRedirectsEnabled: false;
  readonly tokenExposed: false;
  readonly productionLiveProviderEnabled: false;
}

const PUBLIC_BETA_STATUS: PublicBetaStatus = Object.freeze({
  app: "GTAI",
  mode: "publicBeta",
  productionProviderMode: "demonstration",
  livePreviewAvailable: true,
  bookingEnabled: false,
  paymentsEnabled: false,
  ordersEnabled: false,
  affiliateRedirectsEnabled: false,
  tokenExposed: false,
  productionLiveProviderEnabled: false,
});

export function getPublicBetaStatus(): PublicBetaStatus {
  return PUBLIC_BETA_STATUS;
}
