import type { Dictionary } from "@/i18n/get-dictionary";
import { cn } from "@/lib/utilities/cn";
import { Container } from "@/components/layout/Container";
import { SectionHeading } from "@/components/layout/SectionHeading";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { PinIcon } from "@/components/ui/icons";

interface PopularDestinationsProps {
  dictionary: Dictionary;
}

/**
 * Six abstract gradient treatments, cycled across the cards.
 *
 * V1 ships no destination photography: downloading third-party imagery would
 * mean shipping assets GTAI has no licence for. These CSS gradients are
 * generated locally and cost nothing to load.
 */
const treatments = [
  "from-brand-200 via-brand-400 to-brand-700",
  "from-accent-200 via-brand-300 to-brand-600",
  "from-brand-100 via-brand-250 to-accent-600",
  "from-brand-300 via-brand-500 to-brand-900",
  "from-accent-100 via-accent-400 to-brand-700",
  "from-brand-150 via-brand-400 to-accent-800",
];

export function PopularDestinations({ dictionary }: PopularDestinationsProps) {
  const { destinations } = dictionary;

  return (
    <section aria-labelledby="gtai-destinations-heading" className="py-16 lg:py-24">
      <Container>
        <SectionHeading
          id="gtai-destinations-heading"
          eyebrow={destinations.eyebrow}
          title={destinations.title}
          description={destinations.description}
          aside={<Badge tone="neutral">{destinations.staticNotice}</Badge>}
        />

        <ul className="mt-10 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {destinations.items.map((item, index) => (
            <Card
              key={`${item.city}-${item.country}`}
              as="li"
              variant="plain"
              padding="none"
              interactive
              className="overflow-hidden"
            >
              <div
                aria-hidden="true"
                className={cn(
                  "relative h-24 bg-linear-to-br sm:h-32",
                  treatments[index % treatments.length],
                )}
              >
                {/* A faint route mark keeps the tiles reading as travel, not
                    as decorative colour blocks. */}
                <svg
                  viewBox="0 0 200 100"
                  className="absolute inset-0 size-full opacity-40"
                  preserveAspectRatio="none"
                >
                  <path
                    d="M-10 82C40 42 96 34 210 12"
                    stroke="white"
                    strokeWidth="2"
                    fill="none"
                    strokeLinecap="round"
                  />
                  <circle cx="34" cy="63" r="4" fill="white" />
                  <circle cx="168" cy="19" r="5" fill="white" />
                </svg>
              </div>

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
          ))}
        </ul>
      </Container>
    </section>
  );
}
