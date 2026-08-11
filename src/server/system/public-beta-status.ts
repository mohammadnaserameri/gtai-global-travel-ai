import "../server-only";

import {
  getTripComAffiliateProviderMetadata,
  type TripComAffiliateProviderMetadata,
} from "../affiliate/trip-com/trip-com-affiliate";

export interface PublicBetaStatus {
  readonly app: "GTAI";
  readonly mode: "publicBeta";
  readonly productionProviderMode: "demonstration";
  readonly livePreviewAvailable: true;
  readonly bookingEnabled: false;
  readonly paymentsEnabled: false;
  readonly ordersEnabled: false;
  readonly affiliateRedirectsEnabled: boolean;
  readonly tokenExposed: false;
  readonly productionLiveProviderEnabled: false;
  readonly tripComAffiliate: TripComAffiliateProviderMetadata;
}

export function getPublicBetaStatus(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): PublicBetaStatus {
  const tripComAffiliate = getTripComAffiliateProviderMetadata(environment);
  return Object.freeze({
    app: "GTAI",
    mode: "publicBeta",
    productionProviderMode: "demonstration",
    livePreviewAvailable: true,
    bookingEnabled: false,
    paymentsEnabled: false,
    ordersEnabled: false,
    affiliateRedirectsEnabled: tripComAffiliate.active,
    tokenExposed: false,
    productionLiveProviderEnabled: false,
    tripComAffiliate,
  });
}
