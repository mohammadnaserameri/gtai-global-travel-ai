import type { Metadata } from "next";

import { getDirection } from "@/config/locales";
import { getDictionary } from "@/i18n/get-dictionary";
import { ProductPageShell } from "@/components/layout/ProductPageShell";
import {
  CarIcon,
  CoinsIcon,
  PinIcon,
  RouteIcon,
  ShieldIcon,
} from "@/components/ui/icons";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const { meta } = await getDictionary(locale);
  return { title: meta.cars.title, description: meta.cars.description };
}

export default async function CarsPage({ params }: PageProps) {
  const { locale } = await params;
  const dictionary = await getDictionary(locale);

  return (
    <ProductPageShell
      dictionary={dictionary}
      page={dictionary.pages.cars}
      dir={getDirection(locale)}
      searchProduct="cars"
      icon={<CarIcon size={22} />}
      plannedIcons={[
        <CoinsIcon key="cost" size={20} />,
        <PinIcon key="pickup" size={20} />,
        <ShieldIcon key="licence" size={20} />,
        <RouteIcon key="border" size={20} />,
      ]}
    />
  );
}
