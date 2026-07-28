import type { Metadata } from "next";

import { getDirection } from "@/config/locales";
import { getDictionary } from "@/i18n/get-dictionary";
import { ProductPageShell } from "@/components/layout/ProductPageShell";
import {
  CalendarIcon,
  FlightIcon,
  RouteIcon,
  ShieldIcon,
} from "@/components/ui/icons";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const { meta } = await getDictionary(locale);
  return { title: meta.flights.title, description: meta.flights.description };
}

export default async function FlightsPage({ params }: PageProps) {
  const { locale } = await params;
  const dictionary = await getDictionary(locale);

  return (
    <ProductPageShell
      dictionary={dictionary}
      page={dictionary.pages.flights}
      dir={getDirection(locale)}
      searchProduct="flights"
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
