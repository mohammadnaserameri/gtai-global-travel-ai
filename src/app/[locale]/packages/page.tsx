import type { Metadata } from "next";

import { getDirection, resolveContentLocale } from "@/config/locales";
import { getDictionary } from "@/i18n/get-dictionary";
import { buildPublicMetadata } from "@/lib/seo/public-metadata";
import { PRODUCT_PAGE_PATHS } from "@/config/public-company-profile";
import { ProductPageShell } from "@/components/layout/ProductPageShell";
import {
  CoinsIcon,
  LayersIcon,
  PackageIcon,
  SparkIcon,
} from "@/components/ui/icons";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const { meta } = await getDictionary(resolveContentLocale(locale));
  return buildPublicMetadata({
    locale,
    title: meta.packages.title,
    description: meta.packages.description,
    siteName: meta.siteName,
    path: PRODUCT_PAGE_PATHS.packages,
    // Public and honest, but not a page worth returning for a search:
    // this route describes a capability GTAI has not built yet.
    indexable: false,
  });
}

export default async function PackagesPage({ params }: PageProps) {
  const { locale } = await params;
  const dictionary = await getDictionary(resolveContentLocale(locale));

  return (
    <ProductPageShell
      dictionary={dictionary}
      page={dictionary.pages.packages}
      dir={getDirection(resolveContentLocale(locale))}
      locale={locale}
      searchProduct="packages"
      icon={<PackageIcon size={22} />}
      plannedIcons={[
        <CoinsIcon key="bundle" size={20} />,
        <LayersIcon key="included" size={20} />,
        <PackageIcon key="flexible" size={20} />,
        <SparkIcon key="optimizer" size={20} />,
      ]}
    />
  );
}
