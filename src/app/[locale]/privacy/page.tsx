import type { Metadata } from "next";

import { resolveContentLocale } from "@/config/locales";
import { getDictionary } from "@/i18n/get-dictionary";
import { buildPublicMetadata } from "@/lib/seo/public-metadata";
import { PUBLIC_PAGE_PATHS } from "@/config/public-company-profile";
import {
  PublicPageShell,
  PublicSection,
} from "@/components/layout/PublicPageShell";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const { meta } = await getDictionary(resolveContentLocale(locale));
  return buildPublicMetadata({
    locale,
    title: meta.privacy.title,
    description: meta.privacy.description,
    siteName: meta.siteName,
    path: PUBLIC_PAGE_PATHS.privacy,
  });
}

/**
 * Privacy.
 *
 * Written against what the code actually does rather than against a template.
 * That is why it says infrastructure providers *may* process technical
 * information — GTAI is hosted, and claiming otherwise would be false — and
 * why it does not claim certification under any regulation, which nobody has
 * assessed. It also explains the absence of a cookie banner rather than adding
 * one for appearances: GTAI sets no non-essential cookie, and a consent
 * banner for consent that is not needed is theatre.
 */
export default async function PrivacyPage({ params }: PageProps) {
  const { locale } = await params;
  const dictionary = await getDictionary(resolveContentLocale(locale));
  const { publicPages } = dictionary;

  return (
    <PublicPageShell
      locale={locale}
      dictionary={dictionary}
      title={publicPages.privacy.title}
      intro={publicPages.privacy.intro}
      showLastUpdated
      showCompanyDetails
    >
      {publicPages.privacy.sections.map((section) => (
        <PublicSection
          key={section.heading}
          heading={section.heading}
          body={section.body}
        />
      ))}
    </PublicPageShell>
  );
}
