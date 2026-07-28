import { cn } from "@/lib/utilities/cn";

interface SkeletonProps {
  className?: string;
  /** Accessible label for standalone skeletons. Omit inside a labelled region. */
  label?: string;
}

/**
 * Neutral loading placeholder.
 *
 * Uses a static tint rather than a shimmer sweep: a looping gradient animation
 * across a page full of placeholders is exactly the kind of motion that hurts
 * readability, and it would be suppressed under reduced-motion anyway.
 */
export function Skeleton({ className, label }: SkeletonProps) {
  return (
    <span
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn(
        "from-background-muted via-brand-50 to-background-muted block rounded-md bg-linear-to-r",
        className,
      )}
    />
  );
}
