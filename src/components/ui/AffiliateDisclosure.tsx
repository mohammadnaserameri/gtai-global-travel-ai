import { cn } from "@/lib/utilities/cn";
import { Badge } from "@/components/ui/Badge";
import { CoinsIcon, RouteIcon } from "@/components/ui/icons";

export interface AffiliateDisclosureLabels {
  label: string;
  short: string;
  title: string;
  points: readonly string[];
  notice: string;
}

interface AffiliateDisclosureProps {
  labels: AffiliateDisclosureLabels;
  /**
   * `inline` — one clear sentence, for use next to a search surface.
   * `banner` — the full explanation, used in the footer and on the homepage.
   */
  variant?: "inline" | "banner";
  className?: string;
}

/**
 * GTAI's affiliate model, stated plainly.
 *
 * The wording is deliberately conservative. It says GTAI *may* redirect and
 * *may* earn a commission, never that providers are connected, that prices are
 * live, that GTAI guarantees a partner price, or that GTAI is the merchant of
 * record — none of which is true.
 */
export function AffiliateDisclosure({
  labels,
  variant = "inline",
  className,
}: AffiliateDisclosureProps) {
  if (variant === "inline") {
    return (
      <p
        className={cn(
          "text-foreground-muted flex items-start gap-2.5 text-xs leading-relaxed",
          className,
        )}
      >
        <span aria-hidden="true" className="text-brand-600 mt-px shrink-0">
          <CoinsIcon size={16} />
        </span>
        <span>
          <span className="text-foreground-secondary font-semibold">
            {labels.label}:
          </span>{" "}
          {labels.short}
        </span>
      </p>
    );
  }

  return (
    <section
      aria-label={labels.label}
      className={cn(
        "border-brand-150 from-brand-25 to-accent-100 rounded-2xl border bg-linear-to-br p-5 sm:p-7",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span
          aria-hidden="true"
          className="bg-surface text-brand-700 inline-flex size-10 items-center justify-center rounded-xl shadow-xs"
        >
          <RouteIcon size={20} />
        </span>
        <h2 className="text-foreground text-lg font-semibold">{labels.title}</h2>
        <Badge tone="brand">{labels.label}</Badge>
      </div>

      <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
        {labels.points.map((point) => (
          <li
            key={point}
            className="text-foreground-secondary flex items-start gap-2.5 text-sm leading-relaxed"
          >
            <span
              aria-hidden="true"
              className="bg-brand-500 mt-2 size-1.5 shrink-0 rounded-full"
            />
            {point}
          </li>
        ))}
      </ul>

      <p className="border-brand-150 text-foreground-muted mt-4 border-t pt-4 text-xs leading-relaxed">
        {labels.notice}
      </p>
    </section>
  );
}
