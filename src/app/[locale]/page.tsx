import type { Metadata } from "next";

import { getDirection } from "@/config/locales";
import { getDictionary } from "@/i18n/get-dictionary";
import { Container } from "@/components/layout/Container";
import { Hero } from "@/components/home/Hero";
import { GuidedAiPanel } from "@/components/home/GuidedAiPanel";
import { PopularDestinations } from "@/components/home/PopularDestinations";
import { ExploreSection } from "@/components/home/ExploreSection";
import { WhyGtai } from "@/components/home/WhyGtai";
import { TrustSection } from "@/components/home/TrustSection";
import { AffiliateDisclosure } from "@/components/ui/AffiliateDisclosure";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const dictionary = await getDictionary(locale);
  return {
    title: dictionary.meta.home.title,
    description: dictionary.meta.home.description,
  };
}

export default async function HomePage({ params }: PageProps) {
  const { locale } = await params;
  const dictionary = await getDictionary(locale);
  const dir = getDirection(locale);

  return (
    <>
      <Hero dictionary={dictionary} dir={dir} />
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
