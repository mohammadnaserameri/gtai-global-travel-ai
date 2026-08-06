import "../../../server-only";

import type { ExternalFailureCategory } from "../external/external-provider-failures";

export type DuffelPreviewDiagnosticPhase =
  | "activation"
  | "credential"
  | "createOfferRequest"
  | "listOffers"
  | "mapping"
  | "transport"
  | "timeout"
  | "unknown";

export interface DuffelPreviewDiagnostic {
  readonly phase: DuffelPreviewDiagnosticPhase;
  readonly category: ExternalFailureCategory;
  readonly httpStatus: number | null;
  readonly retryable: boolean;
  readonly offerRequestIdPresent: boolean;
  readonly responseParsed: boolean;
  readonly mappedOfferCount: number;
  readonly rejectedOfferCount: number;
  readonly safeReasonCode: string;
}

const SAFE_REASON = /^[a-z][a-z0-9-]{0,63}$/;

/** Preview-only, allowlisted operational metadata. Never accepts provider data. */
export function recordDuffelPreviewDiagnostic(
  enabled: boolean,
  diagnostic: DuffelPreviewDiagnostic,
): void {
  if (!enabled) return;
  const safeReasonCode = SAFE_REASON.test(diagnostic.safeReasonCode)
    ? diagnostic.safeReasonCode
    : "invalid-diagnostic-code";
  console.info("GTAI_DUFFEL_PREVIEW_DIAGNOSTIC", {
    phase: diagnostic.phase,
    category: diagnostic.category,
    httpStatus: diagnostic.httpStatus,
    retryable: diagnostic.retryable,
    offerRequestIdPresent: diagnostic.offerRequestIdPresent,
    responseParsed: diagnostic.responseParsed,
    mappedOfferCount: diagnostic.mappedOfferCount,
    rejectedOfferCount: diagnostic.rejectedOfferCount,
    safeReasonCode,
  });
}
