import type { Metadata } from "next";

import { getDirection, resolveContentLocale } from "@/config/locales";
import { getDictionary } from "@/i18n/get-dictionary";
import { buildPublicMetadata } from "@/lib/seo/public-metadata";
import { PRODUCT_PAGE_PATHS } from "@/config/public-company-profile";
import { ProductPageShell } from "@/components/layout/ProductPageShell";
import { resolveTravelImage } from "@/server/travel-images/travel-image-engine";
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
  const { meta } = await getDictionary(resolveContentLocale(locale));
  return buildPublicMetadata({
    locale,
    title: meta.stays.title,
    description: meta.stays.description,
    siteName: meta.siteName,
    path: PRODUCT_PAGE_PATHS.stays,
    // Public and honest, but not a page worth returning for a search:
    // this route describes a capability GTAI has not built yet.
    indexable: false,
  });
}

export default async function StaysPage({ params }: PageProps) {
  const { locale } = await params;
  const dictionary = await getDictionary(resolveContentLocale(locale));
  const image = await resolveTravelImage({
    category: "stays",
    destination: "Global",
  });

  return (
    <ProductPageShell
      dictionary={dictionary}
      page={dictionary.pages.stays}
      dir={getDirection(resolveContentLocale(locale))}
      locale={locale}
      image={image}
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
