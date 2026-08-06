import "../../../server-only";

import type { ExternalNeutralSearch } from "../external/external-provider-search-shape";
import type { ExternalProviderTransport } from "../external/external-provider-transport";
import {
  DUFFEL_ACCESS_TOKEN_REFERENCE,
  DUFFEL_ACTIVATION_STATE,
  DUFFEL_PROVIDER_ID,
  type DuffelCreateOfferRequestContract,
  type DuffelListOffersRequestContract,
} from "./duffel-contract";
import {
  buildDuffelCreateOfferRequest,
  buildDuffelListOffersRequest,
  type BuildDuffelListOffersInput,
} from "./duffel-request-builder";
import {
  mapDuffelListOffers,
  type DuffelOfferMappingResult,
  type MapDuffelListOffersInput,
} from "./duffel-response-mapper";
import { duffelInactiveTransport } from "./duffel-transport";

export interface DuffelTestAdapterContract {
  readonly providerId: typeof DUFFEL_PROVIDER_ID;
  readonly activationState: typeof DUFFEL_ACTIVATION_STATE;
  readonly transport: ExternalProviderTransport;
  readonly secretReference: typeof DUFFEL_ACCESS_TOKEN_REFERENCE;
  buildCreateOfferRequest(
    search: ExternalNeutralSearch,
  ): DuffelCreateOfferRequestContract;
  buildListOffersRequest(
    input: BuildDuffelListOffersInput,
  ): DuffelListOffersRequestContract;
  mapListOffers(input: MapDuffelListOffersInput): DuffelOfferMappingResult;
}

/** Inspectable contract fixture. It is intentionally absent from the runtime registry. */
export const duffelTestAdapterContract: DuffelTestAdapterContract = Object.freeze({
  providerId: DUFFEL_PROVIDER_ID,
  activationState: DUFFEL_ACTIVATION_STATE,
  transport: duffelInactiveTransport,
  secretReference: DUFFEL_ACCESS_TOKEN_REFERENCE,
  buildCreateOfferRequest: buildDuffelCreateOfferRequest,
  buildListOffersRequest: buildDuffelListOffersRequest,
  mapListOffers: mapDuffelListOffers,
});
