import type { Metadata } from "next";

import { getDirection } from "@/config/locales";
import { getDictionary } from "@/i18n/get-dictionary";
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
  const { meta } = await getDictionary(locale);
  return { title: meta.packages.title, description: meta.packages.description };
}

export default async function PackagesPage({ params }: PageProps) {
  const { locale } = await params;
  const dictionary = await getDictionary(locale);

  return (
    <ProductPageShell
      dictionary={dictionary}
      page={dictionary.pages.packages}
      dir={getDirection(locale)}
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
