import "../../../server-only";

import { parseRetryAfterMs } from "../external/external-provider-error-normalizer";
import type { NormalizedExternalFailure } from "../external/external-provider-failures";
import { decideRetryForCategory } from "../external/external-provider-retry";
import type {
  ExternalProviderRetryPolicy,
  ExternalProviderTimeoutPolicy,
} from "../external/external-provider-types";
import {
  DUFFEL_API_ORIGIN,
  type DuffelCreateOfferRequestContract,
  type DuffelListOffersRequestContract,
} from "./duffel-contract";
import {
  revealDuffelCredentialForFutureTransport,
  type DuffelCredentialCapsule,
} from "./duffel-credential-resolver";
import { normalizeDuffelFailure } from "./duffel-failures";

export const DUFFEL_RUNTIME_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export const DUFFEL_RUNTIME_TIMEOUT_POLICY: ExternalProviderTimeoutPolicy =
  Object.freeze({
    connectTimeoutMs: 2_000,
    requestTimeoutMs: 8_000,
    totalDeadlineMs: 20_000,
  });

export const DUFFEL_RUNTIME_RETRY_POLICY: ExternalProviderRetryPolicy =
  Object.freeze({
    maximumAttempts: 3,
    initialBackoffMs: 200,
    backoffMultiplier: 2,
    maximumBackoffMs: 2_000,
    jitterRatio: 0,
    retryableFailures: ["timeout", "rateLimited", "unavailable"] as const,
  });

export interface DuffelFetchResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly headers: { get(name: string): string | null };
  text(): Promise<string>;
}

export type DuffelFetchLike = (
  input: string,
  init: {
    readonly method: "GET" | "POST";
    readonly headers: Readonly<Record<string, string>>;
    readonly body?: string;
    readonly signal: AbortSignal;
  },
) => Promise<DuffelFetchResponse>;

export type DuffelRuntimeOperation =
  DuffelCreateOfferRequestContract | DuffelListOffersRequestContract;

export type DuffelRuntimeTransportResult =
  | {
      readonly ok: true;
      readonly statusCode: number;
      readonly body: unknown;
      readonly attempts: number;
      readonly durationMs: number;
    }
  | {
      readonly ok: false;
      readonly failure: NormalizedExternalFailure;
      readonly attempts: number;
      readonly durationMs: number;
    };

export interface DuffelRuntimeTransport {
  readonly transportId: "duffel-test-runtime-transport";
  execute(
    operation: DuffelRuntimeOperation,
    context: {
      readonly signal: AbortSignal;
      readonly requestId: string;
      readonly deadlineAt: number;
    },
  ): Promise<DuffelRuntimeTransportResult>;
}

export interface CreateDuffelRuntimeTransportOptions {
  readonly credential: DuffelCredentialCapsule;
  readonly fetch: DuffelFetchLike;
  readonly now?: () => number;
  readonly sleep?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  readonly timeoutPolicy?: ExternalProviderTimeoutPolicy;
  readonly retryPolicy?: ExternalProviderRetryPolicy;
  readonly maximumResponseBytes?: number;
}

