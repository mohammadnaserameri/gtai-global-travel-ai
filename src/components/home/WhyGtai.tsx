import type { Dictionary } from "@/i18n/get-dictionary";
import { Container } from "@/components/layout/Container";
import { SectionHeading } from "@/components/layout/SectionHeading";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import {
  CompassIcon,
  GlobeIcon,
  LayersIcon,
  PinIcon,
  RouteIcon,
  ShieldIcon,
  SparkIcon,
  TravelersIcon,
} from "@/components/ui/icons";

interface WhyGtaiProps {
  dictionary: Dictionary;
}

const icons = [
  <GlobeIcon key="global" size={20} />,
  <SparkIcon key="guided" size={20} />,
  <RouteIcon key="affiliate" size={20} />,
  <ShieldIcon key="risk" size={20} />,
  <TravelersIcon key="preferences" size={20} />,
  <LayersIcon key="providers" size={20} />,
  <CompassIcon key="multilingual" size={20} />,
  <PinIcon key="support" size={20} />,
];

/**
 * Differentiation grid.
 *
 * Every item states whether it exists today or is planned. Two of the eight are
 * genuinely in this release (the transparent affiliate model and the
 * multilingual foundation); the rest are labelled "Planned" rather than
 * described as if they already worked.
 */
export function WhyGtai({ dictionary }: WhyGtaiProps) {
  const { why } = dictionary;

  return (
    <section aria-labelledby="gtai-why-heading" className="py-16 lg:py-24">
      <Container>
        <SectionHeading
          id="gtai-why-heading"
          eyebrow={why.eyebrow}
          title={why.title}
          description={why.description}
        />

        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {why.items.map((item, index) => {
            const planned = item.status !== "active";
            return (
              <Card
                key={item.title}
                as="li"
                variant="plain"
                padding="md"
                interactive
                className="flex h-full flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <span
                    aria-hidden="true"
                    className="border-brand-150 bg-brand-25 text-brand-700 inline-flex size-10 shrink-0 items-center justify-center rounded-lg border"
                  >
                    {icons[index % icons.length]}
                  </span>
                  <Badge tone={planned ? "neutral" : "success"} size="sm">
                    {planned ? why.statusLabels.planned : why.statusLabels.active}
                  </Badge>
                </div>
                <h3 className="text-foreground text-sm font-semibold">
                  {item.title}
                </h3>
                <p className="text-foreground-muted text-sm leading-relaxed">
                  {item.description}
                </p>
              </Card>
            );
          })}
        </ul>
      </Container>
    </section>
  );
}
