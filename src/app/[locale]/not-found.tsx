import { defaultLocale } from "@/config/locales";
import { getDictionary } from "@/i18n/get-dictionary";
import { localePath } from "@/i18n/routing";
import { Container } from "@/components/layout/Container";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { CompassIcon } from "@/components/ui/icons";

/**
 * Not-found boundary for the locale segment.
 *
 * Next.js renders this without route params, so it cannot know which locale the
 * visitor was in. It therefore renders in the default locale — the same
 * language guarantee `src/proxy.ts` gives to any unrecognised URL.
 */
export default async function LocaleNotFound() {
  const dictionary = await getDictionary(defaultLocale);

  return (
    <section className="py-20 lg:py-28">
      <Container width="narrow">
        <EmptyState
          title={dictionary.notFound.title}
          description={dictionary.notFound.description}
          icon={<CompassIcon size={22} />}
          action={
            <ButtonLink href={localePath(defaultLocale)} size="lg">
              {dictionary.notFound.cta}
            </ButtonLink>
          }
        />
      </Container>
    </section>
  );
}
