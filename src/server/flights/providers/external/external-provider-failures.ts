import "../../../server-only";

import type { ProviderFailureCode } from "../provider-runtime-types";

/**
 * The provider-neutral failure taxonomy.
 *
 * V2.7 has eight failure codes, chosen for what the *orchestrator* acts on. A
 * live provider produces distinctions that taxonomy cannot express: `401` and
 * `403` are both "authentication" to V2.7 but mean different things to an
 * operator (wrong key vs. right key, wrong entitlement), and "we never
 * configured this" is not the same as "it is configured and down".
 *
 * Collapsing those at the boundary loses the information permanently. So this
 * module keeps fifteen external categories and maps each onto the V2.7 code
 * the runtime already understands — while carrying the external category
 * forward in `internalCode`, so the distinction survives into audit even
 * though the orchestrator only ever sees the coarser value.
 *
 * The client is unaffected either way: the wire carries `publicCode`, a
 * deliberately small stable set, and customer wording lives in the locale
 * dictionaries.
 */

export type ExternalFailureCategory =
  /** No usable configuration. Nobody ever set this provider up. */
  | "notConfigured"
  /** Configured, but deliberately not running (suspended or withheld). */
  | "unavailable"
  /** Credential rejected — wrong or expired key. */
  | "unauthorized"
  /** Credential accepted, action not permitted — an entitlement problem. */
  | "forbidden"
  /** GTAI sent something the provider considers malformed. Our bug. */
  | "invalidRequest"
  /** The search is well-formed but outside the provider's capabilities. */
  | "unsupportedSearch"
  /** The provider took too long. */
  | "timeout"
  /** The caller went away. Never a provider fault. */
  | "aborted"
  /** Quota exceeded. The one failure with explicit provider guidance. */
  | "rateLimited"
  /** The provider is down — 5xx, maintenance, dependency failure. */
  | "upstreamUnavailable"
  /** A 2xx whose body could not be parsed at all. */
  | "malformedResponse"
  /** Parsed, but the provider says it is incomplete. */
  | "partialResponse"
  /** Parsed and complete, but nothing survived mapping. */
  | "mappingFailure"
  /** DNS, TLS, connection reset — never reached the application. */
  | "networkFailure"
  | "unknown";

export const EXTERNAL_FAILURE_CATEGORIES: readonly ExternalFailureCategory[] = [
  "notConfigured",
  "unavailable",
  "unauthorized",
  "forbidden",
  "invalidRequest",
  "unsupportedSearch",
  "timeout",
  "aborted",
  "rateLimited",
  "upstreamUnavailable",
  "malformedResponse",
  "partialResponse",
  "mappingFailure",
  "networkFailure",
  "unknown",
];

/**
 * External category → V2.7 runtime code.
 *
 * Several external categories intentionally share a runtime code. That is not
 * information loss: the runtime genuinely treats them identically (both `401`
 * and `403` mean "stop, an operator must fix this"), and the finer category
 * travels on in `internalCode`.
 */
const RUNTIME_CODE: Readonly<Record<ExternalFailureCategory, ProviderFailureCode>> =
  Object.freeze({
    notConfigured: "configuration",
    unavailable: "unavailable",
    unauthorized: "authentication",
    forbidden: "authentication",
    invalidRequest: "configuration",
    unsupportedSearch: "configuration",
    timeout: "timeout",
    aborted: "cancelled",
    rateLimited: "rateLimited",
    upstreamUnavailable: "unavailable",
    malformedResponse: "malformedResponse",
    partialResponse: "malformedResponse",
    mappingFailure: "malformedResponse",
    networkFailure: "unavailable",
    unknown: "unknown",
  });

export function runtimeCodeFor(
  category: ExternalFailureCategory,
): ProviderFailureCode {
  return RUNTIME_CODE[category];
}

/**
 * Retryability, decided once and travelling with the failure.
 *
 * Everything an operator must fix is `false`. Retrying `unauthorized`,
 * `forbidden`, `invalidRequest` or `unsupportedSearch` spends a traveller's
 * wait and a provider's quota to reach the identical answer. `aborted` is
 * `false` because there is nobody left to retry for, and `mappingFailure` is
 * `false` because a provider that returned unmappable output will return it
 * again — retrying turns one bad deploy on their side into a traffic
 * multiplier.
 */
const RETRYABLE: Readonly<Record<ExternalFailureCategory, boolean>> = Object.freeze(
  {
    notConfigured: false,
    unavailable: false,
    unauthorized: false,
    forbidden: false,
    invalidRequest: false,
    unsupportedSearch: false,
    timeout: true,
    aborted: false,
    rateLimited: true,
    upstreamUnavailable: true,
    malformedResponse: false,
    partialResponse: false,
    mappingFailure: false,
    networkFailure: true,
    unknown: false,
  },
);

export function isRetryableCategory(category: ExternalFailureCategory): boolean {
  return RETRYABLE[category];
}

/**
 * The small, stable set that may cross the wire.
 *
 * Deliberately coarser than the internal taxonomy. A client has no action to
 * take that differs between `unauthorized` and `forbidden`, and publishing the
 * distinction tells an attacker whether a credential was valid.
 */
export type PublicFailureCode =
  | "provider_unavailable"
  | "search_unsupported"
  | "temporarily_unavailable"
  | "unknown_error";

