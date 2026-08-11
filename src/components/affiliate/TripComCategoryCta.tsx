import { Alert } from "@/components/ui/Alert";
import { ButtonLink } from "@/components/ui/Button";
import {
  getTripComAffiliateProviderMetadata,
  type TripComVertical,
} from "@/server/affiliate/trip-com/trip-com-affiliate";

interface Props {
  vertical: TripComVertical;
  title: string;
  description: string;
  disclosure: string;
  cta: string;
}

export function TripComCategoryCta({
  vertical,
  title,
  description,
  disclosure,
  cta,
}: Props) {
  const metadata = getTripComAffiliateProviderMetadata();
  const available =
    vertical === "hotel"
      ? metadata.hotelRedirectAvailable
      : vertical === "train"
        ? metadata.trainRedirectAvailable
        : vertical === "attraction"
          ? metadata.attractionRedirectAvailable
          : vertical === "package"
            ? metadata.packageRedirectAvailable
            : metadata.carRentalRedirectAvailable;
  if (!available) return null;
  return (
    <Alert tone="brand" title={title} className="mt-8">
      <p>{description}</p>
      <p className="mt-1.5 text-sm">{disclosure}</p>
      <ButtonLink href={`/api/outbound/trip-com/${vertical}`} className="mt-4">
        {cta}
      </ButtonLink>
    </Alert>
  );
}
