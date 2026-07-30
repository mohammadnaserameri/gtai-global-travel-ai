import type { SVGProps } from "react";

/**
 * GTAI icon set.
 *
 * Every glyph below is original geometry drawn for this project on a 24×24
 * grid with a 1.6px stroke. Nothing is copied from a third-party icon library
 * or from any travel brand. Icons are always decorative: the surrounding
 * component supplies the accessible name.
 */

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 20, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 7h16M4 12h16M4 17h11" />
    </Icon>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Icon>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m6 9 6 6 6-6" />
    </Icon>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 12h15m-6-6 6 6-6 6" />
    </Icon>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m4.5 12.5 4.5 4.5L19.5 6.5" />
    </Icon>
  );
}

export function MinusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 12h14" />
    </Icon>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

/** Abstract flight path — a wing silhouette over a heading line. */
export function FlightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 13.2 20.5 4l-5.1 8.6 1.4 6.9-2.6-1.2-2.1-4.2-4.6 1.9-.7 2.7-1.7-3.6L3 13.2Z" />
    </Icon>
  );
}

/** Abstract stay — a roofline over a bed platform. */
export function StayIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 10.5 12 4l9 6.5" />
      <path d="M5 12v8m14-8v8M5 20h14" />
      <path d="M8.5 16h7v-2.2a1.8 1.8 0 0 0-1.8-1.8H10.3a1.8 1.8 0 0 0-1.8 1.8V16Z" />
    </Icon>
  );
}

/** Abstract car — a cabin profile over two wheels. */
export function CarIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 15.5h16M5.5 15.5V18H8v-2.5m8 0V18h2.5v-2.5" />
      <path d="M4.2 15.5 5.6 10a2 2 0 0 1 1.9-1.5h9a2 2 0 0 1 1.9 1.5l1.4 5.5" />
      <path d="M7.2 12.7h9.6" />
    </Icon>
  );
}

/** Abstract package — a bundle of stacked travel components. */
export function PackageIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3.5 20 8v8l-8 4.5L4 16V8l8-4.5Z" />
      <path d="M4 8l8 4.5L20 8M12 12.5V20.5" />
    </Icon>
  );
}

/** Abstract compass — the Explore mark. */
export function CompassIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m15.2 8.8-2 4.4-4.4 2 2-4.4 4.4-2Z" />
    </Icon>
  );
}

/** Abstract globe — meridian and parallel over a sphere. */
export function GlobeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.4 2.6 3.6 5.4 3.6 8.5S14.4 18.4 12 20.5c-2.4-2.1-3.6-5.4-3.6-8.5S9.6 6.1 12 3.5Z" />
    </Icon>
  );
}

/** Abstract intelligence mark — a four-point spark. */
export function SparkIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3.5c.7 3.7 1.8 4.8 5.5 5.5-3.7.7-4.8 1.8-5.5 5.5-.7-3.7-1.8-4.8-5.5-5.5 3.7-.7 4.8-1.8 5.5-5.5Z" />
      <path d="M17.8 15.2c.35 1.75.9 2.3 2.7 2.65-1.8.35-2.35.9-2.7 2.65-.35-1.75-.9-2.3-2.7-2.65 1.8-.35 2.35-.9 2.7-2.65Z" />
    </Icon>
  );
}

export function CalendarIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="5.5" width="17" height="15" rx="2.5" />
      <path d="M3.5 10h17M8.5 3.5v4m7-4v4" />
    </Icon>
  );
}

export function TravelersIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="9.5" cy="8" r="3.2" />
      <path d="M3.8 19.2a5.7 5.7 0 0 1 11.4 0" />
      <path d="M16.2 6.2a3 3 0 0 1 0 5.6M17.4 14.4a5.4 5.4 0 0 1 3 4.8" />
    </Icon>
  );
}

export function SeatIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7 4.5v8.2a2 2 0 0 0 2 2h6.4" />
      <path d="M7 19.5h11.5M18.5 14.7v4.8" />
      <path d="M4.5 19.5V15" />
    </Icon>
  );
}

export function PinIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 21c4-4.4 6-7.6 6-10a6 6 0 1 0-12 0c0 2.4 2 5.6 6 10Z" />
      <circle cx="12" cy="11" r="2.3" />
    </Icon>
  );
}

export function ShieldIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3.5 19 6v6c0 4.2-2.8 7.2-7 8.5-4.2-1.3-7-4.3-7-8.5V6l7-2.5Z" />
      <path d="m9 12 2.2 2.2L15.4 10" />
    </Icon>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5M12 7.9v.2" />
    </Icon>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </Icon>
  );
}

export function CoinsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <ellipse cx="12" cy="7" rx="7" ry="3" />
      <path d="M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7" />
      <path d="M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" />
    </Icon>
  );
}

export function RouteIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="6" cy="18" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <path d="M8.5 18h5a3.5 3.5 0 0 0 0-7h-3a3.5 3.5 0 0 1 0-7h5" />
    </Icon>
  );
}

/** Abstract city — a skyline of three blocks. Distinguishes a city entity. */
export function CityIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.5 20.5h17" />
      <path d="M5 20.5V11l4-2.5V20.5" />
      <path d="M9 20.5V6l5-2.5v17" />
      <path d="M14 20.5v-8l5 2v6" />
      <path d="M11.4 8.2v.01M11.4 11.6v.01M16.4 15.4v.01" />
    </Icon>
  );
}

/** Two opposed arrows — the origin/destination swap control. */
export function SwapIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7 4.5 3.5 8 7 11.5" />
      <path d="M3.5 8h13.2" />
      <path d="m17 12.5 3.5 3.5-3.5 3.5" />
      <path d="M20.5 16H7.3" />
    </Icon>
  );
}

export function LayersIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m12 3.5 8.5 4.3L12 12 3.5 7.8 12 3.5Z" />
      <path d="m3.5 12.2 8.5 4.3 8.5-4.3M3.5 16.4l8.5 4.3 8.5-4.3" />
    </Icon>
  );
}
