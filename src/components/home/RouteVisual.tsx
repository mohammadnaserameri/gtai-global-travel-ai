import type { Dictionary } from "@/i18n/get-dictionary";
import { Badge } from "@/components/ui/Badge";

interface RouteVisualProps {
  labels: Dictionary["hero"]["visual"];
}

/**
 * Abstract hero artwork.
 *
 * Original SVG geometry — an arc between two nodes over a stylised horizon —
 * layered under a glass panel. It carries no real route, no real price and no
 * provider branding, and it is announced to assistive technology as an
 * illustration so nobody mistakes it for live data.
 */
export function RouteVisual({ labels }: RouteVisualProps) {
  return (
    <figure
      className="relative mx-auto w-full max-w-md lg:max-w-none"
      aria-label={labels.label}
    >
      <div className="gtai-surface-glass relative overflow-hidden rounded-2xl border border-white/70 p-5 shadow-xl sm:p-6">
        {/* Soft brand wash behind the artwork */}
        <div
          aria-hidden="true"
          className="from-brand-100/45 to-accent-200/50 absolute inset-0 bg-linear-to-br via-transparent"
        />

        <div className="relative">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="brand" size="sm">
              {labels.chipBest}
            </Badge>
            <Badge tone="neutral" size="sm">
              {labels.chipCheapest}
            </Badge>
            <Badge tone="neutral" size="sm">
              {labels.chipFastest}
            </Badge>
          </div>

          <svg
            viewBox="0 0 360 220"
            role="img"
            aria-label={labels.label}
            className="mt-4 w-full"
          >
            <defs>
              <linearGradient id="gtai-route" x1="0" y1="1" x2="1" y2="0">
                <stop offset="0%" stopColor="var(--brand-700)" />
                <stop offset="55%" stopColor="var(--brand-400)" />
                <stop offset="100%" stopColor="var(--accent-600)" />
              </linearGradient>
              <linearGradient id="gtai-horizon" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--brand-300)" stopOpacity="0.5" />
                <stop offset="100%" stopColor="var(--brand-300)" stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* Stylised horizon */}
            <path
              d="M0 176c62-26 110-34 180-34s118 8 180 34v44H0Z"
              fill="url(#gtai-horizon)"
            />
            <path
              d="M0 176c62-26 110-34 180-34s118 8 180 34"
              stroke="var(--brand-300)"
              strokeWidth="1.4"
              fill="none"
              opacity="0.7"
            />

            {/* Latitude guides */}
            {[196, 208].map((y) => (
              <path
                key={y}
                d={`M0 ${y}c62-18 110-24 180-24s118 6 180 24`}
                stroke="var(--brand-250)"
                strokeWidth="1"
                fill="none"
                opacity="0.55"
              />
            ))}

            {/* Route arc */}
            <path
              d="M46 158C110 44 250 34 314 62"
              stroke="url(#gtai-route)"
              strokeWidth="3"
              strokeLinecap="round"
              fill="none"
              strokeDasharray="1 0"
            />

            {/* Origin node */}
            <circle cx="46" cy="158" r="9" fill="var(--surface)" />
            <circle
              cx="46"
              cy="158"
              r="9"
              stroke="var(--brand-700)"
              strokeWidth="2.5"
              fill="none"
            />
            <circle cx="46" cy="158" r="3" fill="var(--brand-700)" />

            {/* Destination node */}
            <circle cx="314" cy="62" r="11" fill="var(--surface)" />
            <circle
              cx="314"
              cy="62"
              r="11"
              stroke="var(--accent-600)"
              strokeWidth="2.5"
              fill="none"
            />
            <circle cx="314" cy="62" r="4" fill="var(--accent-600)" />

            {/* Waypoint marker on the arc */}
            <g className="gtai-float">
              <circle cx="186" cy="66" r="5.5" fill="var(--brand-400)" />
              <circle
                cx="186"
                cy="66"
                r="11"
                stroke="var(--brand-400)"
                strokeWidth="1.2"
                fill="none"
                opacity="0.5"
              />
            </g>

            {/* Route endpoints as neutral codes, not a real itinerary */}
            <text
              x="46"
              y="186"
              textAnchor="middle"
              className="fill-[var(--brand-ink-strong)] text-[15px] font-semibold"
              style={{ direction: "ltr" }}
            >
              {labels.routeFrom}
            </text>
            <text
              x="314"
              y="40"
              textAnchor="middle"
              className="fill-[var(--accent-800)] text-[15px] font-semibold"
              style={{ direction: "ltr" }}
            >
              {labels.routeTo}
            </text>
          </svg>
        </div>
      </div>

      <figcaption className="text-foreground-muted mt-3 text-center text-xs">
        {labels.routeCaption}
      </figcaption>
    </figure>
  );
}
