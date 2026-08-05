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
    title: meta.about.title,
    description: meta.about.description,
    siteName: meta.siteName,
    path: PUBLIC_PAGE_PATHS.about,
  });
}

export default async function AboutPage({ params }: PageProps) {
  const { locale } = await params;
  const dictionary = await getDictionary(resolveContentLocale(locale));
  const { publicPages, demonstrationNotice, partnerStatus } = dictionary;

  return (
    <PublicPageShell
      locale={locale}
      dictionary={dictionary}
      title={publicPages.about.title}
      intro={publicPages.about.intro}
      showCompanyDetails
    >
      {/* The disclosure sits above the prose rather than below it: a reader who
          stops after the first screen should already know the flight data is
          not real. */}
      <DemonstrationDataNotice
        labels={demonstrationNotice}
        variant="standard"
        className="mb-8"
      />

      {publicPages.about.sections.map((section) => (
        <PublicSection
          key={section.heading}
          heading={section.heading}
          body={section.body}
        />
      ))}

      {/* The partner-integration status. It names no company, describes no
          endpoint and reveals nothing about registry internals or any
          commercial process — it states only what a reader needs in order to
          understand why results are demonstration data. */}
      <section className="border-border bg-surface mt-10 rounded-xl border p-5 sm:p-6">
        <p className="text-brand-ink text-xs font-semibold tracking-[0.12em] uppercase">
          {partnerStatus.eyebrow}
        </p>
        <h2 className="text-foreground mt-2 text-lg font-semibold">
          {partnerStatus.title}
        </h2>
        <p className="text-foreground-secondary mt-3 text-sm leading-relaxed">
          {partnerStatus.description}
        </p>
        <ul className="text-foreground-secondary mt-3 flex list-disc flex-col gap-2 ps-5 text-sm leading-relaxed">
          {partnerStatus.points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      </section>
    </PublicPageShell>
  );
}
