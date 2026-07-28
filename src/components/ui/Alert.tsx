import type { ReactNode } from "react";

import { cn } from "@/lib/utilities/cn";
import { InfoIcon } from "@/components/ui/icons";

export type AlertTone = "info" | "success" | "warning" | "danger" | "brand";

const tones: Record<AlertTone, string> = {
  info: "bg-info-subtle border-info/25 text-info",
  success: "bg-success-subtle border-success/25 text-success",
  warning: "bg-warning-subtle border-warning/25 text-warning",
  danger: "bg-danger-subtle border-danger/25 text-danger",
  brand: "bg-brand-50 border-brand-150 text-brand-ink-strong",
};

interface AlertProps {
  tone?: AlertTone;
  /** Short heading. Carries the meaning so colour is never the only signal. */
  title?: string;
  icon?: ReactNode;
  /** Set for messages that appear as a result of a user action. */
  live?: boolean;
  className?: string;
  children: ReactNode;
}

export function Alert({
  tone = "info",
  title,
  icon,
  live = false,
  className,
  children,
}: AlertProps) {
  return (
    <div
      role={live ? "status" : "note"}
      aria-live={live ? "polite" : undefined}
      className={cn(
        "flex gap-3 rounded-lg border px-4 py-3 text-sm",
        tones[tone],
        className,
      )}
    >
      <span aria-hidden="true" className="mt-0.5 shrink-0">
        {icon ?? <InfoIcon size={18} />}
      </span>
      <div className="min-w-0">
        {title ? <p className="font-semibold">{title}</p> : null}
        <div className={cn("leading-relaxed", title && "mt-0.5")}>{children}</div>
      </div>
    </div>
  );
}
