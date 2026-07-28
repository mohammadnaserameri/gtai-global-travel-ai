import type { Dictionary } from "@/i18n/get-dictionary";
import { Container } from "@/components/layout/Container";
import { LayersIcon, RouteIcon, ShieldIcon } from "@/components/ui/icons";

interface ReassuranceStripProps {
  dictionary: Dictionary;
}

const icons = [
  <LayersIcon key="providers" size={18} />,
  <ShieldIcon key="transparency" size={18} />,
  <RouteIcon key="tradeoff" size={18} />,
];

/**
 * A single quiet row directly under the search surface.
 *
 * It answers "why compare here" in three short lines, which is what the old
 * hero benefit cards were doing above the fold. Moving them below the search
 * shell keeps the answer available without pushing the search controls off
 * screen. Deliberately a plain row, not a card grid — this page already has
 * enough cards further down.
 */
export function ReassuranceStrip({ dictionary }: ReassuranceStripProps) {
  const { reassurance } = dictionary;

  return (
    <section
      aria-labelledby="gtai-reassurance-heading"
      className="border-border bg-surface border-b"
    >
      <Container className="py-6 lg:py-8">
        <h2 id="gtai-reassurance-heading" className="sr-only">
          {reassurance.label}
        </h2>
        <ul className="grid gap-5 sm:grid-cols-3 sm:gap-8">
          {reassurance.items.map((item, index) => (
            <li key={item.title} className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="border-brand-150 bg-brand-25 text-brand-700 mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-lg border"
              >
                {icons[index % icons.length]}
              </span>
              <div className="min-w-0">
                <p className="text-foreground text-sm font-semibold">
                  {item.title}
                </p>
                <p className="text-foreground-muted mt-0.5 text-xs leading-relaxed">
                  {item.description}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
