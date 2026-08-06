import type { ProviderFailureCode } from "../provider-runtime-types";
import type { MappingResult } from "./external-provider-offer-mapping";
import type { ExternalNeutralSearch } from "./external-provider-search-shape";
import type { ExternalProviderTransport } from "./external-provider-transport";
import type { ExternalProviderRateLimit } from "./external-provider-rate-limit";

/**
 * The provider-neutral contract a future **live** flight provider must satisfy.
 *
 * V2.8-B is a readiness stage, not an integration. Nothing in this directory
 * performs a network call, resolves a real credential, or is registered as a
 * runnable provider. What it does is fix the shape of the boundary while
 * nobody is under delivery pressure — so that when an integration is actually
 * approved, the arguments about redaction, retries, capability honesty and
 * secret handling have already been had.
 *
 * Two deliberate properties run through every type here:
 *
 * 1. **Neutral.** No type, field or constant names a real travel company. A
 *    contract written around one provider's quirks becomes that provider's
 *    contract, and the second integration then has to fight it.
 * 2. **Declarative.** An adapter *describes* the request it would make; it
 *    does not make it. That is what lets this stage be verified deterministically
 *    and what keeps "we are ready to call a provider" from quietly becoming
 *    "we call a provider".
 *
 * The V2.7 vocabulary (`ProviderFailureCode`, `FlightProviderAdapter`,
 * `ProviderRegistration`) is **preserved unchanged** and reused here. This is
 * an additive layer: the live-provider contract normalizes *into* the existing
 * failure taxonomy rather than introducing a second, competing one.
 *
 * Types-only module, so it carries no server-only guard — there is nothing
 * here to execute. Every module that executes imports the guard directly.
 */

/* ------------------------------------------------------------------------- */
/* Capabilities                                                              */
/* ------------------------------------------------------------------------- */

/**
 * What a provider can actually do — as a declaration that can be checked
 * against a search before anything is attempted.
 *
 * Every field is a fact about the provider, and the rule enforced elsewhere in
 * this stage is that an inactive provider may not claim any capability. A
 * capability matrix is a promise about behaviour, and a provider that is not
 * connected has not made any promise: publishing one would let a future
 * capability check pass against a provider that cannot answer at all.
 */
export interface ExternalProviderCapabilities {
  readonly supportsOneWay: boolean;
  readonly supportsRoundTrip: boolean;
  readonly supportsMultiCity: boolean;
  readonly supportsDirectOnly: boolean;
  readonly supportsCabinClass: boolean;
  readonly supportsAdults: boolean;
  readonly supportsChildren: boolean;
  readonly supportsInfants: boolean;
  /** ISO 3166-1 alpha-2 market codes. Empty means "no market is supported". */
  readonly supportedMarkets: readonly string[];
  /** BCP-47 locale codes the provider itself can answer in. */
  readonly supportedLocales: readonly string[];
  /** ISO 4217 currency codes the provider can quote in. */
  readonly supportedCurrencies: readonly string[];
  readonly maximumLegCount: number;
  readonly maximumTravellerCount: number;
  /**
   * Whether the provider returns a deep link a traveller could follow.
   *
   * Declaring this `true` does not create a booking or affiliate flow — GTAI
   * implements neither, in this stage or any shipped stage. It only records
   * that the provider's payload would contain such a field, which a future
   * integration must then decide what to do with.
   */
  readonly supportsBookingLinks: boolean;
  /** Whether the provider can stream or page results rather than answering once. */
  readonly supportsPartialResults: boolean;
}

/* ------------------------------------------------------------------------- */
/* Policies                                                                  */
/* ------------------------------------------------------------------------- */

/**
 * How long a provider gets, split into the two limits that are genuinely
 * different.
 *
 * `connectTimeoutMs` bounds getting a connection at all; `requestTimeoutMs`
 * bounds the whole exchange. Collapsing them loses the distinction between a
 * provider that is unreachable — worth failing fast on — and one that is
 * reachable but slow, which may still be worth waiting for.
 */
