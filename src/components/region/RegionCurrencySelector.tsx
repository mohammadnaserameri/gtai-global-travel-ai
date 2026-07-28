"use client";

import { useId, useMemo } from "react";

import {
  countries,
  featuredCountryCodes,
  getCountry,
  isSupportedCountry,
} from "@/config/countries";
import {
  currencies,
  featuredCurrencyCodes,
  isSupportedCurrency,
} from "@/config/currencies";
import { currencyLabel, currencySymbol } from "@/lib/currency/format";
import { DropdownShell } from "@/components/ui/DropdownShell";
import { SelectShell, type SelectGroup } from "@/components/ui/SelectShell";
import { ChevronDownIcon, CoinsIcon, PinIcon } from "@/components/ui/icons";
import { useRegion } from "@/components/region/RegionProvider";

export interface RegionSelectorLabels {
  label: string;
  countryLabel: string;
  currencyLabel: string;
  selectorLabel: string;
  featured: string;
  allCountries: string;
  allCurrencies: string;
  resolvedFrom: string;
  noGeolocationNotice: string;
  noConversionNotice: string;
  iranNotice: string;
}

interface RegionCurrencySelectorProps {
  labels: RegionSelectorLabels;
  className?: string;
}

/**
 * Country and display-currency selector.
 *
 * Choosing a country applies GTAI's country → currency rule (Canada → CAD,
 * Iran → USD, anything unknown → USD). The currency control below it exists so
 * the visitor can override that rule manually, which is a requirement rather
 * than a convenience: a traveller's billing currency is often not their
 * country's currency.
 */
export function RegionCurrencySelector({
  labels,
  className,
}: RegionCurrencySelectorProps) {
  const { country, currency, countrySource, setCountry, setCurrency } = useRegion();
  const fieldId = useId();

  const countryGroups = useMemo<SelectGroup[]>(() => {
    const featured = featuredCountryCodes
      .map((code) => getCountry(code))
      .filter((item) => item !== undefined)
      .map((item) => ({ value: item.code, label: item.name }));

    const rest = countries
      .filter((item) => !featuredCountryCodes.includes(item.code))
      .map((item) => ({ value: item.code, label: item.name }))
      .sort((a, b) => a.label.localeCompare(b.label));

    return [
      { label: labels.featured, options: featured },
      { label: labels.allCountries, options: rest },
    ];
  }, [labels.featured, labels.allCountries]);

  const currencyGroups = useMemo<SelectGroup[]>(() => {
    const featured = featuredCurrencyCodes.map((code) => ({
      value: code,
      label: currencyLabel(code),
    }));

    const rest = currencies
      .filter((item) => !featuredCurrencyCodes.includes(item.code))
      .map((item) => ({ value: item.code, label: currencyLabel(item.code) }))
      .sort((a, b) => a.label.localeCompare(b.label));

    return [
      { label: labels.featured, options: featured },
      { label: labels.allCurrencies, options: rest },
    ];
  }, [labels.featured, labels.allCurrencies]);

  const activeCountry = getCountry(country);

  return (
    <DropdownShell
      align="end"
      triggerLabel={`${labels.selectorLabel} — ${activeCountry?.name ?? country}, ${currencyLabel(currency)}`}
      triggerClassName={className}
      panelClassName="w-[min(22rem,calc(100vw-2rem))]"
      trigger={
        <>
          <span className="gtai-ltr-numerals font-semibold">
            {/* The country code is dropped below `sm` so the mobile header fits
                at 360px. The currency symbol is the part travellers scan for. */}
            <span className="hidden sm:inline">{country} · </span>
            {currencySymbol(currency)}
          </span>
          <ChevronDownIcon size={14} className="hidden sm:block" />
        </>
      }
    >
      {() => (
        <div className="flex flex-col gap-4">
          <p className="text-foreground-muted text-xs font-semibold tracking-wide uppercase">
            {labels.label}
          </p>

          <SelectShell
            id={`${fieldId}-country`}
            label={labels.countryLabel}
            icon={<PinIcon size={18} />}
            value={country}
            groups={countryGroups}
            hint={
              countrySource === "locale-fallback" ? labels.resolvedFrom : undefined
            }
            onChange={(event) => {
              const next = event.target.value;
              if (isSupportedCountry(next)) setCountry(next);
            }}
          />

          <SelectShell
            id={`${fieldId}-currency`}
            label={labels.currencyLabel}
            icon={<CoinsIcon size={18} />}
            value={currency}
            groups={currencyGroups}
            onChange={(event) => {
              const next = event.target.value;
              if (isSupportedCurrency(next)) setCurrency(next);
            }}
          />

          <div className="border-border text-foreground-muted flex flex-col gap-2 border-t pt-3 text-xs leading-relaxed">
            <p>{labels.noGeolocationNotice}</p>
            <p>{labels.noConversionNotice}</p>
            {country === "IR" ? (
              <p className="text-brand-ink font-medium">{labels.iranNotice}</p>
            ) : null}
          </div>
        </div>
      )}
    </DropdownShell>
  );
}
