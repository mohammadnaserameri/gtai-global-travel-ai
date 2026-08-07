import type { ReactNode } from "react";

import type { Direction } from "@/config/locales";
import type { TravelImageAsset } from "@/features/travel-images/travel-image-types";
import type { Dictionary } from "@/i18n/get-dictionary";
import type { InitialFlightSearch } from "@/features/flights/search-intent-types";
import { Container } from "@/components/layout/Container";
import { SectionHeading } from "@/components/layout/SectionHeading";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { SearchShell } from "@/components/search/SearchShell";
import { ProductImage } from "@/components/travel-images/ProductImage";

type ProductId = "flights" | "stays" | "cars" | "packages";

interface PlannedItem {
  title: string;
  description: string;
}

interface ProductPageShellProps {
  dictionary: Dictionary;
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
  image?: TravelImageAsset;
  searchProduct?: ProductId;
  initialFlightSearch?: InitialFlightSearch;
  icon?: ReactNode;
  plannedIcons?: readonly ReactNode[];
  children?: ReactNode;
}

/** Shared, honest frame for every current and planned travel product page. */
export function ProductPageShell({
  dictionary,
  page,
  dir,
  locale,
  image,
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
          {image ? (
            <ProductImage asset={image} alt={page.title} className="mt-8" />
          ) : null}
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
