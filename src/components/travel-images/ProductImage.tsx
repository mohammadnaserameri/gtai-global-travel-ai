import Image from "next/image";

import type { TravelImageAsset } from "@/features/travel-images/travel-image-types";
import { cn } from "@/lib/utilities/cn";
import { ImageAttribution } from "@/components/travel-images/ImageAttribution";

interface ProductImageProps {
  asset: TravelImageAsset;
  alt: string;
  className?: string;
  sizes?: string;
}

export function ProductImage({
  asset,
  alt,
  className,
  sizes = "(max-width: 1024px) 100vw, 1200px",
}: ProductImageProps) {
  return (
    <div
      className={cn(
        "border-border bg-background-muted relative h-40 overflow-hidden rounded-2xl border sm:h-52",
        className,
      )}
    >
      <Image
        src={asset.src}
        alt={alt}
        fill
        sizes={sizes}
        className="object-cover"
      />
      <div className="from-brand-950/50 absolute inset-0 bg-linear-to-t via-transparent to-transparent" />
      <ImageAttribution asset={asset} className="absolute end-3 bottom-3" />
    </div>
  );
}
