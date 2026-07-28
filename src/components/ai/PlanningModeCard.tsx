import { cn } from "@/lib/utilities/cn";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { CheckIcon } from "@/components/ui/icons";

interface PlanningModeCardProps {
  name: string;
  /** Approximate question count, e.g. "About 8–12 questions". */
  scale: string;
  /** Rough time commitment. */
  duration: string;
  description: string;
  points: readonly string[];
  /** Visually promotes the middle option without implying it is available. */
  featured?: boolean;
  previewBadge: string;
  className?: string;
}

/**
 * One of the three future planning depths (Quick Match, Smart Match, Perfect
 * Trip Profile). Presentational only — selecting a mode does nothing, because
 * the interview engine does not exist yet.
 */
export function PlanningModeCard({
  name,
  scale,
  duration,
  description,
  points,
  featured = false,
  previewBadge,
  className,
}: PlanningModeCardProps) {
  return (
    <Card
      as="li"
      variant={featured ? "accent" : "plain"}
      padding="lg"
      className={cn(
        "flex h-full flex-col gap-4",
        featured && "border-brand-300 shadow-md",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-foreground text-lg font-semibold">{name}</h3>
        <Badge tone={featured ? "brand" : "neutral"} size="sm">
          {previewBadge}
        </Badge>
      </div>

      <div className="text-brand-ink flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium">
        <span className="gtai-ltr-numerals">{scale}</span>
        <span aria-hidden="true" className="text-border-strong">
          |
        </span>
        <span>{duration}</span>
      </div>

      <p className="text-foreground-secondary text-sm leading-relaxed">
        {description}
      </p>

      <ul className="border-border mt-auto flex flex-col gap-2 border-t pt-4">
        {points.map((point) => (
          <li
            key={point}
            className="text-foreground-muted flex items-start gap-2.5 text-sm"
          >
            <span aria-hidden="true" className="text-brand-600 mt-0.5 shrink-0">
              <CheckIcon size={16} />
            </span>
            {point}
          </li>
        ))}
      </ul>
    </Card>
  );
}
