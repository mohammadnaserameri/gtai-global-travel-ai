import type { TravelImageAsset } from "@/features/travel-images/travel-image-types";
import type { Dictionary } from "@/i18n/get-dictionary";
import { Container } from "@/components/layout/Container";
import { SectionHeading } from "@/components/layout/SectionHeading";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { PinIcon } from "@/components/ui/icons";
import { DestinationCardImage } from "@/components/travel-images/DestinationCardImage";

interface PopularDestinationsProps {
  dictionary: Dictionary;
  images: readonly TravelImageAsset[];
}

export function PopularDestinations({
  dictionary,
  images,
}: PopularDestinationsProps) {
  const { destinations } = dictionary;

  return (
    <section aria-labelledby="gtai-destinations-heading" className="py-14 lg:py-20">
      <Container>
        <SectionHeading
          id="gtai-destinations-heading"
          eyebrow={destinations.eyebrow}
          title={destinations.title}
          description={destinations.description}
          aside={<Badge tone="neutral">{destinations.staticNotice}</Badge>}
        />

        <ul className="mt-10 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {destinations.items.map((item, index) => {
            const image = images[index];
            return (
              <Card
                key={`${item.city}-${item.country}`}
                as="li"
                variant="plain"
                padding="none"
                interactive
                className="group overflow-hidden"
              >
                {image ? (
                  <DestinationCardImage
                    asset={image}
                    alt={`${item.city}, ${item.country}`}
                  />
                ) : null}

                <div className="p-3.5 sm:p-4">
                  <p className="text-foreground flex items-center gap-1.5 text-sm font-semibold">
                    <span aria-hidden="true" className="text-brand-600 shrink-0">
                      <PinIcon size={14} />
                    </span>
                    <span className="truncate">{item.city}</span>
                  </p>
                  <p className="text-foreground-muted mt-0.5 truncate text-xs">
                    {item.country}
                  </p>
                  <p className="text-foreground-secondary mt-2 text-xs leading-snug">
                    {item.note}
                  </p>
                </div>
              </Card>
            );
          })}
        </ul>
      </Container>
    </section>
  );
}
