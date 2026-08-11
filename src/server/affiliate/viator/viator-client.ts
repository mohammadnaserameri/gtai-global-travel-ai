import "../../server-only";

import { resolveViatorConfiguration } from "./viator-config";
import type { ViatorLocale } from "./viator-types";

const TIMEOUT_MS = 8_000;
const MAX_RESPONSE_BYTES = 4_000_000;
const MAX_REQUESTS_PER_MINUTE = 30;
const requestTimes: number[] = [];

export type ViatorFailureCode =
  | "providerInactive"
  | "rateBudgetExceeded"
  | "timeout"
  | "transportFailure"
  | "upstreamRejected"
  | "malformedResponse";

export class ViatorProviderError extends Error {
  constructor(
    readonly code: ViatorFailureCode,
    readonly httpStatus: number | null,
    readonly retryable: boolean,
  ) {
    super(code);
    this.name = "ViatorProviderError";
  }
}

function discardExpired(now = Date.now()): void {
  while (requestTimes.length && requestTimes[0]! < now - 60_000)
    requestTimes.shift();
}

function consumeBudget(now = Date.now()): void {
  discardExpired(now);
  if (requestTimes.length >= MAX_REQUESTS_PER_MINUTE)
    throw new ViatorProviderError("rateBudgetExceeded", 429, true);
  requestTimes.push(now);
}

export async function requestViator(
  path: string,
  options: Readonly<{
    method?: "GET" | "POST";
    locale: ViatorLocale;
    body?: unknown;
  }>,
): Promise<unknown> {
  const configuration = resolveViatorConfiguration();
  if (!configuration.active || !configuration.apiKey)
    throw new ViatorProviderError("providerInactive", null, false);
  if (!path.startsWith("/") || path.includes("..") || /[\r\n]/.test(path))
    throw new ViatorProviderError("upstreamRejected", null, false);
  consumeBudget();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${configuration.baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers: {
        "exp-api-key": configuration.apiKey,
        Accept: "application/json;version=2.0",
        "Content-Type": "application/json",
        "Accept-Language": options.locale,
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok)
      throw new ViatorProviderError(
        "upstreamRejected",
        response.status,
        response.status === 429 || response.status >= 500,
      );
    const text = await response.text();
    if (!text || text.length > MAX_RESPONSE_BYTES)
      throw new ViatorProviderError("malformedResponse", response.status, false);
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new ViatorProviderError("malformedResponse", response.status, false);
    }
  } catch (error) {
    if (error instanceof ViatorProviderError) throw error;
    if (error instanceof Error && error.name === "AbortError")
      throw new ViatorProviderError("timeout", null, true);
    throw new ViatorProviderError("transportFailure", null, true);
  } finally {
    clearTimeout(timeout);
  }
}

export function getViatorRequestBudgetState(): Readonly<{
  limit: number;
  used: number;
}> {
  discardExpired();
  return Object.freeze({
    limit: MAX_REQUESTS_PER_MINUTE,
    used: requestTimes.length,
  });
}
