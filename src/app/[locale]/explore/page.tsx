import type { Metadata } from "next";

import { getDirection, resolveContentLocale } from "@/config/locales";
import { getDictionary } from "@/i18n/get-dictionary";
import { buildPublicMetadata } from "@/lib/seo/public-metadata";
import { PRODUCT_PAGE_PATHS } from "@/config/public-company-profile";
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
  const { meta } = await getDictionary(resolveContentLocale(locale));
  return buildPublicMetadata({
    locale,
    title: meta.explore.title,
    description: meta.explore.description,
    siteName: meta.siteName,
    path: PRODUCT_PAGE_PATHS.explore,
    // Public and honest, but not a page worth returning for a search:
    // this route describes a capability GTAI has not built yet.
    indexable: false,
  });
}

export default async function ExplorePage({ params }: PageProps) {
  const { locale } = await params;
  const dictionary = await getDictionary(resolveContentLocale(locale));

  return (
    <ProductPageShell
      dictionary={dictionary}
      page={dictionary.pages.explore}
      dir={getDirection(resolveContentLocale(locale))}
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
