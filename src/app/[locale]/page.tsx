import type { Metadata } from "next";

import { getDirection, resolveContentLocale } from "@/config/locales";
import { getDictionary } from "@/i18n/get-dictionary";
import { buildPublicMetadata } from "@/lib/seo/public-metadata";
import { Container } from "@/components/layout/Container";
import { Hero } from "@/components/home/Hero";
import { ReassuranceStrip } from "@/components/home/ReassuranceStrip";
import { GuidedAiPanel } from "@/components/home/GuidedAiPanel";
import { PopularDestinations } from "@/components/home/PopularDestinations";
import { ExploreSection } from "@/components/home/ExploreSection";
import { WhyGtai } from "@/components/home/WhyGtai";
import { TrustSection } from "@/components/home/TrustSection";
import { AffiliateDisclosure } from "@/components/ui/AffiliateDisclosure";
import { DemonstrationDataNotice } from "@/components/ui/DemonstrationDataNotice";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const dictionary = await getDictionary(resolveContentLocale(locale));
  // The homepage uses the same helper the five public pages use, so it gets a
  // canonical, language alternates, Open Graph and the authored/unauthored
  // indexing policy from one place rather than a second implementation.
  return buildPublicMetadata({
    locale,
    title: dictionary.meta.home.title,
    description: dictionary.meta.home.description,
    siteName: dictionary.meta.siteName,
    path: "/",
  });
}

export default async function HomePage({ params }: PageProps) {
  const { locale } = await params;
  // Content language for the dictionary and direction; the requested locale
  // stays in `locale` for routing and the search form's own links.
  const contentLocale = resolveContentLocale(locale);
  const dictionary = await getDictionary(contentLocale);
  const dir = getDirection(contentLocale);

  return (
    <>
      {/* Order is deliberate: search first, then one line of reassurance, then
          the AI differentiator, then discovery, then the supporting sections.
          A traveller reaches the search controls without scrolling. */}
      <Hero dictionary={dictionary} dir={dir} locale={locale} />

      {/* Directly under the search surface, before any reassurance copy. A
          visitor who is about to run a search should know what the results
          will be before they read anything about why GTAI is worth using. */}
      <section className="pt-2">
        <Container>
          <DemonstrationDataNotice
            labels={dictionary.demonstrationNotice}
            variant="standard"
          />
        </Container>
      </section>

      <ReassuranceStrip dictionary={dictionary} />

      {/* The restrained integration status: no company named, no endpoint, no
          registry detail, no commercial process. */}
      <section className="pb-2">
        <Container>
          <div className="border-border bg-background-muted rounded-xl border p-4 sm:p-5">
            <h2 className="text-foreground text-sm font-semibold">
              {dictionary.partnerStatus.homeTitle}
            </h2>
            <p className="text-foreground-secondary mt-1.5 text-sm leading-relaxed">
              {dictionary.partnerStatus.homeDescription}
            </p>
          </div>
        </Container>
      </section>

      <GuidedAiPanel locale={locale} dictionary={dictionary} />
      <PopularDestinations dictionary={dictionary} />
      <ExploreSection locale={locale} dictionary={dictionary} />
      <WhyGtai dictionary={dictionary} />
      <TrustSection dictionary={dictionary} />

      <section className="py-14 lg:py-20">
        <Container>
          <AffiliateDisclosure variant="banner" labels={dictionary.affiliate} />
        </Container>
      </section>
    </>
  );
}
