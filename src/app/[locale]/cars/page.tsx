import type { Metadata } from "next";

import { getDirection, resolveContentLocale } from "@/config/locales";
import { getDictionary } from "@/i18n/get-dictionary";
import { buildPublicMetadata } from "@/lib/seo/public-metadata";
import { PRODUCT_PAGE_PATHS } from "@/config/public-company-profile";
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
  const { meta } = await getDictionary(resolveContentLocale(locale));
  return buildPublicMetadata({
    locale,
    title: meta.cars.title,
    description: meta.cars.description,
    siteName: meta.siteName,
    path: PRODUCT_PAGE_PATHS.cars,
    // Public and honest, but not a page worth returning for a search:
    // this route describes a capability GTAI has not built yet.
    indexable: false,
  });
}

export default async function CarsPage({ params }: PageProps) {
  const { locale } = await params;
  const dictionary = await getDictionary(resolveContentLocale(locale));

  return (
    <ProductPageShell
      dictionary={dictionary}
      page={dictionary.pages.cars}
      dir={getDirection(resolveContentLocale(locale))}
      locale={locale}
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
