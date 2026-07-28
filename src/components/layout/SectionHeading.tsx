import type { ReactNode } from "react";

import { cn } from "@/lib/utilities/cn";

interface SectionHeadingProps {
  /** Small label above the title. Decorative context, not a heading level. */
  eyebrow?: string;
  title: string;
  description?: string;
  /** Heading level. Sections use h2; nested blocks use h3. */
  as?: "h1" | "h2" | "h3";
  /** `id` for the heading, so a section can be labelled by it. */
  id?: string;
  align?: "start" | "center";
  /** Optional trailing content, e.g. a badge or a link. */
  aside?: ReactNode;
  className?: string;
}

const titleSizes: Record<"h1" | "h2" | "h3", string> = {
  h1: "text-3xl sm:text-4xl lg:text-5xl",
  h2: "text-2xl sm:text-3xl lg:text-[2.5rem]",
  h3: "text-xl sm:text-2xl",
};

export function SectionHeading({
  eyebrow,
  title,
  description,
  as: Heading = "h2",
  id,
  align = "start",
  aside,
  className,
}: SectionHeadingProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3",
        align === "center" && "items-center text-center",
        className,
      )}
    >
      {eyebrow ? (
        <p className="text-brand-700 text-xs font-semibold tracking-[0.14em] uppercase">
          {eyebrow}
        </p>
      ) : null}

      <div
        className={cn(
          "flex flex-wrap items-end gap-x-4 gap-y-2",
          align === "center" ? "justify-center" : "justify-between",
        )}
      >
        <Heading
          id={id}
          className={cn(
            "text-foreground max-w-3xl font-semibold tracking-tight text-balance",
            titleSizes[Heading],
          )}
        >
          {title}
        </Heading>
        {aside ? <div className="shrink-0">{aside}</div> : null}
      </div>

      {description ? (
        <p
          className={cn(
            "text-foreground-secondary max-w-2xl text-base leading-relaxed",
            align === "center" && "mx-auto",
          )}
        >
          {description}
        </p>
      ) : null}
    </div>
  );
}