function defaultSleep(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

function operationUrl(operation: DuffelRuntimeOperation): string {
  const url = new URL(operation.path, DUFFEL_API_ORIGIN);
  if (url.origin !== DUFFEL_API_ORIGIN) throw new Error("Duffel origin refused");
  for (const [name, value] of Object.entries(operation.query)) {
    if (value !== undefined) url.searchParams.set(name, value);
  }
  return url.toString();
}

function isAllowedOperation(operation: DuffelRuntimeOperation): boolean {
  return (
    (operation.method === "POST" && operation.path === "/air/offer_requests") ||
    (operation.method === "GET" && operation.path === "/air/offers")
  );
}

function isAbort(error: unknown, signal: AbortSignal): boolean {
  return (
    signal.aborted || (error instanceof DOMException && error.name === "AbortError")
  );
}

/**
 * Authenticated Duffel test transport. It is not instantiated by the runtime
 * registry and cannot run without an explicit server credential and fetch seam.
 */
export function createDuffelRuntimeTransport(
  options: CreateDuffelRuntimeTransportOptions,
): DuffelRuntimeTransport {
  const now = options.now ?? (() => Date.now());
  const sleep = options.sleep ?? defaultSleep;
  const timeoutPolicy = options.timeoutPolicy ?? DUFFEL_RUNTIME_TIMEOUT_POLICY;
  const retryPolicy = options.retryPolicy ?? DUFFEL_RUNTIME_RETRY_POLICY;
  const maximumResponseBytes =
    options.maximumResponseBytes ?? DUFFEL_RUNTIME_MAX_RESPONSE_BYTES;

  const transport: DuffelRuntimeTransport = {
    transportId: "duffel-test-runtime-transport" as const,
    async execute(
      operation: DuffelRuntimeOperation,
      context: {
        readonly signal: AbortSignal;
        readonly requestId: string;
        readonly deadlineAt: number;
      },
    ): Promise<DuffelRuntimeTransportResult> {
      const startedAt = now();
      let attempt = 1;

      if (!isAllowedOperation(operation)) {
        return {
          ok: false,
          failure: normalizeDuffelFailure({
            requestId: context.requestId,
            occurredAt: new Date(now()).toISOString(),
            statusCode: 400,
          }),
          attempts: 0,
          durationMs: 0,
        };
      }

      while (true) {
        if (context.signal.aborted || now() >= context.deadlineAt) {
          return {
            ok: false,
            failure: normalizeDuffelFailure({
              requestId: context.requestId,
              occurredAt: new Date(now()).toISOString(),
              kind: context.signal.aborted ? "aborted" : "network",
            }),
            attempts: attempt - 1,
            durationMs: now() - startedAt,
          };
        }

        const controller = new AbortController();
        const remaining = Math.max(1, context.deadlineAt - now());
        const timeout = Math.min(timeoutPolicy.requestTimeoutMs, remaining);
        const onAbort = () => controller.abort();
        context.signal.addEventListener("abort", onAbort, { once: true });
        let timedOut = false;
        const timer = setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, timeout);

        let failure: NormalizedExternalFailure;
        try {
          const token = revealDuffelCredentialForFutureTransport(
            options.credential,
          );
          const response = await options.fetch(operationUrl(operation), {
            method: operation.method,
            headers: Object.freeze({
              ...operation.headers,
              Authorization: `Bearer ${token}`,
            }),
            ...(operation.method === "POST"
              ? { body: JSON.stringify(operation.body) }
              : {}),
            signal: controller.signal,
          });
          const text = await response.text();
          if (new TextEncoder().encode(text).byteLength > maximumResponseBytes) {
            failure = normalizeDuffelFailure({
              requestId: context.requestId,
              occurredAt: new Date(now()).toISOString(),
              kind: "unexpectedSchema",
              statusCode: response.status,
            });
          } else if (!response.ok) {
            failure = normalizeDuffelFailure({
              requestId: context.requestId,
              occurredAt: new Date(now()).toISOString(),
              statusCode: response.status,
              retryAfterMs: parseRetryAfterMs(
                response.headers.get("retry-after") ?? undefined,
                now(),
              ),
            });
          } else {
            try {
              const body: unknown = JSON.parse(text);
              return {
                ok: true,
                statusCode: response.status,
                body,
                attempts: attempt,
                durationMs: now() - startedAt,
              };
            } catch {
              failure = normalizeDuffelFailure({
                requestId: context.requestId,
                occurredAt: new Date(now()).toISOString(),
                kind: "malformedJson",
                statusCode: response.status,
              });
            }
          }
        } catch (error: unknown) {
          failure = normalizeDuffelFailure({
            requestId: context.requestId,
            occurredAt: new Date(now()).toISOString(),
            kind: context.signal.aborted
              ? "aborted"
              : timedOut
                ? "timeout"
                : isAbort(error, controller.signal)
                  ? "aborted"
                  : "network",
          });
        } finally {
          clearTimeout(timer);
          context.signal.removeEventListener("abort", onAbort);
        }

        const decision = decideRetryForCategory({
          policy: retryPolicy,
          category: failure.category,
          attempt,
          elapsedMs: now() - startedAt,
          timeoutPolicy,
          aborted: context.signal.aborted,
          retryAfterMs: failure.retryAfterMs,
          jitter: 0,
        });
        if (!decision.retry) {
          return {
            ok: false,
            failure,
            attempts: attempt,
            durationMs: now() - startedAt,
          };
        }
        try {
          await sleep(decision.delayMs, context.signal);
        } catch {
          return {
            ok: false,
            failure: normalizeDuffelFailure({
              requestId: context.requestId,
              occurredAt: new Date(now()).toISOString(),
              kind: "aborted",
            }),
            attempts: attempt,
            durationMs: now() - startedAt,
          };
        }
        attempt = decision.nextAttempt;
      }
    },
  };
  return Object.freeze(transport);
}
