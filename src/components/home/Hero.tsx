import type { Direction } from "@/config/locales";
import type { Dictionary } from "@/i18n/get-dictionary";
import { Container } from "@/components/layout/Container";
import { SearchShell } from "@/components/search/SearchShell";
import { HeroBackdrop } from "@/components/home/HeroBackdrop";

interface HeroProps {
  dictionary: Dictionary;
  dir: Direction;
}

/**
 * Above-the-fold band: a short introduction followed immediately by the search
 * surface.
 *
 * The introduction is deliberately two elements — one headline and one
 * sentence. Everything that used to live here (eyebrow badges, three benefit
 * cards, a large route illustration and a release notice) either moved further
 * down the page or was cut, because a traveller landing on GTAI should reach
 * the search controls without scrolling. The whole band fits inside 900px of
 * viewport height at desktop widths.
 */
export function Hero({ dictionary, dir }: HeroProps) {
  const { hero, searchTabs, search } = dictionary;

  return (
    <section className="border-border/70 from-brand-25 via-background to-background relative isolate overflow-hidden border-b bg-linear-to-b">
      <HeroBackdrop />

      <Container className="relative pt-8 pb-10 sm:pt-10 lg:pt-12 lg:pb-14">
        <div className="max-w-2xl">
          <h1 className="text-foreground text-3xl leading-[1.1] font-semibold tracking-tight text-balance sm:text-4xl lg:text-5xl">
            {hero.title}
          </h1>
          <p className="text-foreground-secondary mt-3 text-base leading-relaxed sm:text-lg">
            {hero.subtitle}
          </p>
        </div>

        <SearchShell
          tabs={searchTabs}
          labels={search}
          dir={dir}
          className="mt-6 lg:mt-8"
        />
      </Container>
    </section>
  );
}
