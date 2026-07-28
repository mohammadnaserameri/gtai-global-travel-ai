import type { Dictionary } from "@/i18n/get-dictionary";
import { localePath } from "@/i18n/routing";
import { Container } from "@/components/layout/Container";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { ArrowRightIcon, SparkIcon } from "@/components/ui/icons";

interface GuidedAiPanelProps {
  locale: string;
  dictionary: Dictionary;
}

/**
 * The guided-planning differentiation panel.
 *
 * Two constraints shape this section. There is no large conversational text
 * box — the topics are shown as a static list of what a structured interview
 * would ask. And the copy stays in the future tense, because no AI model,
 * agent or interview engine is connected in this release.
 */
export function GuidedAiPanel({ locale, dictionary }: GuidedAiPanelProps) {
  const { aiPanel, common } = dictionary;

  return (
    <section
      aria-labelledby="gtai-ai-panel-heading"
      className="relative isolate overflow-hidden py-16 lg:py-24"
    >
      <div
        aria-hidden="true"
        className="from-background via-brand-25 to-background absolute inset-0 bg-linear-to-b"
      />

      <Container className="relative">
        <div className="border-brand-150 bg-surface-elevated overflow-hidden rounded-2xl border shadow-lg">
          <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
            <div className="flex flex-col gap-6 p-6 sm:p-9 lg:p-12">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="brand" dot>
                  {aiPanel.eyebrow}
                </Badge>
                <Badge tone="future">{common.previewBadge}</Badge>
              </div>

              <h2
                id="gtai-ai-panel-heading"
                className="text-foreground text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl"
              >
                {aiPanel.title}
              </h2>

              <p className="text-foreground-secondary max-w-xl text-base leading-relaxed">
                {aiPanel.description}
              </p>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <ButtonLink
                  href={localePath(locale, "/ai-travel")}
                  size="lg"
                  className="w-full sm:w-auto"
                >
                  <SparkIcon size={18} />
                  {aiPanel.cta}
                  <ArrowRightIcon size={18} className="rtl:-scale-x-100" />
                </ButtonLink>
              </div>

              <p className="text-foreground-muted text-xs leading-relaxed">
                {aiPanel.notice}
              </p>
            </div>

            <div className="border-brand-150 from-brand-25 to-accent-100 border-t bg-linear-to-br p-6 sm:p-9 lg:border-s lg:border-t-0 lg:p-10">
              <h3 className="text-brand-700 text-xs font-semibold tracking-[0.12em] uppercase">
                {aiPanel.topicsLabel}
              </h3>
              <ul className="mt-4 flex flex-wrap gap-2">
                {aiPanel.topics.map((topic) => (
                  <li
                    key={topic}
                    className="rounded-pill border-brand-250 bg-surface/80 text-brand-ink-strong inline-flex items-center border px-3.5 py-2 text-sm"
                  >
                    {topic}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
