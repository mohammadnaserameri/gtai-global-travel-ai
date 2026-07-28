import type { ReactNode } from "react";

import { cn } from "@/lib/utilities/cn";
import { Card } from "@/components/ui/Card";
import { ChevronDownIcon } from "@/components/ui/icons";

/**
 * Non-functional previews of the structured controls GTAI's future travel
 * interview will use.
 *
 * These are deliberately **not** real form controls. Rendering working inputs
 * here would imply an interview that can be answered and stored; nothing on
 * this page submits, stores or transmits anything. The question text stays as
 * real readable text, and the control artwork is hidden from assistive
 * technology so a screen-reader user is not offered a control that does
 * nothing.
 */

interface PreviewFrameProps {
  kind: string;
  question: string;
  children: ReactNode;
  className?: string;
}

export function QuestionPreview({
  kind,
  question,
  children,
  className,
}: PreviewFrameProps) {
  return (
    <Card
      as="li"
      variant="plain"
      padding="md"
      className={cn("flex h-full flex-col gap-3", className)}
    >
      <p className="text-brand-700 text-[0.6875rem] font-semibold tracking-[0.12em] uppercase">
        {kind}
      </p>
      <p className="text-foreground text-sm font-medium">{question}</p>
      <div className="mt-auto pt-1">{children}</div>
    </Card>
  );
}

export function PreviewSelect({ options }: { options: readonly string[] }) {
  return (
    <div
      aria-hidden="true"
      className="border-border bg-surface-subtle text-foreground-secondary flex min-h-11 items-center justify-between gap-2 rounded-lg border px-3.5 text-sm"
    >
      {options[0]}
      <ChevronDownIcon size={16} />
    </div>
  );
}

export function PreviewCards({
  options,
}: {
  options: readonly { title: string; description: string }[];
}) {
  return (
    <div aria-hidden="true" className="grid gap-2 sm:grid-cols-3">
      {options.map((option, index) => (
        <div
          key={option.title}
          className={cn(
            "rounded-lg border p-3 text-start",
            index === 1
              ? "border-brand-400 bg-brand-25 shadow-xs"
              : "border-border bg-surface-subtle",
          )}
        >
          <p className="text-foreground text-sm font-semibold">{option.title}</p>
          <p className="text-foreground-muted mt-1 text-xs leading-snug">
            {option.description}
          </p>
        </div>
      ))}
    </div>
  );
}

export function PreviewChips({ options }: { options: readonly string[] }) {
  return (
    <div aria-hidden="true" className="flex flex-wrap gap-2">
      {options.map((option, index) => (
        <span
          key={option}
          className={cn(
            "rounded-pill inline-flex min-h-9 items-center border px-3.5 text-sm",
            index % 3 === 0
              ? "border-brand-400 bg-brand-50 text-brand-ink-strong font-medium"
              : "border-border bg-surface text-foreground-secondary",
          )}
        >
          {option}
        </span>
      ))}
    </div>
  );
}

export function PreviewSlider({
  min,
  max,
  value,
}: {
  min: string;
  max: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div aria-hidden="true" className="rounded-pill bg-border relative h-2">
        <span className="rounded-pill from-brand-400 to-brand-700 absolute inset-y-0 start-0 w-[38%] bg-linear-to-r" />
        <span className="border-brand-700 bg-surface absolute start-[38%] top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 shadow-sm rtl:translate-x-1/2" />
      </div>
      <div className="gtai-ltr-numerals text-foreground-muted flex justify-between text-xs">
        <span>{min}</span>
        <span className="text-brand-ink font-semibold">{value}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

export function PreviewBoolean({
  yes,
  no,
  unsure,
}: {
  yes: string;
  no: string;
  unsure: string;
}) {
  return (
    <div aria-hidden="true" className="flex flex-wrap gap-2">
      <span className="border-brand-400 bg-brand-50 text-brand-ink-strong inline-flex min-h-10 flex-1 items-center justify-center rounded-lg border px-3 text-sm font-semibold">
        {yes}
      </span>
      <span className="border-border bg-surface text-foreground-secondary inline-flex min-h-10 flex-1 items-center justify-center rounded-lg border px-3 text-sm">
        {no}
      </span>
      <span className="border-border bg-surface text-foreground-secondary inline-flex min-h-10 flex-1 items-center justify-center rounded-lg border px-3 text-sm">
        {unsure}
      </span>
    </div>
  );
}

export function PreviewRanking({
  options,
  hint,
}: {
  options: readonly string[];
  hint: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <ol aria-hidden="true" className="flex flex-col gap-1.5">
        {options.map((option, index) => (
          <li
            key={option}
            className="border-border bg-surface-subtle text-foreground-secondary flex items-center gap-3 rounded-lg border px-3 py-2 text-sm"
          >
            <span className="gtai-ltr-numerals bg-brand-700 inline-flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-semibold text-white">
              {index + 1}
            </span>
            {option}
            <span className="text-foreground-muted ms-auto" aria-hidden="true">
              ⠿
            </span>
          </li>
        ))}
      </ol>
      <p className="text-foreground-muted text-xs">{hint}</p>
    </div>
  );
}
