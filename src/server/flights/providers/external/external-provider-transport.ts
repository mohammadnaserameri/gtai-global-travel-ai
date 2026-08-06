import "../../../server-only";

import {
  buildExternalFailure,
  type NormalizedExternalFailure,
} from "./external-provider-failures";
import type {
  ExternalProviderRequestContext,
  ExternalProviderSearchRequest,
  ExternalProviderSearchResponse,
} from "./external-provider-types";

/**
 * The transport boundary.
 *
 * An earlier draft of V2.8-B left this out and called the omission deliberate.
 * It was not defensible: without a transport *interface* the layer has no
 * seam, so the first integration invents one under delivery pressure and the
 * inactive default — the thing that makes "no external call" a property of the
 * code rather than of nobody having written one yet — never exists at all.
 *
 * So the interface is here, and the only implementation shipped is one that
 * cannot reach anything. `InactiveExternalProviderTransport` is the default
 * everywhere a transport is required, which inverts the risk: a future
 * integration has to *replace* something to make a network call, rather than
 * merely adding the first one.
 *
 * There is no `fetch`, no `node:http`, no socket and no HTTP client in this
 * module or anywhere else in this directory, and
 * `verify:provider-integration-readiness` asserts it.
 */

/**
 * What a live transport will implement.
 *
 * Deliberately minimal, and deliberately *not* responsible for retries,
 * backoff, rate limiting or redaction. Those are policies that must apply
 * identically whichever transport is in use, so they live in their own modules
 * and compose around this one. A transport that retried internally would make
 * the retry policy untestable and unenforceable.
 */
export interface ExternalProviderTransport {
  /** Stable id, so audit can record which transport answered. */
  readonly transportId: string;
  search(
    request: ExternalProviderSearchRequest,
    context: ExternalProviderRequestContext,
  ): Promise<ExternalProviderSearchResponse>;
}

/**
 * Thrown instead of returning a response, because there is no response.
 *
 * A transport that cannot reach anything has no status code, no headers and no
 * body, and fabricating a synthetic `503` would be a lie that the rest of the
 * pipeline would then reason about as if a provider had answered. The typed
 * failure is attached to the error so a caller normalizes it without inspecting
 * a message string.
 */
export class InactiveTransportError extends Error {
  readonly failure: NormalizedExternalFailure;

  constructor(failure: NormalizedExternalFailure) {
    super(failure.safeMessage);
    this.name = "InactiveTransportError";
    this.failure = failure;
  }
}

export interface InactiveTransportOptions {
  /** Injected so the failure's timestamp is deterministic under test. */
  readonly now?: () => number;
  readonly providerId?: string;
}

/**
 * The shipped transport: performs exactly zero network calls.
 *
 * Two behaviours are worth stating explicitly because they are easy to get
 * wrong and impossible to notice when they are wrong:
 *
 * 1. **An already-aborted signal is honoured first.** A caller that has gone
 *    away must produce `aborted`, not `notConfigured` — recording it as a
 *    configuration fault would make a navigated-away visitor countable as a
 *    provider problem, which is precisely the conflation V2.7 already refuses.
 * 2. **It is deterministic.** Same input, same failure, every time. A default
 *    that occasionally behaved differently would make every test above it
 *    flaky and would eventually be "fixed" by someone giving it a real
 *    transport.
 */
export function createInactiveExternalProviderTransport(
  options: InactiveTransportOptions = {},
): ExternalProviderTransport {
  const now = options.now ?? (() => Date.now());
  const providerId = options.providerId ?? "external-inactive";

  return {
    transportId: "inactive-external-transport",

    search(
      _request: ExternalProviderSearchRequest,
      context: ExternalProviderRequestContext,
    ): Promise<ExternalProviderSearchResponse> {
      // The abort check comes first, before any other consideration. See (1).
      if (context.signal.aborted) {
        return Promise.reject(
          new InactiveTransportError(
            buildExternalFailure({
              category: "aborted",
              providerId,
              requestId: context.searchContextId,
              occurredAt: new Date(now()).toISOString(),
            }),
          ),
        );
      }

      // No provider is configured, so there is nothing to call. This is the
      // only other outcome this transport has.
      return Promise.reject(
        new InactiveTransportError(
          buildExternalFailure({
            category: "notConfigured",
            providerId,
            requestId: context.searchContextId,
            occurredAt: new Date(now()).toISOString(),
          }),
        ),
      );
    },
  };
}

/**
 * The process-wide default.
 *
 * A module-level constant rather than a factory call at each site, so that
 * "the default transport reaches nothing" is one greppable fact rather than a
 * property of however many call sites happen to exist.
 */
export const inactiveExternalProviderTransport: ExternalProviderTransport =
  createInactiveExternalProviderTransport();

/**
 * Normalizes whatever a transport threw.
 *
 * `InactiveTransportError` already carries a typed failure and is passed
 * through unchanged. Anything else is an unrecognized throw from a future
 * transport and becomes `networkFailure` — never `unknown`, because a
 * transport that throws has, by definition, failed to complete an exchange.
 * The thrown value is deliberately not read, formatted or forwarded: a
 * transport error message is the single most likely place for a URL with a
 * credential in its query string to survive.
 */
export function normalizeTransportError(
  cause: unknown,
  providerId: string,
  requestId: string,
  occurredAt: string,
): NormalizedExternalFailure {
  if (cause instanceof InactiveTransportError) return cause.failure;
  return buildExternalFailure({
    category: "networkFailure",
    providerId,
    requestId,
    occurredAt,
  });
}
