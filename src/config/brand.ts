/**
 * GTAI brand constants.
 *
 * Only brand facts live here — never user-facing sentences. Anything a visitor
 * reads must come from a dictionary so it can be localized.
 *
 * Public *contact* information deliberately does not live here. It has one
 * home, `config/public-company-profile.ts`, and the placeholder address this
 * module used to carry was removed in V2.8-A: an unused second email constant
 * is a second answer to "how do people reach GTAI", and two answers is one
 * too many.
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
} as const;

export type Brand = typeof brand;
