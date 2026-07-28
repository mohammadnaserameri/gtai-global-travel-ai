import type { Metadata } from "next";

import { getDictionary } from "@/i18n/get-dictionary";
import { Container } from "@/components/layout/Container";
import { SectionHeading } from "@/components/layout/SectionHeading";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { AgentPreviewCard } from "@/components/ai/AgentPreviewCard";
import { PlanningModeCard } from "@/components/ai/PlanningModeCard";
import {
  PreviewBoolean,
  PreviewCards,
  PreviewChips,
  PreviewRanking,
  PreviewSelect,
  PreviewSlider,
  QuestionPreview,
} from "@/components/ai/QuestionPreview";
import {
  CalendarIcon,
  CarIcon,
  CheckIcon,
  CoinsIcon,
  CompassIcon,
  FlightIcon,
  GlobeIcon,
  LayersIcon,
  PackageIcon,
  PinIcon,
  RouteIcon,
  SearchIcon,
  ShieldIcon,
  SparkIcon,
  StayIcon,
  TravelersIcon,
} from "@/components/ui/icons";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const { meta } = await getDictionary(locale);
  return { title: meta.aiTravel.title, description: meta.aiTravel.description };
}

/** Paired with `agents.items` by position. Decorative only. */
const agentIcons = [
  <TravelersIcon key="profile" size={20} />,
  <SearchIcon key="orchestrator" size={20} />,
  <FlightIcon key="flight" size={20} />,
  <StayIcon key="stay" size={20} />,
  <CarIcon key="car" size={20} />,
  <CompassIcon key="activities" size={20} />,
  <CoinsIcon key="budget" size={20} />,
  <GlobeIcon key="visa" size={20} />,
  <ShieldIcon key="risk" size={20} />,
  <CheckIcon key="trust" size={20} />,
  <PackageIcon key="optimizer" size={20} />,
  <LayersIcon key="explanation" size={20} />,
  <RouteIcon key="monitoring" size={20} />,
];

const howIcons = [
  <CompassIcon key="relevant" size={20} />,
  <RouteIcon key="branching" size={20} />,
  <CalendarIcon key="skip" size={20} />,
  <SparkIcon key="progressive" size={20} />,
];

