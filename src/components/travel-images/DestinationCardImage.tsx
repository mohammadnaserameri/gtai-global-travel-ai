import Image from "next/image";

import type { TravelImageAsset } from "@/features/travel-images/travel-image-types";
import { ImageAttribution } from "@/components/travel-images/ImageAttribution";

interface DestinationCardImageProps {
  asset: TravelImageAsset;
  alt: string;
}

export function DestinationCardImage({ asset, alt }: DestinationCardImageProps) {
  return (
    <div className="bg-background-muted relative h-24 overflow-hidden sm:h-32">
      <Image
        src={asset.src}
        alt={alt}
        fill
        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
        className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
      />
      <div className="from-brand-950/45 absolute inset-0 bg-linear-to-t to-transparent" />
      <ImageAttribution asset={asset} className="absolute end-2 bottom-2" />
    </div>
  );
}
