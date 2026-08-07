import "../server-only";

import type {
  TravelImageCategory,
  TravelImageRequest,
} from "../../features/travel-images/travel-image-types";

const CATEGORY_SUFFIXES: Readonly<Record<TravelImageCategory, readonly string[]>> =
  Object.freeze({
    hero: ["travel skyline", "travel landmarks", "city panorama"],
    destination: ["skyline", "travel", "landmarks"],
    explore: ["travel landscape", "travel destination", "scenic journey"],
    flights: ["airport travel", "airplane travel", "skyline flight"],
    stays: ["hotel room", "apartment interior", "boutique hotel"],
    cars: ["rental car", "road trip", "scenic drive"],
    packages: ["vacation", "city hotel", "holiday travel"],
  });

function cleanTerm(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s.'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

export function generateTravelImageQueries(
  request: TravelImageRequest,
): readonly string[] {
  const destination = cleanTerm(request.destination);
  const country = cleanTerm(request.country);
  const place = [destination, country].filter(Boolean).join(" ");
  const prefix = place || "global travel";

  return CATEGORY_SUFFIXES[request.category].map((suffix) =>
    `${prefix} ${suffix}`.trim(),
  );
}
