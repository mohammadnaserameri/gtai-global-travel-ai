import type { ElementType, ReactNode } from "react";

import { cn } from "@/lib/utilities/cn";

export type ContainerWidth = "narrow" | "default" | "wide";

const widths: Record<ContainerWidth, string> = {
  narrow: "max-w-3xl",
  default: "max-w-7xl",
  wide: "max-w-[90rem]",
};

interface ContainerProps {
  as?: ElementType;
  width?: ContainerWidth;
  className?: string;
  children: ReactNode;
}

/**
 * The single horizontal rhythm for the whole application.
 *
 * Padding steps at 360px → 768px → 1024px, which is what keeps every supported
 * breakpoint free of horizontal overflow without per-page overrides.
 */
export function Container({
  as: Component = "div",
  width = "default",
  className,
  children,
}: ContainerProps) {
  return (
    <Component
      className={cn(
        "mx-auto w-full px-4 sm:px-6 lg:px-8",
        widths[width],
        className,
      )}
    >
      {children}
    </Component>
  );
}
