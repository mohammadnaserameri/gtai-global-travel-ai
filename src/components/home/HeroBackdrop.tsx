import type { TravelImageAsset } from "@/features/travel-images/travel-image-types";
import { TravelHeroImage } from "@/components/travel-images/TravelHeroImage";

interface HeroBackdropProps {
  image: TravelImageAsset;
}

/** Responsive travel photography with the existing lightweight route motif. */
export function HeroBackdrop({ image }: HeroBackdropProps) {
  return (
    <div className="absolute inset-0 z-0 overflow-hidden">
      <TravelHeroImage asset={image} />

      <svg
        aria-hidden="true"
        viewBox="0 0 520 380"
        fill="none"
        preserveAspectRatio="xMaxYMid slice"
        className="pointer-events-none absolute inset-y-0 end-0 hidden w-1/2 max-w-2xl opacity-[0.18] lg:block"
      >
        <defs>
          <linearGradient id="gtai-hero-route" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--brand-700)" />
            <stop offset="60%" stopColor="var(--brand-400)" />
            <stop offset="100%" stopColor="var(--accent-600)" />
          </linearGradient>
        </defs>
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
