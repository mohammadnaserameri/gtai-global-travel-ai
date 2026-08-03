import "../server-only";

/**
 * Reading an untrusted request body safely.
 *
 * The naive `await request.text()` is wrong in two ways that matter here.
 * First, it consumes the whole stream before anyone can object to its size —
 * a limit checked afterwards has already lost. Second, `String.length` counts
 * UTF-16 code units, not bytes: a Persian or Arabic payload is roughly two
 * bytes per character, so a "limit" expressed in string length lets through
 * about twice what it claims. This module reads the stream itself, counts
 * real bytes, and stops the moment the ceiling is crossed.
 */

/** Cancels a body if there is one, swallowing the cancellation's own failure. */
async function cancelQuietly(
  body: ReadableStream<Uint8Array> | null,
): Promise<void> {
  if (body === null) return;
  try {
    await body.cancel();
  } catch {
    // Already cancelled, already errored, or unsupported — nothing to do, and
    // nothing about the failure is worth surfacing.
  }
}

export type BodyReadResult =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly reason: "tooLarge" | "empty" | "unreadable" };

/**
 * The Content-Type policy.
 *
 * Only the media type is considered: everything from the first `;` onward is
 * a parameter list, so `application/json; charset=utf-8` is the same media
 * type as `application/json` and must be accepted. The comparison is exact
 * after trimming and lowercasing, which is what rejects the near-misses —
 * `application/jsonp` and `text/application/json` both merely *contain* the
 * string `application/json`, and a substring test would wave them through.
 */
export function isJsonContentType(header: string | null): boolean {
  if (header === null) return false;
  const mediaType = header.split(";")[0]?.trim().toLowerCase() ?? "";
  return mediaType === "application/json";
}

/**
 * Reads at most `maxBytes` from the request body.
 *
 * The stream is consumed exactly once and never followed by `request.text()`.
 * On rejection the reader is cancelled, so a hostile sender is not left with
 * an open pipe this process is still draining. Decoding happens only after
 * the bytes are accepted, so an oversized payload is never turned into a
 * string at all.
 */
export async function readBoundedRequestBody(
  request: Request,
  maxBytes: number,
): Promise<BodyReadResult> {
  const body = request.body;

  // A declared length over the ceiling is refused before a single byte is
  // read — but the stream is still cancelled, so a hostile sender is not left
  // with a pipe this process would otherwise keep open. It is a hint, not a
  // guarantee, so the streamed count below still enforces the real limit for
  // chunked or mis-declared requests.
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    const length = Number(declared);
    if (Number.isFinite(length) && length > maxBytes) {
      await cancelQuietly(body);
      return { ok: false, reason: "tooLarge" };
    }
  }

  if (body === null) return { ok: false, reason: "empty" };

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value === undefined) continue;

      // `byteLength`, never `.length` on a decoded string.
      total += value.byteLength;
      if (total > maxBytes) {
        // Stop at the first chunk that crosses the line — the rest is never
        // read, let alone buffered.
        await reader.cancel().catch(() => undefined);
        return { ok: false, reason: "tooLarge" };
      }
      chunks.push(value);
    }
  } catch {
    // A transport failure mid-read. The thrown value is deliberately not
    // inspected or forwarded — nothing about it is safe to surface.
    await reader.cancel().catch(() => undefined);
    return { ok: false, reason: "unreadable" };
  } finally {
    // Release the lock on every path the platform allows, so the body is not
    // left locked to a reader nobody holds any more.
    try {
      reader.releaseLock();
    } catch {
      // A reader that is already released or errored cannot be released
      // again; that is the desired end state either way.
    }
  }

  if (total === 0) return { ok: false, reason: "empty" };

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    // `fatal` so malformed UTF-8 is a rejection rather than a string full of
    // replacement characters that later parses into something unintended.
    return {
      ok: true,
      text: new TextDecoder("utf-8", { fatal: true }).decode(merged),
    };
  } catch {
    return { ok: false, reason: "unreadable" };
  }
}
