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
 * Split into "Today" and "Planned" so active affiliate links, demonstration
 * inventory, and future partner expansion remain visibly distinct.
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
