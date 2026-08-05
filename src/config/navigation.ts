import { PUBLIC_PAGE_PATHS } from "@/config/public-company-profile";
import type { Dictionary } from "@/i18n/get-dictionary";

type NavLabelKey = keyof Dictionary["nav"];

export interface NavItem {
  /** Dictionary key under `nav` — never a literal English string. */
  labelKey: NavLabelKey;
  /** Locale-relative path. Combine with `localePath()` before rendering. */
  path: string;
}

/** Travel products. Rendered as the header's primary navigation. */
export const primaryNav: readonly NavItem[] = [
  { labelKey: "flights", path: "/flights" },
  { labelKey: "stays", path: "/stays" },
  { labelKey: "cars", path: "/cars" },
  { labelKey: "packages", path: "/packages" },
  { labelKey: "explore", path: "/explore" },
];

/** Account and cross-cutting destinations. */
export const utilityNav: readonly NavItem[] = [
  { labelKey: "aiTravel", path: "/ai-travel" },
  { labelKey: "trips", path: "/trips" },
];

type FooterGroupKey = keyof Dictionary["footer"]["groups"];

export interface FooterLink {
  /** Key under `footer.groups.<group>.links`. */
  labelKey: string;
  /**
   * Locale-relative path, or `null` for a placeholder with no destination.
   * Placeholders render as plain text rather than as links to nowhere.
   */
  path: string | null;
}

export interface FooterGroup {
  key: FooterGroupKey;
  links: readonly FooterLink[];
}

export const footerGroups: readonly FooterGroup[] = [
  {
    key: "company",
    links: [
      { labelKey: "howItWorks", path: null },
      { labelKey: "careers", path: null },
      { labelKey: "press", path: null },
    ],
  },
  {
    key: "travel",
    links: [
      { labelKey: "flights", path: "/flights" },
      { labelKey: "stays", path: "/stays" },
      { labelKey: "cars", path: "/cars" },
      { labelKey: "packages", path: "/packages" },
      { labelKey: "explore", path: "/explore" },
    ],
  },
  {
    key: "support",
    links: [
      { labelKey: "help", path: null },
      { labelKey: "accessibility", path: null },
      { labelKey: "partner", path: null },
    ],
  },
  {
    // Every link in this group is a real published page as of V2.8-A. The
    // paths come from `PUBLIC_PAGE_PATHS` rather than being retyped, so the
    // Footer, the sitemap and the routes cannot describe different sets.
    key: "legal",
    links: [
      { labelKey: "about", path: PUBLIC_PAGE_PATHS.about },
      { labelKey: "contact", path: PUBLIC_PAGE_PATHS.contact },
      { labelKey: "privacy", path: PUBLIC_PAGE_PATHS.privacy },
      { labelKey: "terms", path: PUBLIC_PAGE_PATHS.terms },
      {
        labelKey: "affiliateDisclosure",
        path: PUBLIC_PAGE_PATHS.affiliateDisclosure,
      },
    ],
  },
];