const PUBLIC_CODE: Readonly<Record<ExternalFailureCategory, PublicFailureCode>> =
  Object.freeze({
    notConfigured: "provider_unavailable",
    unavailable: "provider_unavailable",
    // Neither confirms nor denies whether the credential was valid.
    unauthorized: "provider_unavailable",
    forbidden: "provider_unavailable",
    invalidRequest: "provider_unavailable",
    unsupportedSearch: "search_unsupported",
    timeout: "temporarily_unavailable",
    aborted: "temporarily_unavailable",
    rateLimited: "temporarily_unavailable",
    upstreamUnavailable: "temporarily_unavailable",
    malformedResponse: "provider_unavailable",
    partialResponse: "provider_unavailable",
    mappingFailure: "provider_unavailable",
    networkFailure: "temporarily_unavailable",
    unknown: "unknown_error",
  });

export function publicCodeFor(
  category: ExternalFailureCategory,
): PublicFailureCode {
  return PUBLIC_CODE[category];
}

/**
 * A normalized failure. **Every field here is safe to log.**
 *
 * What is absent is the specification: no raw upstream message, no response
 * body, no credential, no stack trace, no authorization header, no URL, no
 * query string. Absent from the *type*, so a future contributor cannot attach
 * one and a reviewer does not have to notice that they did.
 *
 * `safeMessage` is the one free-text field and it is drawn from a fixed
 * vocabulary — never from provider output.
 */
export interface NormalizedExternalFailure {
  readonly category: ExternalFailureCategory;
  readonly retryable: boolean;
  readonly publicCode: PublicFailureCode;
  /** The external category, preserved so the distinction survives into audit. */
  readonly internalCode: ExternalFailureCategory;
  /** The V2.7 code the orchestrator acts on. */
  readonly runtimeCode: ProviderFailureCode;
  readonly providerId: string;
  readonly requestId: string;
  /** Fixed vocabulary. Never provider text. */
  readonly safeMessage: string;
  /** Clamped, or `null`. Never a raw provider value. */
  readonly retryAfterMs: number | null;
  /** Status only, never paired with a body. */
  readonly statusCode: number | null;
  readonly occurredAt: string;
}

/** The fixed vocabulary. A provider can never influence what is written down. */
const SAFE_MESSAGE: Readonly<Record<ExternalFailureCategory, string>> =
  Object.freeze({
    notConfigured: "provider is not configured",
    unavailable: "provider is configured but not active",
    unauthorized: "provider rejected the credential",
    forbidden: "provider denied the operation",
    invalidRequest: "provider rejected the request shape",
    unsupportedSearch: "search is outside the provider's declared capabilities",
    timeout: "provider did not respond within the budget",
    aborted: "caller cancelled the search",
    rateLimited: "provider quota exceeded",
    upstreamUnavailable: "provider reported an internal failure",
    malformedResponse: "provider response could not be parsed",
    partialResponse: "provider reported an incomplete result set",
    mappingFailure: "no offer in the provider response could be mapped",
    networkFailure: "provider could not be reached",
    unknown: "provider failed for an uncategorized reason",
  });

export interface BuildFailureInput {
  readonly category: ExternalFailureCategory;
  readonly providerId: string;
  readonly requestId: string;
  readonly occurredAt: string;
  readonly retryAfterMs?: number | null;
  readonly statusCode?: number | null;
}

/** Absolute ceiling on any honoured `Retry-After`, however the provider states it. */
export const MAX_RETRY_AFTER_MS = 30_000;

/**
 * The single constructor for a normalized failure.
 *
 * One entry point means retryability, the public code and the safe message can
 * never disagree with the category. A caller that assembled the object by hand
 * would eventually get one of the three wrong, and the divergence would show
 * up as a retry storm against a provider returning `401`.
 */
export function buildExternalFailure(
  input: BuildFailureInput,
): NormalizedExternalFailure {
  const { category } = input;
  const rawRetryAfter = input.retryAfterMs ?? null;
  const retryAfterMs =
    rawRetryAfter === null || !Number.isFinite(rawRetryAfter) || rawRetryAfter < 0
      ? null
      : Math.min(Math.round(rawRetryAfter), MAX_RETRY_AFTER_MS);

  const statusCode = input.statusCode ?? null;
  const safeStatus =
    statusCode !== null &&
    Number.isInteger(statusCode) &&
    statusCode >= 100 &&
    statusCode <= 599
      ? statusCode
      : null;

  return {
    category,
    retryable: isRetryableCategory(category),
    publicCode: publicCodeFor(category),
    internalCode: category,
    runtimeCode: runtimeCodeFor(category),
    providerId: input.providerId,
    requestId: input.requestId,
    safeMessage: SAFE_MESSAGE[category],
    retryAfterMs,
    statusCode: safeStatus,
    occurredAt: input.occurredAt,
  };
}

/** The exact set of keys a normalized failure may carry. Asserted by verification. */
export const ALLOWED_FAILURE_FIELDS: readonly string[] = [
  "category",
  "retryable",
  "publicCode",
  "internalCode",
  "runtimeCode",
  "providerId",
  "requestId",
  "safeMessage",
  "retryAfterMs",
  "statusCode",
  "occurredAt",
];