export interface ExternalProviderTimeoutPolicy {
  readonly connectTimeoutMs: number;
  readonly requestTimeoutMs: number;
  /** Ceiling across all attempts including backoff. Never exceeded by retries. */
  readonly totalDeadlineMs: number;
}

/**
 * Retry behaviour, expressed as data so it can be reasoned about and tested
 * without performing a retry.
 *
 * `retryableFailures` is an explicit allowlist rather than a denylist. The
 * codes deliberately absent from every sane policy are `authentication` and
 * `configuration`: those are operator mistakes, and retrying them burns a
 * traveller's time and a provider's quota to arrive at the same answer.
 */
export interface ExternalProviderRetryPolicy {
  /** Total attempts, not retries-after-the-first. `1` means "no retry". */
  readonly maximumAttempts: number;
  readonly initialBackoffMs: number;
  readonly backoffMultiplier: number;
  readonly maximumBackoffMs: number;
  /**
   * Deterministic jitter fraction in `[0, 1]`. Applied by a caller-supplied
   * source so the policy itself stays pure and testable — a policy that reads
   * `Math.random()` internally cannot be asserted on.
   */
  readonly jitterRatio: number;
  readonly retryableFailures: readonly ProviderFailureCode[];
}

/* ------------------------------------------------------------------------- */
/* Secrets                                                                   */
/* ------------------------------------------------------------------------- */

/**
 * A *reference* to a credential — never a credential.
 *
 * The distinction is the whole point of the type. This object names where a
 * secret would come from and can be freely logged, serialized, committed and
 * shown in an error. The value it refers to is resolved separately, on the
 * server only, into an opaque holder that cannot be stringified back into
 * plaintext.
 *
 * `environmentVariable` is validated elsewhere to reject any `NEXT_PUBLIC_`
 * prefix: that prefix is inlined into the browser bundle by Next.js, so a
 * provider secret named that way is a published secret.
 */
export interface ExternalProviderSecretReference {
  /** Stable id used in configuration and audit. Never the value. */
  readonly secretId: string;
  /** Environment variable name. Never `NEXT_PUBLIC_*`. */
  readonly environmentVariable: string;
  /** Where the credential is placed once resolved. */
  readonly placement: "header" | "queryParameter" | "bearerToken";
  /** Header or parameter name. Never the value. */
  readonly parameterName: string;
  readonly required: boolean;
}

/* ------------------------------------------------------------------------- */
/* Requests and responses                                                    */
/* ------------------------------------------------------------------------- */

/**
 * Everything an adapter is allowed to know about the caller.
 *
 * Note the absences, which mirror V2.7's `ProviderSearchContext`: no client IP,
 * no user agent, no cookie, no session, no account id, no inbound headers, no
 * request URL. An adapter is given a way to be cancelled, a correlation id and
 * an attempt number, and learns nothing about who is searching.
 *
 * Market, locale and currency are **not** here — they belong to the search, and
 * duplicating them into the context creates two sources that can disagree.
 */
export interface ExternalProviderRequestContext {
  readonly signal: AbortSignal;
  /** Random, server-generated. Never derived from the search. */
  readonly searchContextId: string;
  /** 1-based, so retry accounting is explicit rather than ambient. */
  readonly attempt: number;
  /** Epoch ms after which this search must stop, whatever else is happening. */
  readonly deadlineAt: number;
}

/**
 * A **described** outbound request.
 *
 * An adapter returns this and a transport performs it. Separating the two buys
 * three things: the request can be asserted on in verification without a
 * network, redaction can be proven to run before anything leaves the process,
 * and the transport can be swapped without renegotiating the request contract.
 *
 * `headers` and `query` may carry resolved credential values, which is exactly
 * why `redactRequest` exists and why nothing logs this object directly.
 */
