import { cn } from "@/lib/utilities/cn";
import { InfoIcon } from "@/components/ui/icons";

/**
 * The standing statement that GTAI's flight content is demonstration data.
 *
 * One component rather than a disclosure written into each surface, because
 * the claim has to be *identical* everywhere it appears. A notice that is
 * emphatic on Results and vague on Details does not describe a product — it
 * describes whichever page the reader happens to have landed on, and a partner
 * evaluating this site would have to check each one separately to know what is
 * actually being claimed.
 *
 * Three weights, for three different jobs:
 *
 * - `compact` — one line beside a control or inside a card, where the reader
 *   already has the context and needs the fact, not the explanation.
 * - `standard` — the default: a titled note above a result list.
 * - `prominent` — the page-level statement, used once where a visitor's first
 *   impression of the data is formed.
 *
 * The weight changes the visual emphasis. It never changes the claim.
 *
 * Accessibility: the notice is a `note` landmark with an accessible name, so a
 * screen-reader user can find it rather than only encountering it in reading
 * order. It carries an icon *and* a title *and* body text, so nothing depends
 * on colour alone. It is deliberately **not dismissible** in V2.8-A: a
 * disclosure a visitor can close is a disclosure that is absent for everyone
 * who closed it, and the current data genuinely is fictional on every view.
 */

export type DemonstrationNoticeVariant = "compact" | "standard" | "prominent";

export interface DemonstrationNoticeLabels {
  /** Short heading naming the situation, e.g. "Demonstration data". */
  readonly title: string;
  /** One sentence for the `compact` weight. */
  readonly compact: string;
  /** The full statement for `standard` and `prominent`. */
  readonly body: string;
  /** Optional supporting points, rendered as a list at `prominent` weight. */
  readonly points?: readonly string[];
}

interface DemonstrationDataNoticeProps {
  labels: DemonstrationNoticeLabels;
  variant?: DemonstrationNoticeVariant;
  className?: string;
  /**
   * Overrides the accessible name when several notices appear on one page, so
   * a landmark list does not show the same label repeatedly.
   */
  ariaLabel?: string;
}

const containerByVariant: Record<DemonstrationNoticeVariant, string> = {
  compact:
    "border-border bg-background-muted text-foreground-secondary gap-2 rounded-lg border px-3 py-2 text-xs",
  standard:
    "border-brand-150 bg-brand-50 text-brand-ink-strong gap-3 rounded-lg border px-4 py-3 text-sm",
  prominent:
    "border-brand-150 bg-brand-50 text-brand-ink-strong gap-3 rounded-xl border px-4 py-4 text-sm sm:px-5 sm:py-5",
};

export function DemonstrationDataNotice({
  labels,
  variant = "standard",
  className,
  ariaLabel,
}: DemonstrationDataNoticeProps) {
  const isCompact = variant === "compact";

  return (
    <div
      role="note"
      aria-label={ariaLabel ?? labels.title}
      // `flex` with a shrink-0 icon and a `min-w-0` body: long translations —
      // French runs noticeably longer than English here — wrap inside the
      // notice instead of forcing the page wider.
      className={cn("flex items-start", containerByVariant[variant], className)}
    >
      <span aria-hidden="true" className="mt-0.5 shrink-0">
        <InfoIcon size={isCompact ? 14 : 18} />
      </span>

      <div className="min-w-0">
        {isCompact ? (
          <p className="leading-relaxed">
            <span className="font-semibold">{labels.title}</span>{" "}
            <span>{labels.compact}</span>
          </p>
        ) : (
          <>
            <p className="font-semibold">{labels.title}</p>
            <p className="mt-1 leading-relaxed">{labels.body}</p>
            {variant === "prominent" && labels.points?.length ? (
              <ul className="mt-2 flex list-disc flex-col gap-1 ps-5 leading-relaxed">
                {labels.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
