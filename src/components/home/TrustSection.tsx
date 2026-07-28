import type { Dictionary } from "@/i18n/get-dictionary";
import { Container } from "@/components/layout/Container";
import { SectionHeading } from "@/components/layout/SectionHeading";
import { CheckIcon } from "@/components/ui/icons";

interface TrustSectionProps {
  dictionary: Dictionary;
}

/**
 * Trust and transparency principles.
 *
 * Written as engineering commitments, not marketing guarantees: nothing here
 * claims an outcome GTAI cannot control, such as always having the lowest price
 * or every provider being connected.
 */
export function TrustSection({ dictionary }: TrustSectionProps) {
  const { trust } = dictionary;

  return (
    <section
      aria-labelledby="gtai-trust-heading"
      className="border-border from-background to-brand-25 border-t bg-linear-to-b py-16 lg:py-24"
    >
      <Container>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
          <SectionHeading
            id="gtai-trust-heading"
            eyebrow={trust.eyebrow}
            title={trust.title}
            description={trust.description}
          />

          <ul className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
            {trust.items.map((item) => (
              <li key={item.title} className="flex gap-3">
                <span
                  aria-hidden="true"
                  className="bg-brand-100 text-brand-800 mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full"
                >
                  <CheckIcon size={14} />
                </span>
                <div className="min-w-0">
                  <h3 className="text-foreground text-sm font-semibold">
                    {item.title}
                  </h3>
                  <p className="text-foreground-muted mt-1 text-sm leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </section>
  );
}
