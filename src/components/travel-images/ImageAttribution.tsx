import type { TravelImageAsset } from "@/features/travel-images/travel-image-types";
import { cn } from "@/lib/utilities/cn";

interface ImageAttributionProps {
  asset: TravelImageAsset;
  className?: string;
}

export function ImageAttribution({ asset, className }: ImageAttributionProps) {
  if (asset.isFallback) return null;

  const creatorHref = asset.attribution.creatorUrl ?? asset.sourcePageUrl;
  const providerHref = asset.attribution.providerUrl;

  return (
    <span
      className={cn(
        "bg-brand-950/75 inline-flex max-w-[calc(100%-1rem)] items-center gap-1 rounded-md px-2 py-1 text-[0.65rem] leading-none text-white backdrop-blur-sm",
        className,
      )}
    >
      {creatorHref ? (
        <a
          href={creatorHref}
          target="_blank"
          rel="noreferrer noopener"
          className="truncate underline-offset-2 hover:underline"
        >
          {asset.attribution.creatorName}
        </a>
      ) : (
        <span className="truncate">{asset.attribution.creatorName}</span>
      )}
      <span aria-hidden="true">·</span>
      {providerHref ? (
        <a
          href={providerHref}
          target="_blank"
          rel="noreferrer noopener"
          className="shrink-0 underline-offset-2 hover:underline"
        >
          {asset.attribution.providerName}
        </a>
      ) : (
        <span className="shrink-0">{asset.attribution.providerName}</span>
      )}
    </span>
  );
}
