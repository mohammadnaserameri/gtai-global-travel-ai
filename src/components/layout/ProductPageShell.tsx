import type { ReactNode } from "react";

import type { Direction } from "@/config/locales";
import type { Dictionary } from "@/i18n/get-dictionary";
import type { InitialFlightSearch } from "@/features/flights/search-intent-types";
import { Container } from "@/components/layout/Container";
import { SectionHeading } from "@/components/layout/SectionHeading";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { SearchShell } from "@/components/search/SearchShell";

type ProductId = "flights" | "stays" | "cars" | "packages";

interface PlannedItem {
  title: string;
  description: string;
}

interface ProductPageShellProps {
  dictionary: Dictionary;
  /** The `pages.<key>` slice for this route. */
  page: {
    eyebrow: string;
    title: string;
    description: string;
    planned: readonly PlannedItem[];
    emptyTitle: string;
    emptyDescription: string;
  };
  dir: Direction;
  locale: string;
  /** Renders the search shell with this product tab preselected. */
  searchProduct?: ProductId;
  /** Seeds the Flight Search form from a safe, pre-validated Edit-search return trip. */
  initialFlightSearch?: InitialFlightSearch;
  /** Icon shown in the empty state. */
  icon?: ReactNode;
  /** Icons paired with the "planned" cards, cycled if shorter than the list. */
  plannedIcons?: readonly ReactNode[];
  /** Extra content rendered between the planned grid and the empty state. */
  children?: ReactNode;
}

/**
 * Shared frame for every placeholder product page.
 *
 * All six pages are intentionally the same shape: a titled band, the search
 * surface where it applies, what the page will eventually do, and an honest
 * empty state. Building them from one component is what keeps the placeholders
 * looking designed rather than unfinished.
 */
export function ProductPageShell({
  dictionary,
  page,
  dir,
  locale,
  searchProduct,
  initialFlightSearch,
  icon,
  plannedIcons,
  children,
}: ProductPageShellProps) {
  const { common, searchTabs, search } = dictionary;

  return (
    <>
      <section className="border-border/70 from-brand-25 to-background relative isolate border-b bg-linear-to-b">
        <div className="gtai-aurora" aria-hidden="true" />
        <Container className="relative py-12 lg:py-16">
          <SectionHeading
            as="h1"
            eyebrow={page.eyebrow}
            title={page.title}
            description={page.description}
            aside={<Badge tone="neutral">{common.notConnectedBadge}</Badge>}
          />
        </Container>

        {searchProduct ? (
          <Container className="relative z-20 pb-12 lg:pb-16">
            <SearchShell
              tabs={searchTabs}
              labels={search}
              dir={dir}
              locale={locale}
              defaultProduct={searchProduct}
              initialFlightSearch={initialFlightSearch}
            />
          </Container>
        ) : null}
      </section>

      <section className="py-14 lg:py-20">
        <Container>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {page.planned.map((item, index) => (
              <Card
                key={item.title}
                as="li"
                variant="plain"
                padding="md"
                interactive
                className="flex h-full flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  {plannedIcons?.length ? (
                    <span
                      aria-hidden="true"
                      className="border-brand-150 bg-brand-25 text-brand-700 inline-flex size-10 shrink-0 items-center justify-center rounded-lg border"
                    >
                      {plannedIcons[index % plannedIcons.length]}
                    </span>
                  ) : null}
                  <Badge tone="future" size="sm">
                    {common.futureBadge}
                  </Badge>
                </div>
                <h2 className="text-foreground text-sm font-semibold">
                  {item.title}
                </h2>
                <p className="text-foreground-muted text-sm leading-relaxed">
                  {item.description}
                </p>
              </Card>
            ))}
          </ul>

          {children}

          <EmptyState
            className="mt-10"
            title={page.emptyTitle}
            description={page.emptyDescription}
            icon={icon}
            showResultPreview
          />
        </Container>
      </section>
    </>
  );
}