export interface ExternalProviderSearchRequest {
  readonly method: "GET" | "POST";
  /**
   * Absolute URL built from an operator-configured allowlisted origin.
   *
   * Never assembled by string concatenation, never derived from a provider
   * response, and never influenced by anything in the inbound request.
   */
  readonly url: URL;
  readonly headers: Readonly<Record<string, string>>;
  readonly query: Readonly<Record<string, string>>;
  readonly body: string | null;
  /** Secret references whose values this request carries. Ids, not values. */
  readonly secretReferences: readonly ExternalProviderSecretReference[];
  readonly timeoutPolicy: ExternalProviderTimeoutPolicy;
}

/**
 * A provider's raw answer, before mapping.
 *
 * `body` is `unknown` on purpose: a provider's payload is untrusted input, and
 * typing it as anything else invites code that reads fields nobody validated.
 * This object never leaves the server and never reaches an audit summary.
 */
export interface ExternalProviderSearchResponse {
  readonly statusCode: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown;
  /** Wall-clock duration of the exchange, for policy accounting only. */
  readonly durationMs: number;
  /** ISO-8601 instant the response was received. */
  readonly receivedAt: string;
}

/* ------------------------------------------------------------------------- */
/* Activation                                                                */
/* ------------------------------------------------------------------------- */

/**
 * The four states a live provider can be in.
 *
 * `configured` is the important one and the reason this is not a boolean: a
 * provider whose credentials and configuration are all present is still not
 * running until an operator says so. Without that state, "we finished the
 * setup" and "we turned it on" become the same event, and an integration goes
 * live the moment the last environment variable lands.
 */
export type ExternalProviderActivationState =
  /** No usable configuration. The only state any external provider is in today. */
  | "unavailable"
  /** Fully configured and credential-complete, but deliberately not running. */
  | "configured"
  /** Explicitly switched on by an operator. */
  | "active"
  /** Was active; withdrawn without discarding its configuration. */
  | "suspended";

/**
 * A live provider's complete, code-owned declaration.
 *
 * Everything here is fixed in source or resolved server-side. Nothing is read
 * from a request. There is deliberately no credential *value*, no
 * `enabled: boolean` that a config file could flip on its own, and no
 * client-reachable field.
 */
export interface ExternalFlightProviderDefinition {
  readonly providerId: string;
  /** Internal operator label. Never customer copy — that lives in the dictionaries. */
  readonly label: string;
  /** Shown on the trust surface as the data's origin. Never a URL. */
  readonly sourceAttribution: string;
  readonly capabilities: ExternalProviderCapabilities;
  readonly timeoutPolicy: ExternalProviderTimeoutPolicy;
  readonly retryPolicy: ExternalProviderRetryPolicy;
  readonly rateLimit: ExternalProviderRateLimit;
  readonly secretReferences: readonly ExternalProviderSecretReference[];
  /**
   * Allowlisted origin. Operator-configured, `https:` only, and never derived
   * from a provider response or anything request-controlled.
   */
  readonly allowedOrigin: string;
}

/**
 * The contract a future live adapter implements.
 *
 * `buildRequest` describes a request, `mapResponse` interprets one it is
 * handed, and `transport` is what would actually perform it. The transport is
 * a *member* rather than an ambient dependency so that every provider declares
 * which one it uses — and so the shipped default, which reaches nothing, has to
 * be deliberately replaced rather than merely added to.
 */
export interface ExternalFlightProvider {
  readonly definition: ExternalFlightProviderDefinition;
  readonly transport: ExternalProviderTransport;
  buildRequest(
    search: ExternalNeutralSearch,
    context: ExternalProviderRequestContext,
  ): ExternalProviderSearchRequest;
  mapResponse(
    response: ExternalProviderSearchResponse,
    search: ExternalNeutralSearch,
    context: ExternalProviderRequestContext,
  ): MappingResult;
}
