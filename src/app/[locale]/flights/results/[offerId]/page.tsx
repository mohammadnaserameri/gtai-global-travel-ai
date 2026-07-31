import type { Metadata } from "next";
import { Suspense } from "react";

import { getDictionary } from "@/i18n/get-dictionary";
import { Container } from "@/components/layout/Container";
import { FlightDetailsExperience } from "@/components/flights/details/FlightDetailsExperience";
import { FlightDetailsLoading } from "@/components/flights/details/FlightDetailsLoading";

interface PageProps {
  params: Promise<{ locale: string; offerId: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const { meta } = await getDictionary(locale);
  return {
    title: meta.flightDetails.title,
    description: meta.flightDetails.description,
    // A Details URL describes one locally generated demonstration option for
    // one specific search — there is nothing here worth indexing, and a
    // crawled demo itinerary could easily be mistaken for a real fare.
    robots: { index: false, follow: false },
  };
}

/**
 * The dedicated Flight Details route.
 *
 * The offer id arrives as a path segment and the Results context as the
 * query string; both are validated client-side by the same parsers the
 * Results page uses, so Back, Forward, a reload and a shared link all
 * re-derive the identical state from the identical URL. `Suspense` is
 * required by `useSearchParams` and doubles as the route's loading
 * boundary. The path parameter is deliberately passed through untouched —
 * validating it is `isValidOfferId`'s job, not this file's.
 */
export default async function FlightDetailsPage({ params }: PageProps) {
  const { locale, offerId } = await params;
  const dictionary = await getDictionary(locale);

  return (
    <Suspense
      fallback={
        <Container className="py-8 lg:py-10">
          <FlightDetailsLoading labels={dictionary.flightDetails} />
        </Container>
      }
    >
      <FlightDetailsExperience
        locale={locale}
        offerId={offerId}
        dictionary={dictionary}
      />
    </Suspense>
  );
}
