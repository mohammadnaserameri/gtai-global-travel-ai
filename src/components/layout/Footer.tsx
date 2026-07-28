import Link from "next/link";

import { brand } from "@/config/brand";
import { footerGroups } from "@/config/navigation";
import { localePath } from "@/i18n/routing";
import type { Dictionary } from "@/i18n/get-dictionary";
import { Container } from "@/components/layout/Container";
import { Logo } from "@/components/brand/Logo";
import { LanguageSelector } from "@/components/navigation/LanguageSelector";
import { RegionCurrencySelector } from "@/components/region/RegionCurrencySelector";
import { AffiliateDisclosure } from "@/components/ui/AffiliateDisclosure";

interface FooterProps {
  locale: string;
  dictionary: Dictionary;
}

type LinkDictionary = Record<string, string>;

/**
 * Global footer.
 *
 * Most destinations are inert placeholders: V1 publishes no legal documents, so
 * linking to a Privacy or Terms page would imply a document that does not
 * exist. Placeholders are rendered as plain text with a stated reason rather
 * than as links to nowhere.
 */
export function Footer({ locale, dictionary }: FooterProps) {
  const { footer, language, region, affiliate } = dictionary;

  return (
    <footer className="border-border bg-background-muted mt-auto border-t">
      <Container className="py-12 lg:py-16">
        {/* The footer carries the short form on every page; the homepage
            renders the full disclosure as its own section. */}
        <AffiliateDisclosure
          variant="inline"
          labels={affiliate}
          className="border-border bg-surface mb-10 rounded-lg border p-4"
        />

        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,2.4fr)]">
          <div className="flex flex-col gap-4">
            <Logo showSubtitle size="md" />
            <p className="text-foreground-muted max-w-xs text-sm leading-relaxed">
              {footer.tagline}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-4">
            {footerGroups.map((group) => {
              const groupDictionary = footer.groups[group.key];
              const links: LinkDictionary = groupDictionary.links;

              return (
                <nav key={group.key} aria-label={groupDictionary.heading}>
                  <h2 className="text-foreground text-xs font-semibold tracking-[0.12em] uppercase">
                    {groupDictionary.heading}
                  </h2>
                  <ul className="mt-3 flex flex-col gap-1">
                    {group.links.map((link) => {
                      const label = links[link.labelKey] ?? link.labelKey;
                      return (
                        <li key={link.labelKey}>
                          {link.path ? (
                            <Link
                              href={localePath(locale, link.path)}
                              className="text-foreground-secondary hover:text-brand-ink focus-visible:outline-focus-ring inline-flex min-h-9 items-center rounded-sm text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
                            >
                              {label}
                            </Link>
                          ) : (
                            <span className="text-foreground-muted inline-flex min-h-9 items-center text-sm">
                              {label}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </nav>
              );
            })}
          </div>
        </div>

        <div className="border-border mt-10 flex flex-col gap-4 border-t pt-8">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-foreground text-xs font-semibold tracking-[0.12em] uppercase">
              {footer.regionHeading}
            </span>
            <LanguageSelector locale={locale} labels={language} />
            <RegionCurrencySelector labels={region} />
          </div>

          <p className="text-foreground-muted text-xs leading-relaxed">
            {footer.placeholderNotice}
          </p>

          <div className="text-foreground-muted flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="gtai-ltr-numerals">
              © {brand.foundedYear} {footer.copyright}
            </span>
            <span aria-hidden="true">·</span>
            <span>{footer.buildNotice}</span>
          </div>
        </div>
      </Container>
    </footer>
  );
}
