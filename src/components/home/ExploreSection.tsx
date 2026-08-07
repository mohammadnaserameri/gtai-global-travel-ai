import type { TravelImageAsset } from "@/features/travel-images/travel-image-types";
import type { Dictionary } from "@/i18n/get-dictionary";
import { localePath } from "@/i18n/routing";
import { Container } from "@/components/layout/Container";
import { SectionHeading } from "@/components/layout/SectionHeading";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ProductImage } from "@/components/travel-images/ProductImage";
import {
  ArrowRightIcon,
  CoinsIcon,
  CalendarIcon,
  CompassIcon,
  RouteIcon,
} from "@/components/ui/icons";

interface ExploreSectionProps {
  locale: string;
  dictionary: Dictionary;
  image: TravelImageAsset;
}

const icons = [
  <CoinsIcon key="budget" size={20} />,
  <CalendarIcon key="flexibility" size={20} />,
  <CompassIcon key="interest" size={20} />,
  <RouteIcon key="reach" size={20} />,
];

export function ExploreSection({ locale, dictionary, image }: ExploreSectionProps) {
  const { exploreSection, common } = dictionary;

  return (
    <section
      aria-labelledby="gtai-explore-heading"
      className="border-border bg-background-muted border-y py-14 lg:py-20"
    >
      <Container>
        <SectionHeading
          id="gtai-explore-heading"
          eyebrow={exploreSection.eyebrow}
          title={exploreSection.title}
          description={exploreSection.description}
          aside={<Badge tone="future">{common.futureBadge}</Badge>}
        />

        <ProductImage asset={image} alt={exploreSection.title} className="mt-8" />

        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {exploreSection.items.map((item, index) => (
            <Card
              key={item.title}
              as="li"
              variant="plain"
              padding="md"
              interactive
              className="flex h-full flex-col gap-3"
            >
              <span
                aria-hidden="true"
                className="border-brand-150 bg-brand-25 text-brand-700 inline-flex size-10 items-center justify-center rounded-lg border"
              >
                {icons[index % icons.length]}
              </span>
              <h3 className="text-foreground text-sm font-semibold">
                {item.title}
              </h3>
              <p className="text-foreground-muted text-sm leading-relaxed">
                {item.description}
              </p>
            </Card>
          ))}
        </ul>

        <div className="mt-8">
          <ButtonLink
            href={localePath(locale, "/explore")}
            variant="secondary"
            size="lg"
          >
            <CompassIcon size={18} />
            {exploreSection.cta}
            <ArrowRightIcon size={18} className="rtl:-scale-x-100" />
          </ButtonLink>
        </div>
      </Container>
    </section>
  );
}
