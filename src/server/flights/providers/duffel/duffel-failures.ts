import "../../../server-only";

import {
  buildExternalFailure,
  type ExternalFailureCategory,
  type NormalizedExternalFailure,
} from "../external/external-provider-failures";
import { DUFFEL_PROVIDER_ID } from "./duffel-contract";

export type DuffelThrownFailureKind =
  | "aborted"
  | "timeout"
  | "network"
  | "malformedJson"
  | "unexpectedSchema"
  | "unknown";

export interface NormalizeDuffelFailureInput {
  readonly requestId: string;
  readonly occurredAt: string;
  readonly statusCode?: number;
  readonly retryAfterMs?: number | null;
  readonly kind?: DuffelThrownFailureKind;
}

export function categoryForDuffelStatus(
  statusCode: number,
): ExternalFailureCategory {
  if (statusCode === 400 || statusCode === 404 || statusCode === 422) {
    return "invalidRequest";
  }
  if (statusCode === 401) return "unauthorized";
  if (statusCode === 403) return "forbidden";
  if (statusCode === 408) return "timeout";
  if (statusCode === 409) return "unavailable";
  if (statusCode === 429) return "rateLimited";
  if (statusCode >= 500 && statusCode <= 599) return "upstreamUnavailable";
  return "unknown";
}

export function categoryForDuffelThrownFailure(
  kind: DuffelThrownFailureKind,
): ExternalFailureCategory {
  switch (kind) {
    case "aborted":
      return "aborted";
    case "timeout":
      return "timeout";
    case "network":
      return "networkFailure";
    case "malformedJson":
    case "unexpectedSchema":
      return "malformedResponse";
    case "unknown":
      return "unknown";
  }
}

/** Normalizes metadata only. Raw bodies, messages and thrown values are absent. */
export function normalizeDuffelFailure(
  input: NormalizeDuffelFailureInput,
): NormalizedExternalFailure {
  const category =
    input.kind === undefined
      ? categoryForDuffelStatus(input.statusCode ?? 0)
      : categoryForDuffelThrownFailure(input.kind);
  return buildExternalFailure({
    category,
    providerId: DUFFEL_PROVIDER_ID,
    requestId: input.requestId,
    occurredAt: input.occurredAt,
    retryAfterMs: input.retryAfterMs,
    statusCode: input.statusCode,
  });
}
