import type { ReactNode } from "react";

import { cn } from "@/lib/utilities/cn";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";

interface AgentPreviewCardProps {
  name: string;
  description: string;
  /** Text of the "upcoming" marker. Always rendered — never colour alone. */
  badge: string;
  icon?: ReactNode;
  className?: string;
}

/**
 * A single future GTAI agent.
 *
 * Every card carries a visible "upcoming" badge. None of these agents exist:
 * there is no agent runtime, no model provider and no AI SDK in the project.
 */
export function AgentPreviewCard({
  name,
  description,
  badge,
  icon,
  className,
}: AgentPreviewCardProps) {
  return (
    <Card
      as="li"
      variant="plain"
      padding="md"
      interactive
      className={cn("flex h-full flex-col gap-3", className)}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          aria-hidden="true"
          className="border-brand-150 bg-brand-25 text-brand-700 inline-flex size-10 shrink-0 items-center justify-center rounded-lg border"
        >
          {icon}
        </span>
        <Badge tone="future" size="sm">
          {badge}
        </Badge>
      </div>
      <div>
        <h3 className="text-foreground text-sm font-semibold">{name}</h3>
        <p className="text-foreground-muted mt-1.5 text-sm leading-relaxed">
          {description}
        </p>
      </div>
    </Card>
  );
}
