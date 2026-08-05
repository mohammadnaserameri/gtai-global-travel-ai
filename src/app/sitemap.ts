import type { MetadataRoute } from "next";

import { dictionaryLocales } from "@/config/locales";
import {
  PUBLIC_PAGE_KEYS,
  PUBLIC_PAGE_PATHS,
  publicUrl,
} from "@/config/public-company-profile";
import { localePath } from "@/i18n/routing";

/**
 * The sitemap: the homepage and the five public information pages, in every
 * locale that ships an authored dictionary.
 *
 * Flight Results and Flight Details are deliberately absent, and their absence
 * is structural rather than an omission to remember. This file enumerates
 * `PUBLIC_PAGE_PATHS` — the shared list of pages that are *meant* to be
 * public — so a generated demonstration itinerary has no route into the
 * sitemap even if someone later adds one to the application. Locales without
 * an authored dictionary are also excluded: they render, but they fall back to
 * English strings, and submitting them as distinct localized pages would
 * overstate what exists.
 *
 * `changeFrequency` and `priority` are hints, not claims about content, so
 * they carry no truthfulness risk. `lastModified` is the build time, which is
 * the most honest signal available — these pages change when the site is
 * redeployed.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  const entries: MetadataRoute.Sitemap = [];

  for (const locale of dictionaryLocales) {
    entries.push({
      url: publicUrl(localePath(locale, "/")),
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    });

    for (const key of PUBLIC_PAGE_KEYS) {
      entries.push({
        url: publicUrl(localePath(locale, PUBLIC_PAGE_PATHS[key])),
        lastModified,
        changeFrequency: "monthly",
        priority: 0.5,
      });
    }
  }

  return entries;
}
