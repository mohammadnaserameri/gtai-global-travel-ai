import type { FlightOffer } from "../flight-offer-types";
import { isCanonicalFlightOfferForIntent } from "../flight-offer-intent-validation";
import type { FlightSearchIntent } from "../search-intent-types";
import { serializeSearchIntent } from "../search-intent-url";
import { isValidOfferId } from "./flight-details-url";

const STORAGE_PREFIX = "gtai:preview-flight-offer:v1:";
const SNAPSHOT_VERSION = 1;
const SNAPSHOT_TTL_MS = 15 * 60 * 1000;
const MAX_SNAPSHOT_LENGTH = 128 * 1024;
const LIVE_OFFER_ID_PATTERN = /^duffel:off_[A-Za-z0-9_]{1,96}$/;

export interface PreviewOfferStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface OfferSnapshot {
  readonly version: number;
  readonly storedAt: number;
  readonly expiresAt: number;
  readonly intentKey: string;
  readonly offer: FlightOffer;
}

export function isPreviewOfferId(offerId: string): boolean {
  return LIVE_OFFER_ID_PATTERN.test(offerId) && isValidOfferId(offerId);
}

function storageKey(offerId: string): string {
  return `${STORAGE_PREFIX}${offerId}`;
}

function intentKey(intent: FlightSearchIntent): string {
  return serializeSearchIntent(intent).toString();
}

function browserSessionStorage(): PreviewOfferStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function hasExactKeys(record: Record<string, unknown>): boolean {
  return (
    Object.keys(record).sort().join(",") ===
    "expiresAt,intentKey,offer,storedAt,version"
  );
}

export function persistPreviewOfferSnapshots(
  intent: FlightSearchIntent,
  offers: readonly FlightOffer[],
  now = Date.now(),
  storage: PreviewOfferStorage | null = browserSessionStorage(),
): void {
  if (storage === null || !Number.isSafeInteger(now) || now < 0) return;
  const canonicalIntentKey = intentKey(intent);
  for (const offer of offers) {
    if (
      offer.isDemonstration ||
      !isPreviewOfferId(offer.id) ||
      !isCanonicalFlightOfferForIntent(offer, intent)
    ) {
      continue;
    }
    const snapshot: OfferSnapshot = {
      version: SNAPSHOT_VERSION,
      storedAt: now,
      expiresAt: now + SNAPSHOT_TTL_MS,
      intentKey: canonicalIntentKey,
      offer,
    };
    try {
      const serialized = JSON.stringify(snapshot);
      if (serialized.length <= MAX_SNAPSHOT_LENGTH) {
        storage.setItem(storageKey(offer.id), serialized);
      }
    } catch {
      // Optional same-tab handoff: quota/privacy failures cannot fail Search.
    }
  }
}

export function readPreviewOfferSnapshot(
  intent: FlightSearchIntent,
  offerId: string,
  now = Date.now(),
  storage: PreviewOfferStorage | null = browserSessionStorage(),
): FlightOffer | null {
  if (
    storage === null ||
    !isPreviewOfferId(offerId) ||
    !Number.isSafeInteger(now) ||
    now < 0
  ) {
    return null;
  }
  const key = storageKey(offerId);
  let serialized: string | null;
  try {
    serialized = storage.getItem(key);
  } catch {
    return null;
  }
  if (serialized === null) return null;
  const reject = (): null => {
    try {
      storage.removeItem(key);
    } catch {
      // Rejection does not depend on successful cleanup.
    }
    return null;
  };
  if (serialized.length === 0 || serialized.length > MAX_SNAPSHOT_LENGTH) {
    return reject();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    return reject();
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return reject();
  }
  const record = parsed as Record<string, unknown>;
  if (!hasExactKeys(record) || record.version !== SNAPSHOT_VERSION) return reject();
  if (
    !Number.isSafeInteger(record.storedAt) ||
    !Number.isSafeInteger(record.expiresAt)
  ) {
    return reject();
  }
  const storedAt = record.storedAt as number;
  const expiresAt = record.expiresAt as number;
  if (
    storedAt < 0 ||
    expiresAt !== storedAt + SNAPSHOT_TTL_MS ||
    now < storedAt ||
    now >= expiresAt ||
    record.intentKey !== intentKey(intent)
  ) {
    return reject();
  }
  const offer = record.offer;
  if (
    typeof offer !== "object" ||
    offer === null ||
    (offer as FlightOffer).id !== offerId ||
    (offer as FlightOffer).isDemonstration !== false ||
    !isCanonicalFlightOfferForIntent(offer, intent)
  ) {
    return reject();
  }
  return offer as FlightOffer;
}
