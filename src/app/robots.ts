import type { MetadataRoute } from "next";

import { publicCompanyProfile, publicUrl } from "@/config/public-company-profile";

/**
 * Crawl policy.
 *
 * **Flight Results and Details are deliberately *not* disallowed here**, even
 * though they must never be indexed. Blocking a URL in `robots.txt` and
 * marking it `noindex` are alternatives, not complementary layers: a crawler
 * that is refused the fetch never reads the `noindex` it was refused, and the
 * URL can still be listed as a bare link discovered from elsewhere. Disallowing
 * them would therefore make the exclusion *less* reliable, not more.
 *
 * So the rule is: anything that needs to state a directive must be reachable
 * enough to state it. Results and Details carry `noindex, nofollow, nocache`
 * plus the Google-specific directives in their own metadata, and are absent
 * from the sitemap. That is the whole mechanism, and it works because a
 * crawler can read it.
 *
 * `/api/` is disallowed on different grounds. It publishes no HTML and no
 * directive — the internal search route answers `POST` only — so there is
 * nothing a crawler could usefully read there, and nothing to keep reachable.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/"] }],
    sitemap: publicUrl("/sitemap.xml"),
    host: publicCompanyProfile.websiteUrl,
  };
}
