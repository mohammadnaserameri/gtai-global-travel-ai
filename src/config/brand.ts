/**
 * GTAI brand constants.
 *
 * Only brand facts live here — never user-facing sentences. Anything a visitor
 * reads must come from a dictionary so it can be localized.
 */

export const brand = {
  /** Short brand mark shown in the logo and document titles. */
  name: "GTAI",
  /** Expanded brand name. */
  fullName: "Global Travel AI",
  /** Country the company originates from (ISO 3166-1 alpha-2). */
  originCountry: "CA",
  /** Reachable market. */
  market: "worldwide",
  /** Business model identifier used across docs and disclosures. */
  businessModel: "affiliate-travel-metasearch",
  /** Year used for the footer copyright line. */
  foundedYear: 2026,
  /**
   * Non-production contact placeholder. Intentionally a non-routable example
   * address — no real mailbox, no real domain, no secrets in source.
   */
  contactPlaceholder: "hello@example.invalid",
} as const;

export type Brand = typeof brand;
