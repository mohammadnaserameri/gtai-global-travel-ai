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
   * V1 publishes no legal documents, so those links are intentionally inert.
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
      { labelKey: "about", path: null },
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
      { labelKey: "contact", path: null },
      { labelKey: "accessibility", path: null },
      { labelKey: "partner", path: null },
    ],
  },
  {
    key: "legal",
    links: [
      { labelKey: "privacy", path: null },
      { labelKey: "terms", path: null },
      { labelKey: "affiliate", path: null },
      { labelKey: "cookies", path: null },
    ],
  },
];