export default async function AiTravelPage({ params }: PageProps) {
  const { locale } = await params;
  const dictionary = await getDictionary(locale);
  const page = dictionary.pages.aiTravel;
  const { agents, common } = dictionary;
  const controls = page.controls;

  return (
    <>
      {/* ---- Intro ------------------------------------------------------- */}
      <section className="border-border/70 from-brand-25 to-background relative isolate overflow-hidden border-b bg-linear-to-b">
        <div className="gtai-aurora" aria-hidden="true" />
        <Container className="relative py-12 lg:py-16">
          <SectionHeading
            as="h1"
            eyebrow={page.eyebrow}
            title={page.title}
            description={page.description}
            aside={<Badge tone="future">{common.previewBadge}</Badge>}
          />
          <Alert tone="brand" className="mt-6 max-w-3xl">
            {page.notice}
          </Alert>
        </Container>
      </section>

      {/* ---- Three planning modes ---------------------------------------- */}
      <section aria-labelledby="gtai-modes-heading" className="py-14 lg:py-20">
        <Container>
          <SectionHeading
            id="gtai-modes-heading"
            title={page.modesTitle}
            description={page.modesDescription}
          />
          <ul className="mt-10 grid gap-4 lg:grid-cols-3">
            {page.modes.map((mode, index) => (
              <PlanningModeCard
                key={mode.id}
                name={mode.name}
                scale={mode.scale}
                duration={mode.duration}
                description={mode.description}
                points={mode.points}
                featured={index === 1}
                previewBadge={common.previewBadge}
              />
            ))}
          </ul>
        </Container>
      </section>

      {/* ---- Interview behaviour ------------------------------------------ */}
      <section
        aria-labelledby="gtai-how-heading"
        className="border-border bg-background-muted border-y py-14 lg:py-20"
      >
        <Container>
          <SectionHeading id="gtai-how-heading" title={page.howTitle} />
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {page.how.map((item, index) => (
              <Card
                key={item.title}
                as="li"
                variant="plain"
                padding="md"
                className="flex h-full flex-col gap-3"
              >
                <span
                  aria-hidden="true"
                  className="border-brand-150 bg-brand-25 text-brand-700 inline-flex size-10 items-center justify-center rounded-lg border"
                >
                  {howIcons[index % howIcons.length]}
                </span>
                <h3 className="text-foreground text-sm font-semibold">
                  {item.title}
                </h3>
                <p className="text-foreground-muted text-sm leading-relaxed">
                  {item.description}
                </p>
              </Card>
            ))}
          </ul>
        </Container>
      </section>

      {/* ---- Question format previews ------------------------------------- */}
      <section aria-labelledby="gtai-controls-heading" className="py-14 lg:py-20">
        <Container>
          <SectionHeading
            id="gtai-controls-heading"
            title={page.controlsTitle}
            description={page.controlsDescription}
            aside={<Badge tone="neutral">{common.demoBadge}</Badge>}
          />

          <ul className="mt-10 grid gap-4 lg:grid-cols-2">
            <QuestionPreview
              kind={controls.selectTitle}
              question={controls.selectLabel}
            >
              <PreviewSelect options={controls.selectOptions} />
            </QuestionPreview>

            <QuestionPreview
              kind={controls.cardsTitle}
              question={controls.cardsLabel}
            >
              <PreviewCards options={controls.cardsOptions} />
            </QuestionPreview>

            <QuestionPreview
              kind={controls.chipsTitle}
              question={controls.chipsLabel}
            >
              <PreviewChips options={controls.chipsOptions} />
            </QuestionPreview>

            <QuestionPreview
              kind={controls.sliderTitle}
              question={controls.sliderLabel}
            >
              <PreviewSlider
                min={controls.sliderMin}
                max={controls.sliderMax}
                value={controls.sliderValue}
              />
            </QuestionPreview>

            <QuestionPreview
              kind={controls.booleanTitle}
              question={controls.booleanLabel}
            >
              <PreviewBoolean
                yes={controls.booleanYes}
                no={controls.booleanNo}
                unsure={controls.booleanUnsure}
              />
            </QuestionPreview>

            <QuestionPreview
              kind={controls.rankingTitle}
              question={controls.rankingLabel}
            >
              <PreviewRanking
                options={controls.rankingOptions}
                hint={controls.rankingHint}
              />
            </QuestionPreview>
          </ul>
        </Container>
      </section>

      {/* ---- Data boundaries ---------------------------------------------- */}
      <section
        aria-labelledby="gtai-privacy-heading"
        className="border-border from-background to-brand-25 border-y bg-linear-to-b py-14 lg:py-20"
      >
        <Container>
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
            <SectionHeading
              id="gtai-privacy-heading"
              title={page.privacyTitle}
              description={page.privacyDescription}
            />
            <ul className="grid gap-3 sm:grid-cols-2 lg:content-start">
              {page.privacyItems.map((item) => (
                <li
                  key={item}
                  className="border-border bg-surface text-foreground-secondary flex items-start gap-2.5 rounded-lg border p-3.5 text-sm"
                >
                  <span
                    aria-hidden="true"
                    className="bg-success-subtle text-success mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full"
                  >
                    <CheckIcon size={13} />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </Container>
      </section>

      {/* ---- Future multi-agent architecture ------------------------------ */}
      <section aria-labelledby="gtai-agents-heading" className="py-14 lg:py-20">
        <Container>
          <SectionHeading
            id="gtai-agents-heading"
            eyebrow={agents.eyebrow}
            title={agents.title}
            description={agents.description}
            aside={<Badge tone="future">{common.futureBadge}</Badge>}
          />

          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {agents.items.map((agent, index) => (
              <AgentPreviewCard
                key={agent.name}
                name={agent.name}
                description={agent.description}
                badge={agents.badge}
                icon={agentIcons[index % agentIcons.length]}
              />
            ))}
          </ul>

          <Alert
            tone="info"
            className="mt-8 max-w-3xl"
            icon={<PinIcon size={18} />}
          >
            {agents.notice}
          </Alert>
        </Container>
      </section>
    </>
  );
}
