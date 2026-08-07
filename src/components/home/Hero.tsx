import type { Direction } from "@/config/locales";
import type { TravelImageAsset } from "@/features/travel-images/travel-image-types";
import type { Dictionary } from "@/i18n/get-dictionary";
import { Container } from "@/components/layout/Container";
import { SearchShell } from "@/components/search/SearchShell";
import { HeroBackdrop } from "@/components/home/HeroBackdrop";

interface HeroProps {
  dictionary: Dictionary;
  dir: Direction;
  locale: string;
  image: TravelImageAsset;
}

/** Above-the-fold introduction and search surface. */
export function Hero({ dictionary, dir, locale, image }: HeroProps) {
  const { hero, searchTabs, search } = dictionary;

  return (
    <section className="border-border/70 bg-background relative isolate overflow-hidden border-b">
      <HeroBackdrop image={image} />

      <Container className="relative z-10 pt-8 pb-10 sm:pt-10 lg:pt-12 lg:pb-14">
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
          locale={locale}
          className="relative z-20 mt-6 lg:mt-8"
        />
      </Container>
    </section>
  );
}
