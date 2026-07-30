import type { Metadata } from "next";
import { Suspense } from "react";

import { getDictionary } from "@/i18n/get-dictionary";
import { Container } from "@/components/layout/Container";
import { FlightResultsExperience } from "@/components/flights/FlightResultsExperience";
import { ResultsLoadingSkeleton } from "@/components/flights/ResultsLoadingSkeleton";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const { meta } = await getDictionary(locale);
  return {
    title: meta.flightResults.title,
    description: meta.flightResults.description,
  };
}

/**
 * The Results page reads the query string on the client via `useSearchParams`
 * so Back, Forward and a reload all re-validate the same URL the same way —
 * there is no server-cached "first parse" that could drift from what the
 * address bar actually says. `Suspense` is required by that hook and doubles
 * as the route's real loading boundary.
 */
export default async function FlightResultsPage({ params }: PageProps) {
  const { locale } = await params;
  const dictionary = await getDictionary(locale);

  return (
    <Suspense
      fallback={
        <Container className="py-8 lg:py-10">
          <ResultsLoadingSkeleton labels={dictionary.flightResults} />
        </Container>
      }
    >
      <FlightResultsExperience locale={locale} dictionary={dictionary} />
    </Suspense>
  );
}
