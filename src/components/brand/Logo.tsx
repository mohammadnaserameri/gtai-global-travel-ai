import Link from "next/link";

import { brand } from "@/config/brand";
import { cn } from "@/lib/utilities/cn";

export type LogoSize = "sm" | "md" | "lg";

interface LogoProps {
  /** Renders the "Global Travel AI" line beneath the wordmark. */
  showSubtitle?: boolean;
  size?: LogoSize;
  /** When set, the logo becomes a link to the locale home page. */
  href?: string;
  /** Accessible name used when the logo is a link. */
  homeLabel?: string;
  /** Inverts the wordmark for use on deep surfaces. */
  inverse?: boolean;
  className?: string;
}

const markSizes: Record<LogoSize, string> = {
  sm: "size-7",
  md: "size-8",
  lg: "size-11",
};

const wordSizes: Record<LogoSize, string> = {
  sm: "text-lg",
  md: "text-xl",
  lg: "text-3xl",
};

/**
 * Temporary GTAI logo.
 *
 * The mark is original geometry: a globe meridian crossed by a rising travel
 * path, with a single node marking a destination. It is a placeholder for the
 * eventual registered brand identity — not a final trademark — and it copies no
 * airline, metasearch or technology company symbol.
 */
function LogoMark({ size = "md" }: { size?: LogoSize }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-[0.65rem]",
        "from-brand-500 via-brand-700 to-brand-900 shadow-brand bg-linear-to-br",
        markSizes[size],
      )}
    >
      <svg
        viewBox="0 0 32 32"
        fill="none"
        className="size-[72%]"
        role="presentation"
      >
        {/* Globe body */}
        <circle
          cx="16"
          cy="16"
          r="10.5"
          stroke="white"
          strokeOpacity="0.55"
          strokeWidth="1.7"
        />
        {/* Single meridian, flattened to read as a rotating sphere */}
        <ellipse
          cx="16"
          cy="16"
          rx="4.6"
          ry="10.5"
          stroke="white"
          strokeOpacity="0.4"
          strokeWidth="1.5"
        />
        {/* Travel path rising across the globe */}
        <path
          d="M5.5 22.5C11 20.2 17.4 15.4 25.5 8.5"
          stroke="white"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        {/* Destination node */}
        <circle cx="25.2" cy="8.8" r="3" fill="white" />
      </svg>
    </span>
  );
}

export function Logo({
  showSubtitle = false,
  size = "md",
  href,
  homeLabel,
  inverse = false,
  className,
}: LogoProps) {
  const content = (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark size={size} />
      <span className="flex min-w-0 flex-col leading-none">
        <span
          className={cn(
            "font-semibold tracking-tight",
            wordSizes[size],
            inverse ? "text-white" : "text-brand-ink-strong",
          )}
        >
          {brand.name}
        </span>
        {showSubtitle ? (
          <span
            className={cn(
              "mt-1 text-[0.6875rem] font-medium tracking-[0.12em] uppercase",
              inverse ? "text-white/70" : "text-foreground-muted",
            )}
          >
            {brand.fullName}
          </span>
        ) : null}
      </span>
    </span>
  );

  if (!href) return content;

  return (
    <Link
      href={href}
      aria-label={homeLabel ?? `${brand.name} — ${brand.fullName}`}
      className="focus-visible:outline-focus-ring inline-flex min-h-11 items-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4"
    >
      {content}
    </Link>
  );
}
