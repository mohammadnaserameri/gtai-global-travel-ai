import type { Metadata } from "next";

import { resolveContentLocale } from "@/config/locales";
import { getDictionary } from "@/i18n/get-dictionary";
import { buildPublicMetadata } from "@/lib/seo/public-metadata";
import { PUBLIC_PAGE_PATHS } from "@/config/public-company-profile";
import { PublicList, PublicPageShell } from "@/components/layout/PublicPageShell";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const { meta } = await getDictionary(resolveContentLocale(locale));
  return buildPublicMetadata({
    locale,
    title: meta.affiliateDisclosure.title,
    description: meta.affiliateDisclosure.description,
    siteName: meta.siteName,
    path: PUBLIC_PAGE_PATHS.affiliateDisclosure,
  });
}

/**
 * Affiliate Disclosure.
 *
 * Split into "Today" and "Planned" rather than written as one continuous
 * statement, because the honest answer to "does GTAI earn a commission?" has
 * two halves that are easy to blur together: no commission is earned from
 * anything on this site now, and the intention is that one day some will be.
 * A single paragraph covering both invariably reads as the more flattering of
 * the two.
 */
export default async function AffiliateDisclosurePage({ params }: PageProps) {
  const { locale } = await params;
  const dictionary = await getDictionary(resolveContentLocale(locale));
  const { publicPages } = dictionary;
  const page = publicPages.affiliateDisclosure;

  return (
    <PublicPageShell
      locale={locale}
      dictionary={dictionary}
      title={page.title}
      intro={page.intro}
      showLastUpdated
      showCompanyDetails
    >
      <PublicList heading={page.currentHeading} items={page.current} />
      <PublicList heading={page.futureHeading} items={page.future} />

      <p className="text-foreground-muted mt-8 text-sm leading-relaxed">
        {page.note}
      </p>
    </PublicPageShell>
  );
}
