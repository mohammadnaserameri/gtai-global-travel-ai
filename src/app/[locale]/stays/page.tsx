import type { Metadata } from "next";

import { getDirection } from "@/config/locales";
import { getDictionary } from "@/i18n/get-dictionary";
import { ProductPageShell } from "@/components/layout/ProductPageShell";
import {
  CoinsIcon,
  PinIcon,
  ShieldIcon,
  StayIcon,
  TravelersIcon,
} from "@/components/ui/icons";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const { meta } = await getDictionary(locale);
  return { title: meta.stays.title, description: meta.stays.description };
}

export default async function StaysPage({ params }: PageProps) {
  const { locale } = await params;
  const dictionary = await getDictionary(locale);

  return (
    <ProductPageShell
      dictionary={dictionary}
      page={dictionary.pages.stays}
      dir={getDirection(locale)}
      searchProduct="stays"
      icon={<StayIcon size={22} />}
      plannedIcons={[
        <CoinsIcon key="totals" size={20} />,
        <PinIcon key="location" size={20} />,
        <TravelersIcon key="preferences" size={20} />,
        <ShieldIcon key="cancellation" size={20} />,
      ]}
    />
  );
}
