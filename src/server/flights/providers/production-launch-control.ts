import "../../server-only";

/**
 * V2.9-A's hard Production boundary.
 *
 * This release intentionally has no environment-driven enable path. Future
 * variable names may be documented for planning, but no variable, credential,
 * request, query parameter, or client value is read here. Changing this state
 * requires a separately reviewed source release.
 */
export interface ProductionLaunchControlState {
  readonly productionLiveProviderEnabled: false;
  readonly productionLiveProviderApproved: false;
  readonly productionProviderMode: "demonstration";
  readonly bookingEnabled: false;
  readonly paymentsEnabled: false;
  readonly ordersEnabled: false;
  readonly affiliateRedirectsEnabled: false;
}

const DISABLED_PRODUCTION_LAUNCH_CONTROL: ProductionLaunchControlState =
  Object.freeze({
    productionLiveProviderEnabled: false,
    productionLiveProviderApproved: false,
    productionProviderMode: "demonstration",
    bookingEnabled: false,
    paymentsEnabled: false,
    ordersEnabled: false,
    affiliateRedirectsEnabled: false,
  });

export function getProductionLaunchControl(): ProductionLaunchControlState {
  return DISABLED_PRODUCTION_LAUNCH_CONTROL;
}

/** Always false in V2.9-A. No input exists that can change the answer. */
export function productionLaunchAllowsLiveProvider(): false {
  return false;
}

export function isProductionRuntime(
  environment: Readonly<Record<string, string | undefined>>,
): boolean {
  return environment.VERCEL_ENV === "production";
}
