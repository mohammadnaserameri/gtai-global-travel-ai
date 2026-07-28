import type { Metadata } from "next";

import { getDirection } from "@/config/locales";
import { getDictionary } from "@/i18n/get-dictionary";
import { ProductPageShell } from "@/components/layout/ProductPageShell";
import {
  CalendarIcon,
  CoinsIcon,
  CompassIcon,
  RouteIcon,
} from "@/components/ui/icons";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const { meta } = await getDictionary(locale);
  return { title: meta.explore.title, description: meta.explore.description };
}

export default async function ExplorePage({ params }: PageProps) {
  const { locale } = await params;
  const dictionary = await getDictionary(locale);

  return (
    <ProductPageShell
      dictionary={dictionary}
      page={dictionary.pages.explore}
      dir={getDirection(locale)}
      locale={locale}
      icon={<CompassIcon size={22} />}
      plannedIcons={[
        <CoinsIcon key="budget" size={20} />,
        <CalendarIcon key="month" size={20} />,
        <CompassIcon key="interest" size={20} />,
        <RouteIcon key="reach" size={20} />,
      ]}
    />
  );
}
