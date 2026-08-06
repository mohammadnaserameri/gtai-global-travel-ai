import "../../../server-only";

import { buildExternalFailure } from "../external/external-provider-failures";
import {
  InactiveTransportError,
  type ExternalProviderTransport,
} from "../external/external-provider-transport";
import type {
  ExternalProviderRequestContext,
  ExternalProviderSearchRequest,
  ExternalProviderSearchResponse,
} from "../external/external-provider-types";
import { DUFFEL_PROVIDER_ID } from "./duffel-contract";

export interface DuffelInactiveTransportOptions {
  readonly now?: () => number;
}

/** The only Duffel transport shipped in V2.8-C. It cannot reach a network. */
export function createDuffelInactiveTransport(
  options: DuffelInactiveTransportOptions = {},
): ExternalProviderTransport {
  const now = options.now ?? (() => Date.now());
  return {
    transportId: "duffel-inactive-transport",
    search(
      _request: ExternalProviderSearchRequest,
      context: ExternalProviderRequestContext,
    ): Promise<ExternalProviderSearchResponse> {
      const category = context.signal.aborted ? "aborted" : "notConfigured";
      return Promise.reject(
        new InactiveTransportError(
          buildExternalFailure({
            category,
            providerId: DUFFEL_PROVIDER_ID,
            requestId: context.searchContextId,
            occurredAt: new Date(now()).toISOString(),
          }),
        ),
      );
    },
  };
}

export const duffelInactiveTransport: ExternalProviderTransport =
  createDuffelInactiveTransport();
