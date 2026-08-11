import type { Metadata } from "next";

import { getDirection, resolveContentLocale } from "@/config/locales";
import { getDictionary } from "@/i18n/get-dictionary";
import { buildPublicMetadata } from "@/lib/seo/public-metadata";
import { PRODUCT_PAGE_PATHS } from "@/config/public-company-profile";
import { Container } from "@/components/layout/Container";
import { SectionHeading } from "@/components/layout/SectionHeading";
import { Badge } from "@/components/ui/Badge";
import { ViatorExploreExperience } from "@/components/explore/ViatorExploreExperience";
import { resolveTravelImage } from "@/server/travel-images/travel-image-engine";
import { ProductImage } from "@/components/travel-images/ProductImage";
import { getViatorAffiliateMetadata } from "@/server/affiliate/viator/viator-config";
import {
  getViatorDestinations,
  getViatorTags,
} from "@/server/affiliate/viator/viator-adapter";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const { meta } = await getDictionary(resolveContentLocale(locale));
  return buildPublicMetadata({
    locale,
    title: meta.explore.title,
    description: meta.explore.description,
    siteName: meta.siteName,
    path: PRODUCT_PAGE_PATHS.explore,
    // Public and honest, but not a page worth returning for a search:
    // this route describes a capability GTAI has not built yet.
    indexable: false,
  });
}

export default async function ExplorePage({ params }: PageProps) {
  const { locale } = await params;
  const dictionary = await getDictionary(resolveContentLocale(locale));
  const image = await resolveTravelImage({
    category: "explore",
    destination: "Global",
  });
  const metadata = getViatorAffiliateMetadata();
  let destinations = [] as Awaited<ReturnType<typeof getViatorDestinations>>;
  let tags = [] as Awaited<ReturnType<typeof getViatorTags>>;
  let bootstrapFailed = false;
  if (metadata.active) {
    try {
      [destinations, tags] = await Promise.all([
        getViatorDestinations(locale),
        getViatorTags(locale),
      ]);
    } catch {
      bootstrapFailed = true;
    }
  }

  return (
    <main dir={getDirection(resolveContentLocale(locale))}>
      <section className="border-border/70 from-brand-25 to-background relative border-b bg-linear-to-b">
        <Container className="py-12 lg:py-16">
          <SectionHeading
            as="h1"
            eyebrow={dictionary.viatorExplore.eyebrow}
            title={dictionary.viatorExplore.title}
            description={dictionary.viatorExplore.description}
            aside={
              metadata.active ? (
                <Badge tone="success">{dictionary.viatorExplore.liveBadge}</Badge>
              ) : undefined
            }
          />
          <ProductImage
            asset={image}
            alt={dictionary.viatorExplore.title}
            className="mt-8"
          />
        </Container>
      </section>
      <section className="py-12 lg:py-16">
        <Container>
          <ViatorExploreExperience
            dictionary={dictionary}
            locale={locale}
            active={metadata.active}
            destinations={destinations}
            tags={tags}
            bootstrapFailed={bootstrapFailed}
          />
        </Container>
      </section>
    </main>
  );
}

export const dynamic = "force-dynamic";
