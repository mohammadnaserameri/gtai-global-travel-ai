import "../../../server-only";

import type { ExternalFailureCategory } from "./external-provider-failures";
import type { RateLimitRefusalReason } from "./external-provider-rate-limit";
import type { ExternalTripShape } from "./external-provider-search-shape";
import type { ExternalProviderActivationState } from "./external-provider-types";

/**
 * The external-provider audit summary.
 *
 * Same posture as V2.7's `ProviderAuditEvent`, applied to a boundary that will
 * eventually carry real traffic: the fields that would reconstruct a
 * traveller's trip are **absent from the type**, not filtered out at write
 * time. That distinction is the whole protection. A filter is a function
 * somebody can forget to call, or call after logging; an absent field cannot be
 * written because there is nowhere to put it.
 *
 * `searchShape` is the interesting inclusion. An operator genuinely needs to
 * know whether round-trip searches fail more than one-way ones — that is a
 * real diagnostic question. `"roundTrip"` answers it. `"YUL→CDG 2026-09-15"`
 * would answer it too, and would also be somebody's trip.
 */

/** What was searched for, at a granularity that identifies nobody. */
export type AuditSearchShape = ExternalTripShape;

export interface ExternalProviderAuditSummary {
  readonly providerId: string;
  readonly activationState: ExternalProviderActivationState;
  /** Opaque, server-generated. Never derived from the search. */
  readonly requestId: string;
  readonly searchShape: AuditSearchShape;
  readonly resultCount: number;
  readonly rejectedOfferCount: number;
  readonly partialResult: boolean;
  /** Coarse bucket, never an exact latency. */
  readonly durationMs: number;
  readonly failureCategory: ExternalFailureCategory | null;
  readonly retryCount: number;
  readonly rateLimitDecision: "admitted" | "queued" | RateLimitRefusalReason | null;
  readonly occurredAt: string;
}

/**
 * The exact permitted field set.
 *
 * Verification asserts a real summary's keys against this, so adding a field to
 * the interface without adding it here fails the suite — which is the point.
 */
export const ALLOWED_AUDIT_FIELDS: readonly string[] = [
  "providerId",
  "activationState",
  "requestId",
  "searchShape",
  "resultCount",
  "rejectedOfferCount",
  "partialResult",
  "durationMs",
  "failureCategory",
  "retryCount",
  "rateLimitDecision",
  "occurredAt",
];

/**
 * What an audit summary must never contain.
 *
 * None of these is a field on the interface, so this list is not a filter — it
 * is the assertion target that proves the interface stayed clean.
 */
export const PROHIBITED_AUDIT_FIELDS: readonly string[] = [
  "request",
  "rawRequest",
  "response",
  "rawResponse",
  "body",
  "headers",
  "url",
  "query",
  "credential",
  "apiKey",
  "authorization",
  "token",
  "secret",
  "passenger",
  "traveller",
  "name",
  "email",
  "passport",
  "payment",
  "card",
  "ip",
  "ipAddress",
  "userAgent",
  "stack",
  "stackTrace",
  "origin",
  "destination",
  "departureDate",
  "returnDate",
];

/** Coarse latency buckets. An exact millisecond figure is a side channel. */
const DURATION_BUCKET_MS = 250;
const MAX_BUCKET_MS = 30_000;

export function bucketDuration(durationMs: number): number {
  if (!Number.isFinite(durationMs) || durationMs < 0) return 0;
  const bucketed = Math.round(durationMs / DURATION_BUCKET_MS) * DURATION_BUCKET_MS;
  return Math.min(bucketed, MAX_BUCKET_MS);
}

export interface BuildAuditInput {
  readonly providerId: string;
  readonly activationState: ExternalProviderActivationState;
  readonly requestId: string;
  readonly searchShape: AuditSearchShape;
  readonly resultCount?: number;
  readonly rejectedOfferCount?: number;
  readonly partialResult?: boolean;
  readonly durationMs: number;
  readonly failureCategory?: ExternalFailureCategory | null;
  readonly retryCount?: number;
  readonly rateLimitDecision?: ExternalProviderAuditSummary["rateLimitDecision"];
  readonly occurredAt: string;
}

/**
 * Builds a summary.
 *
 * The single constructor exists so `durationMs` is bucketed on every path. A
 * caller that assembled the object literally would eventually pass a raw
 * latency, and an exact per-request timing is a side channel that nobody
 * intended to publish and nobody would notice.
 */
export function buildExternalAuditSummary(
  input: BuildAuditInput,
): ExternalProviderAuditSummary {
  return {
    providerId: input.providerId,
    activationState: input.activationState,
    requestId: input.requestId,
    searchShape: input.searchShape,
    resultCount: input.resultCount ?? 0,
    rejectedOfferCount: input.rejectedOfferCount ?? 0,
    partialResult: input.partialResult ?? false,
    durationMs: bucketDuration(input.durationMs),
    failureCategory: input.failureCategory ?? null,
    retryCount: input.retryCount ?? 0,
    rateLimitDecision: input.rateLimitDecision ?? null,
    occurredAt: input.occurredAt,
  };
}

export interface ExternalAuditSink {
  readonly persistent: boolean;
  record(summary: ExternalProviderAuditSummary): void;
}

/**
 * The shipped sink: accepts summaries and discards them.
 *
 * Deliberately **not** `console.log`. Writing a search — even a minimized one —
 * to a shared runtime log is a persistence decision, and this stage has not
 * made one. An audit trail that exists before anyone has decided its retention
 * period, access control, encryption at rest and deletion process is a
 * liability rather than an asset: it accumulates records nobody has agreed to
 * keep, in a place nobody has agreed to protect, with no answer to a deletion
 * request.
 *
 * `persistent: false` is declared on the sink rather than inferred, so
 * verification can assert the shipped default without inspecting behaviour.
 *
 * **Before any persistent sink is introduced**, four policies must exist in
 * writing: how long summaries are kept, who may read them, how they are
 * encrypted at rest and in transit, and how they are deleted on request.
 */
export const noopExternalAuditSink: ExternalAuditSink = {
  persistent: false,
  record() {
    // Intentionally empty. See the module comment.
  },
};

/** An in-memory sink for verification. Never wired into a runtime path. */
export function createRecordingExternalAuditSink(): ExternalAuditSink & {
  readonly summaries: readonly ExternalProviderAuditSummary[];
} {
  const summaries: ExternalProviderAuditSummary[] = [];
  return {
    persistent: false,
    summaries,
    record(summary) {
      summaries.push(summary);
    },
  };
}
