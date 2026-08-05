import type { Metadata } from "next";

import { getDirection, resolveContentLocale } from "@/config/locales";
import { getDictionary } from "@/i18n/get-dictionary";
import { buildPublicMetadata } from "@/lib/seo/public-metadata";
import { PRODUCT_PAGE_PATHS } from "@/config/public-company-profile";
import {
  rawSearchIntentParamsFromRecord,
  type RawSearchParamsRecord,
} from "@/features/flights/search-intent-url";
import { parseInitialFlightSearch } from "@/features/flights/search-intent-validation";
import { ProductPageShell } from "@/components/layout/ProductPageShell";
import {
  CalendarIcon,
  FlightIcon,
  RouteIcon,
  ShieldIcon,
} from "@/components/ui/icons";

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<RawSearchParamsRecord>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const { meta } = await getDictionary(resolveContentLocale(locale));
  return buildPublicMetadata({
    locale,
    title: meta.flights.title,
    description: meta.flights.description,
    siteName: meta.siteName,
    path: PRODUCT_PAGE_PATHS.flights,
  });
}

export default async function FlightsPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const dictionary = await getDictionary(resolveContentLocale(locale));
  const rawParams = rawSearchIntentParamsFromRecord(await searchParams);
  const initialFlightSearch = parseInitialFlightSearch(rawParams);

  return (
    <ProductPageShell
      dictionary={dictionary}
      page={dictionary.pages.flights}
      dir={getDirection(resolveContentLocale(locale))}
      locale={locale}
      searchProduct="flights"
      initialFlightSearch={initialFlightSearch}
      icon={<FlightIcon size={22} />}
      plannedIcons={[
        <RouteIcon key="compare" size={20} />,
        <CalendarIcon key="dates" size={20} />,
        <FlightIcon key="stops" size={20} />,
        <ShieldIcon key="transit" size={20} />,
      ]}
    />
  );
}
