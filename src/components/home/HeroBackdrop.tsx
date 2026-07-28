/**
 * Ambient hero decoration.
 *
 * Deliberately background-level: it sits behind the content on a negative
 * z-index, is `pointer-events: none`, carries no text and is hidden from
 * assistive technology. The route artwork only renders from `lg` up, so small
 * screens pay nothing for it and the search surface stays the focal point.
 */
export function HeroBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
      <div className="gtai-aurora" />

      <svg
        viewBox="0 0 520 380"
        fill="none"
        preserveAspectRatio="xMaxYMid slice"
        className="absolute inset-y-0 end-0 hidden w-1/2 max-w-2xl opacity-[0.18] lg:block"
      >
        <defs>
          <linearGradient id="gtai-hero-route" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--brand-700)" />
            <stop offset="60%" stopColor="var(--brand-400)" />
            <stop offset="100%" stopColor="var(--accent-600)" />
          </linearGradient>
        </defs>

        {/* Meridian arcs, read as a globe edge without drawing a literal globe */}
        <circle
          cx="392"
          cy="150"
          r="128"
          stroke="var(--brand-500)"
          strokeWidth="1.2"
        />
        <ellipse
          cx="392"
          cy="150"
          rx="56"
          ry="128"
          stroke="var(--brand-500)"
          strokeWidth="1.2"
        />
        <path
          d="M266 132c78 26 174 26 252 0"
          stroke="var(--brand-500)"
          strokeWidth="1.2"
        />

        {/* Travel path across the field */}
        <path
          d="M40 316C150 250 268 176 470 92"
          stroke="url(#gtai-hero-route)"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <circle cx="40" cy="316" r="6" fill="var(--brand-700)" />
        <circle cx="470" cy="92" r="7" fill="var(--accent-600)" />
      </svg>
    </div>
  );
}
