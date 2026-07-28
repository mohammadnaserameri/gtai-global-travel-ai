import type { Direction } from "@/config/locales";
import type { Dictionary } from "@/i18n/get-dictionary";
import { Container } from "@/components/layout/Container";
import { Badge } from "@/components/ui/Badge";
import { SearchShell } from "@/components/search/SearchShell";
import { AffiliateDisclosure } from "@/components/ui/AffiliateDisclosure";
import { RouteVisual } from "@/components/home/RouteVisual";

interface HeroProps {
  dictionary: Dictionary;
  dir: Direction;
}

/**
 * Homepage hero.
 *
 * Depth comes from three cheap, static CSS layers: an out-of-flow aurora field,
 * a masked dot grid and a single elevated search surface. No canvas, no WebGL,
 * no scroll-linked parallax — the search shell has to stay the most legible
 * thing on the page.
 */
export function Hero({ dictionary, dir }: HeroProps) {
  const { hero, searchTabs, search, common, affiliate } = dictionary;

  return (
    <section className="border-border/70 from-brand-25 via-background to-background relative isolate overflow-hidden border-b bg-linear-to-b">
      <div className="gtai-aurora" aria-hidden="true" />
      <div
        className="gtai-grid-field pointer-events-none absolute inset-0"
        aria-hidden="true"
      />

      <Container className="relative pt-12 pb-14 sm:pt-16 lg:pt-20 lg:pb-20">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-14">
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="brand" dot>
                {hero.eyebrow}
              </Badge>
              <Badge tone="neutral">{common.notConnectedBadge}</Badge>
            </div>

            <h1 className="text-foreground text-4xl leading-[1.06] font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
              {hero.title}
            </h1>

            <p className="text-foreground-secondary max-w-xl text-base leading-relaxed sm:text-lg">
              {hero.subtitle}
            </p>

            <ul className="grid gap-3 sm:grid-cols-3">
              {hero.highlights.map((item) => (
                <li
                  key={item.title}
                  className="border-border/80 bg-surface/70 rounded-xl border p-3.5 backdrop-blur-[2px]"
                >
                  <p className="text-brand-ink-strong text-sm font-semibold">
                    {item.title}
                  </p>
                  <p className="text-foreground-muted mt-1 text-xs leading-relaxed">
                    {item.description}
                  </p>
                </li>
              ))}
            </ul>

            <p className="text-foreground-muted text-xs leading-relaxed">
              {hero.note}
            </p>
          </div>

          <RouteVisual labels={hero.visual} />
        </div>
      </Container>

      <Container className="relative pb-14 lg:pb-20">
        <SearchShell tabs={searchTabs} labels={search} dir={dir} />
        <AffiliateDisclosure
          labels={affiliate}
          variant="inline"
          className="mt-4 px-1"
        />
      </Container>
    </section>
  );
}
