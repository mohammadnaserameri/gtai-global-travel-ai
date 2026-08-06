import "../../../server-only";

import { SECRET_REDACTION_MARKER } from "./external-provider-secrets";
import type {
  ExternalProviderSearchRequest,
  ExternalProviderSearchResponse,
} from "./external-provider-types";

/**
 * Redaction for anything that might be written down.
 *
 * The design rule is **allowlist, never denylist**. A denylist redactor —
 * "strip anything called `authorization` or `api_key`" — is wrong the first
 * time a provider names a credential `x-partner-token`, and it fails open: the
 * unrecognized field is published. So these functions start from nothing and
 * copy across only fields that are known to be safe, which fails closed on
 * anything new.
 *
 * The second rule is that **values are never carried, only shapes**. A
 * redacted request records that a `q` parameter was present and how long its
 * value was, not what it said. Query values on a flight search are the search
 * itself — origin, destination, dates — and a "redacted" log that keeps them
 * has redacted the credential and published the trip.
 */

/** Header names whose values may be recorded verbatim. Everything else is redacted. */
const SAFE_HEADER_ALLOWLIST: readonly string[] = [
  "accept",
  "accept-encoding",
  "content-type",
  "user-agent",
];

/** Response headers worth keeping for operational reasoning. */
const SAFE_RESPONSE_HEADER_ALLOWLIST: readonly string[] = [
  "content-type",
  "retry-after",
  "x-ratelimit-limit",
  "x-ratelimit-remaining",
  "x-ratelimit-reset",
];

/** Query parameter *names* that are not part of the traveller's search. */
const SAFE_QUERY_NAME_ALLOWLIST: readonly string[] = [
  "market",
  "locale",
  "currency",
];

export interface RedactedRequest {
  readonly method: string;
  /** Origin only. Never the path, never the query string. */
  readonly origin: string;
  /** Path with every dynamic segment replaced. */
  readonly pathShape: string;
  readonly headers: Readonly<Record<string, string>>;
  /** Parameter names mapped to a description of the value, never the value. */
  readonly query: Readonly<Record<string, string>>;
  readonly bodyByteLength: number;
  readonly secretIds: readonly string[];
}

export interface RedactedResponse {
  readonly statusCode: number;
  readonly statusClass: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly bodyShape: string;
  readonly durationMs: number;
}

function describeValue(value: string): string {
  return `<${value.length} chars>`;
}

/**
 * Replaces anything that looks like an identifier in a path.
 *
 * A path is usually structural, but provider APIs routinely put a session id,
 * a search id or a market code into one. Reducing every long or digit-bearing
 * segment to a placeholder keeps the shape — which is what an operator reads —
 * without keeping the identifier.
 */
function redactPathShape(pathname: string): string {
  return pathname
    .split("/")
    .map((segment) => {
      if (segment.length === 0) return segment;
      if (/^[a-z][a-z-]*$/i.test(segment) && segment.length <= 24) return segment;
      return ":id";
    })
    .join("/");
}

export function redactRequest(
  request: ExternalProviderSearchRequest,
): RedactedRequest {
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(request.headers)) {
    const lower = name.toLowerCase();
    headers[lower] = SAFE_HEADER_ALLOWLIST.includes(lower)
      ? value
      : SECRET_REDACTION_MARKER;
  }

  const query: Record<string, string> = {};
  for (const [name, value] of Object.entries(request.query)) {
    const lower = name.toLowerCase();
    query[lower] = SAFE_QUERY_NAME_ALLOWLIST.includes(lower)
      ? value
      : describeValue(value);
  }

  return {
    method: request.method,
    origin: request.url.origin,
    pathShape: redactPathShape(request.url.pathname),
    headers,
    query,
    bodyByteLength: request.body === null ? 0 : request.body.length,
    // Ids, which are configuration names, never values.
    secretIds: request.secretReferences.map((reference) => reference.secretId),
  };
}

/** `404` becomes `4xx`. An exact status plus a body is a fingerprint; a class is a signal. */
export function statusClassOf(statusCode: number): string {
  if (!Number.isInteger(statusCode) || statusCode < 100 || statusCode > 599) {
    return "invalid";
  }
  return `${Math.floor(statusCode / 100)}xx`;
}

/**
 * Describes a response body's structure without keeping any of its content.
 *
 * An operator debugging a mapping failure needs to know "the provider returned
 * an object with an `errors` array", not what the errors said — provider error
 * text routinely echoes back the request, and the request is the traveller's
 * search.
 */
function describeBodyShape(body: unknown): string {
  if (body === null) return "null";
  if (Array.isArray(body)) return `array[${body.length}]`;
  switch (typeof body) {
    case "object":
      return `object{${Object.keys(body as Record<string, unknown>)
        .slice(0, 12)
        .sort()
        .join(",")}}`;
    case "string":
      return `string<${body.length} chars>`;
    case "number":
    case "boolean":
      return typeof body;
    case "undefined":
      return "undefined";
    default:
      return "unknown";
  }
}

export function redactResponse(
  response: ExternalProviderSearchResponse,
): RedactedResponse {
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(response.headers)) {
    const lower = name.toLowerCase();
    headers[lower] = SAFE_RESPONSE_HEADER_ALLOWLIST.includes(lower)
      ? value
      : SECRET_REDACTION_MARKER;
  }

  return {
    statusCode: response.statusCode,
    statusClass: statusClassOf(response.statusCode),
    headers,
    bodyShape: describeBodyShape(response.body),
    durationMs: response.durationMs,
  };
}

/**
 * Truncates and scrubs a provider's own error text for operator-facing use.
 *
 * Provider diagnostics are the last place a credential tends to survive: an
 * error message that echoes the request URL carries the query string, and one
 * that echoes headers carries the key. Anything resembling a long opaque token,
 * a bearer prefix or a URL is replaced before the text is kept, and the result
 * is length-capped so an enormous payload cannot be laundered into a log one
 * "diagnostic" at a time.
 *
 * This value is operator-facing only. It never reaches a client envelope —
 * the wire carries stable machine-readable codes, and customer wording lives
 * in the locale dictionaries.
 */
export function redactDiagnostic(text: unknown, maxLength = 200): string | null {
  if (typeof text !== "string" || text.trim().length === 0) return null;
  const scrubbed = text
    .replace(/https?:\/\/\S+/gi, SECRET_REDACTION_MARKER)
    .replace(
      /\b(?:bearer|token|key|secret|password)\b\s*[:=]?\s*\S+/gi,
      SECRET_REDACTION_MARKER,
    )
    // Long opaque runs are what raw credentials look like once the label is gone.
    .replace(/\b[A-Za-z0-9_-]{24,}\b/g, SECRET_REDACTION_MARKER)
    .trim();
  if (scrubbed.length === 0) return null;
  return scrubbed.length > maxLength
    ? `${scrubbed.slice(0, maxLength)}…`
    : scrubbed;
}
