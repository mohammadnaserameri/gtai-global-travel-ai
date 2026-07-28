"use client";

import { useId, useState, type FormEvent } from "react";

import type { Direction } from "@/config/locales";
import type { Dictionary } from "@/i18n/get-dictionary";
import { cn } from "@/lib/utilities/cn";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { InputShell } from "@/components/ui/InputShell";
import { SelectShell } from "@/components/ui/SelectShell";
import { Tabs, TabPanel, type TabItem } from "@/components/ui/Tabs";
import {
  TripTypeSelector,
  type TripType,
} from "@/components/search/TripTypeSelector";
import {
  CalendarIcon,
  CarIcon,
  FlightIcon,
  PackageIcon,
  PinIcon,
  SearchIcon,
  SeatIcon,
  StayIcon,
  TravelersIcon,
} from "@/components/ui/icons";

type ProductId = "flights" | "stays" | "cars" | "packages";

interface SearchShellProps {
  tabs: Dictionary["searchTabs"];
  labels: Dictionary["search"];
  dir?: Direction;
  /** Which product tab opens first. Product pages preselect their own. */
  defaultProduct?: ProductId;
  className?: string;
}

/**
 * The standard travel search surface.
 *
 * This is a **presentational shell**. There is no airport dataset, no
 * autocomplete, no provider query and no results route — submitting simply
 * announces that search is not connected in this release. The controls are
 * nevertheless real, labelled form elements so focus order, mobile keyboards
 * and screen-reader output can be verified now rather than retrofitted later.
 */
