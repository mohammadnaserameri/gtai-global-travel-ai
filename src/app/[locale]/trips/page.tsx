import type { Metadata } from "next";

import { getDirection } from "@/config/locales";
import { getDictionary } from "@/i18n/get-dictionary";
import { ProductPageShell } from "@/components/layout/ProductPageShell";
import { Alert } from "@/components/ui/Alert";
import {
  LayersIcon,
  PinIcon,
  RouteIcon,
  SearchIcon,
  TravelersIcon,
} from "@/components/ui/icons";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const { meta } = await getDictionary(locale);
  return { title: meta.trips.title, description: meta.trips.description };
}

export default async function TripsPage({ params }: PageProps) {
  const { locale } = await params;
  const dictionary = await getDictionary(locale);

  return (
    <ProductPageShell
      dictionary={dictionary}
      page={dictionary.pages.trips}
      dir={getDirection(locale)}
      locale={locale}
      icon={<PinIcon size={22} />}
      plannedIcons={[
        <SearchIcon key="saved" size={20} />,
        <RouteIcon key="watched" size={20} />,
        <LayersIcon key="timeline" size={20} />,
        <TravelersIcon key="shared" size={20} />,
      ]}
    >
      <Alert tone="info" title={dictionary.nav.signIn} className="mt-8">
        {dictionary.pages.trips.signInNotice}
      </Alert>
    </ProductPageShell>
  );
}
