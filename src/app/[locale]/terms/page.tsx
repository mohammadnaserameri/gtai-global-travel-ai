import type { Metadata } from "next";

import { resolveContentLocale } from "@/config/locales";
import { getDictionary } from "@/i18n/get-dictionary";
import { buildPublicMetadata } from "@/lib/seo/public-metadata";
import { PUBLIC_PAGE_PATHS } from "@/config/public-company-profile";
import {
  PublicPageShell,
  PublicSection,
} from "@/components/layout/PublicPageShell";
import { DemonstrationDataNotice } from "@/components/ui/DemonstrationDataNotice";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const { meta } = await getDictionary(resolveContentLocale(locale));
  return buildPublicMetadata({
    locale,
    title: meta.terms.title,
    description: meta.terms.description,
    siteName: meta.siteName,
    path: PUBLIC_PAGE_PATHS.terms,
  });
}

export default async function TermsPage({ params }: PageProps) {
  const { locale } = await params;
  const dictionary = await getDictionary(resolveContentLocale(locale));
  const { publicPages, demonstrationNotice } = dictionary;

  return (
    <PublicPageShell
      locale={locale}
      dictionary={dictionary}
      title={publicPages.terms.title}
      intro={publicPages.terms.intro}
      showLastUpdated
      showCompanyDetails
    >
      {/* The single most important term on this page is that the content is
          fictional, so it is stated in the shared notice before the prose
          rather than only inside a numbered clause. */}
      <DemonstrationDataNotice
        labels={demonstrationNotice}
        variant="prominent"
        className="mb-8"
      />

      {publicPages.terms.sections.map((section) => (
        <PublicSection
          key={section.heading}
          heading={section.heading}
          body={section.body}
        />
      ))}
    </PublicPageShell>
  );
}
