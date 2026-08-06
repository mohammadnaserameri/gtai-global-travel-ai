import "../../../server-only";

import type { ExternalNeutralSearch } from "../external/external-provider-search-shape";
import { guardDuffelActivation } from "./duffel-activation-guard";
import {
  DUFFEL_ACTIVATION_STATE,
  DUFFEL_PROVIDER_ID,
  type DuffelCreateOfferRequestContract,
  type DuffelListOffersRequestContract,
} from "./duffel-contract";
import type { DuffelCredentialResolution } from "./duffel-credential-resolver";
import {
  buildDuffelCreateOfferRequest,
  buildDuffelListOffersRequest,
  type BuildDuffelListOffersInput,
} from "./duffel-request-builder";
import type { DuffelRuntimeTransport } from "./duffel-runtime-transport";

export interface DuffelRuntimeAdapter {
  readonly providerId: typeof DUFFEL_PROVIDER_ID;
  readonly activationState: typeof DUFFEL_ACTIVATION_STATE;
  readonly activationDirective: "withheld";
  readonly runnable: false;
  readonly transport: DuffelRuntimeTransport;
  buildCreateOfferRequest(
    search: ExternalNeutralSearch,
  ): DuffelCreateOfferRequestContract;
  buildListOffersRequest(
    input: BuildDuffelListOffersInput,
  ): DuffelListOffersRequestContract;
}

/** Composition exists for controlled future tests but is never registered. */
export function composeDisabledDuffelRuntimeAdapter(
  transport: DuffelRuntimeTransport,
  credential: DuffelCredentialResolution,
): DuffelRuntimeAdapter {
  const activation = guardDuffelActivation(credential);
  return Object.freeze({
    providerId: DUFFEL_PROVIDER_ID,
    activationState: DUFFEL_ACTIVATION_STATE,
    activationDirective: activation.directive,
    runnable: false,
    transport,
    buildCreateOfferRequest: buildDuffelCreateOfferRequest,
    buildListOffersRequest: buildDuffelListOffersRequest,
  });
}