export function SearchShell({
  tabs,
  labels,
  dir = "ltr",
  defaultProduct = "flights",
  className,
}: SearchShellProps) {
  const idPrefix = useId().replace(/:/g, "");
  const [product, setProduct] = useState<ProductId>(defaultProduct);
  const [tripType, setTripType] = useState<TripType>("roundTrip");
  const [announced, setAnnounced] = useState(false);

  const items: TabItem[] = [
    { id: "flights", label: tabs.flights, icon: <FlightIcon size={18} /> },
    { id: "stays", label: tabs.stays, icon: <StayIcon size={18} /> },
    { id: "cars", label: tabs.cars, icon: <CarIcon size={18} /> },
    { id: "packages", label: tabs.packages, icon: <PackageIcon size={18} /> },
  ];

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    // Search is intentionally not implemented in V1. Rather than failing
    // silently, the shell states that plainly in a live region.
    event.preventDefault();
    setAnnounced(true);
  }

  const cabinOptions = [
    { value: "economy", label: labels.options.cabin.economy },
    { value: "premium", label: labels.options.cabin.premiumEconomy },
    { value: "business", label: labels.options.cabin.business },
    { value: "first", label: labels.options.cabin.first },
  ];

  const field = (id: string) => `${idPrefix}-${id}`;

  return (
    <div
      className={cn(
        "border-border bg-surface-elevated rounded-2xl border p-4 shadow-xl sm:p-6",
        className,
      )}
    >
      <h2 className="sr-only">{labels.heading}</h2>

      <Tabs
        label={tabs.label}
        items={items}
        value={product}
        onValueChange={(id) => {
          setProduct(id as ProductId);
          setAnnounced(false);
        }}
        idPrefix={idPrefix}
        dir={dir}
        className="mb-5"
      />

      <form onSubmit={onSubmit} noValidate>
        <TabPanel idPrefix={idPrefix} id="flights" active={product === "flights"}>
          <TripTypeSelector
            label={labels.tripType.label}
            value={tripType}
            onChange={setTripType}
            name={field("trip-type")}
            options={{
              roundTrip: labels.tripType.roundTrip,
              oneWay: labels.tripType.oneWay,
              multiCity: labels.tripType.multiCity,
            }}
            className="mb-4"
          />

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-12">
            <InputShell
              id={field("from")}
              label={labels.fields.from}
              placeholder={labels.placeholders.from}
              icon={<PinIcon size={18} />}
              className="lg:col-span-3"
            />
            <InputShell
              id={field("to")}
              label={labels.fields.to}
              placeholder={labels.placeholders.to}
              icon={<PinIcon size={18} />}
              className="lg:col-span-3"
            />
            <InputShell
              id={field("departure")}
              label={labels.fields.departure}
              type="date"
              icon={<CalendarIcon size={18} />}
              className="lg:col-span-2"
            />
            <InputShell
              id={field("return")}
              label={labels.fields.return}
              type="date"
              icon={<CalendarIcon size={18} />}
              disabled={tripType !== "roundTrip"}
              className={cn(
                "lg:col-span-2",
                tripType !== "roundTrip" && "opacity-55",
              )}
            />
            <SelectShell
              id={field("travelers")}
              label={labels.fields.travelers}
              icon={<TravelersIcon size={18} />}
              options={[{ value: "1", label: labels.options.travelersValue }]}
              className="lg:col-span-2"
            />
            <SelectShell
              id={field("cabin")}
              label={labels.fields.cabinClass}
              icon={<SeatIcon size={18} />}
              options={cabinOptions}
              className="sm:col-span-2 lg:col-span-3"
            />
          </div>
        </TabPanel>

        <TabPanel idPrefix={idPrefix} id="stays" active={product === "stays"}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-12">
            <InputShell
              id={field("stay-destination")}
              label={labels.fields.destination}
              placeholder={labels.placeholders.destination}
              icon={<PinIcon size={18} />}
              className="sm:col-span-2 lg:col-span-4"
            />
            <InputShell
              id={field("check-in")}
              label={labels.fields.checkIn}
              type="date"
              icon={<CalendarIcon size={18} />}
              className="lg:col-span-2"
            />
            <InputShell
              id={field("check-out")}
              label={labels.fields.checkOut}
              type="date"
              icon={<CalendarIcon size={18} />}
              className="lg:col-span-2"
            />
            <SelectShell
              id={field("guests")}
              label={labels.fields.guests}
              icon={<TravelersIcon size={18} />}
              options={[{ value: "2", label: labels.options.guestsValue }]}
              className="sm:col-span-2 lg:col-span-4"
            />
          </div>
        </TabPanel>

        <TabPanel idPrefix={idPrefix} id="cars" active={product === "cars"}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-12">
            <InputShell
              id={field("pick-up")}
              label={labels.fields.pickUp}
              placeholder={labels.placeholders.pickUp}
              icon={<PinIcon size={18} />}
              className="lg:col-span-3"
            />
            <InputShell
              id={field("drop-off")}
              label={labels.fields.dropOff}
              placeholder={labels.placeholders.pickUp}
              icon={<PinIcon size={18} />}
              className="lg:col-span-3"
            />
            <InputShell
              id={field("pick-up-date")}
              label={labels.fields.pickUpDate}
              type="date"
              icon={<CalendarIcon size={18} />}
              className="lg:col-span-2"
            />
            <InputShell
              id={field("drop-off-date")}
              label={labels.fields.dropOffDate}
              type="date"
              icon={<CalendarIcon size={18} />}
              className="lg:col-span-2"
            />
            <SelectShell
              id={field("driver-age")}
              label={labels.fields.driverAge}
              icon={<CarIcon size={18} />}
              options={[{ value: "30-65", label: labels.options.driverAgeValue }]}
              className="sm:col-span-2 lg:col-span-2"
            />
          </div>
        </TabPanel>

        <TabPanel idPrefix={idPrefix} id="packages" active={product === "packages"}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-12">
            <InputShell
              id={field("package-origin")}
              label={labels.fields.origin}
              placeholder={labels.placeholders.from}
              icon={<PinIcon size={18} />}
              className="lg:col-span-3"
            />
            <InputShell
              id={field("package-destination")}
              label={labels.fields.packageDestination}
              placeholder={labels.placeholders.destination}
              icon={<PinIcon size={18} />}
              className="lg:col-span-3"
            />
            <InputShell
              id={field("package-departure")}
              label={labels.fields.departure}
              type="date"
              icon={<CalendarIcon size={18} />}
              className="lg:col-span-2"
            />
            <InputShell
              id={field("package-return")}
              label={labels.fields.return}
              type="date"
              icon={<CalendarIcon size={18} />}
              className="lg:col-span-2"
            />
            <SelectShell
              id={field("package-travelers")}
              label={labels.fields.packageTravelers}
              icon={<TravelersIcon size={18} />}
              options={[{ value: "1", label: labels.options.travelersValue }]}
              className="sm:col-span-2 lg:col-span-2"
            />
          </div>
        </TabPanel>

        <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-foreground-muted max-w-md text-xs leading-relaxed">
            {labels.helper}
          </p>
          <Button type="submit" size="lg" className="w-full sm:w-auto sm:min-w-40">
            <SearchIcon size={18} />
            {labels.submit}
          </Button>
        </div>

        <div aria-live="polite" className="mt-4 empty:mt-0">
          {announced ? (
            <Alert tone="brand" live>
              {labels.submitDisabledHint} {labels.notice}
            </Alert>
          ) : null}
        </div>
      </form>
    </div>
  );
}
