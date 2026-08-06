import "../../../server-only";

/** Stable Duffel-specific marker. It reveals neither a prefix nor a suffix. */
export const DUFFEL_TOKEN_REDACTION_LABEL = "[redacted:duffel-token]";

const SENSITIVE_HEADER_NAMES = new Set([
  "authorization",
  "proxy-authorization",
  "x-api-key",
  "x-access-token",
]);

/**
 * Redacts future request headers without retaining any credential material.
 * Header names are normalized for deterministic audit output.
 */
export function redactDuffelHeaders(
  headers: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  const redacted: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    const normalized = name.toLowerCase();
    redacted[normalized] = SENSITIVE_HEADER_NAMES.has(normalized)
      ? DUFFEL_TOKEN_REDACTION_LABEL
      : (redactDuffelText(value) ?? DUFFEL_TOKEN_REDACTION_LABEL);
  }
  return Object.freeze(redacted);
}

/**
 * Scrubs credential-bearing diagnostic text for future operator-only use.
 * Raw URLs, bearer values and token-like opaque runs fail closed.
 */
export function redactDuffelText(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const markerSentinel = "\uE000";
  const redacted = value
    .replace(/https?:\/\/\S+/gi, markerSentinel)
    .replace(/\bBearer\s+\S+/gi, markerSentinel)
    .replace(
      /\b(?:DUFFEL_ACCESS_TOKEN|access[_-]?token|token|secret|api[_-]?key)\b\s*[:=]?\s*\S+/gi,
      markerSentinel,
    )
    .replace(/\b[A-Za-z0-9_-]{24,}\b/g, markerSentinel)
    .replaceAll(markerSentinel, DUFFEL_TOKEN_REDACTION_LABEL)
    .trim();
  return redacted.length === 0 ? null : redacted;
}

/** Safe future audit metadata. It accepts no raw credential value. */
export interface DuffelCredentialAuditSummary {
  readonly providerId: "duffel-test-contract";
  readonly configured: boolean;
  readonly source: "server-env";
  readonly reason:
    "missing" | "present-but-inactive" | "invalid-shape" | "public-name-forbidden";
  readonly credential: typeof DUFFEL_TOKEN_REDACTION_LABEL | null;
}
