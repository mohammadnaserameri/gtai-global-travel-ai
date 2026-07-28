"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { CountryCode } from "@/config/countries";
import type { CurrencyCode } from "@/config/currencies";
import {
  getCountryCurrency,
  resolveUserRegion,
  type CurrencySource,
  type RegionSource,
} from "@/lib/region/resolve-region";

interface RegionContextValue {
  country: CountryCode;
  currency: CurrencyCode;
  countrySource: RegionSource;
  currencySource: CurrencySource;
  /** Selecting a country re-derives the display currency for that country. */
  setCountry: (country: CountryCode) => void;
  /** An explicit currency choice overrides the country rule. */
  setCurrency: (currency: CurrencyCode) => void;
}

const RegionContext = createContext<RegionContextValue | null>(null);

interface RegionProviderProps {
  /** Active locale — used only as a transparent country heuristic. */
  locale: string;
  children: ReactNode;
}

/**
 * Holds the visitor's display region for the current session.
 *
 * Deliberate design choices:
 * - state lives in memory only. Nothing is written to cookies, localStorage or
 *   a server, so GTAI keeps no hidden record of where a visitor is;
 * - the initial value comes from the locale, never from IP or GPS. GTAI does
 *   not geolocate visitors in V1 and the UI says so;
 * - no price is converted, because no real travel price exists yet.
 */
export function RegionProvider({ locale, children }: RegionProviderProps) {
  const initial = useMemo(() => resolveUserRegion({ locale }), [locale]);

  const [state, setState] = useState({
    country: initial.country,
    currency: initial.currency,
    countrySource: initial.countrySource,
    currencySource: initial.currencySource,
  });

  const setCountry = useCallback((country: CountryCode) => {
    setState({
      country,
      currency: getCountryCurrency(country),
      countrySource: "user-selection",
      currencySource: "country-rule",
    });
  }, []);

  const setCurrency = useCallback((currency: CurrencyCode) => {
    setState((previous) => ({
      ...previous,
      currency,
      currencySource: "user-selection",
    }));
  }, []);

  const value = useMemo<RegionContextValue>(
    () => ({ ...state, setCountry, setCurrency }),
    [state, setCountry, setCurrency],
  );

  return <RegionContext.Provider value={value}>{children}</RegionContext.Provider>;
}

export function useRegion(): RegionContextValue {
  const context = useContext(RegionContext);
  if (!context) {
    throw new Error("useRegion must be used inside a RegionProvider.");
  }
  return context;
}
