import Image from "next/image";

import type { TravelImageAsset } from "@/features/travel-images/travel-image-types";
import { ImageAttribution } from "@/components/travel-images/ImageAttribution";

interface TravelHeroImageProps {
  asset: TravelImageAsset;
}

export function TravelHeroImage({ asset }: TravelHeroImageProps) {
  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
      <Image
        src={asset.src}
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover object-center"
      />
      <div className="from-background via-background/90 to-background/45 absolute inset-0 bg-linear-to-r rtl:bg-linear-to-l" />
      <div className="from-background/20 to-background/70 absolute inset-0 bg-linear-to-b via-transparent" />
      <ImageAttribution asset={asset} className="absolute end-3 bottom-3" />
    </div>
  );
}
