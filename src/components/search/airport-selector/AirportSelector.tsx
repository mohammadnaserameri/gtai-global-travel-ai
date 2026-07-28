"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import type {
  LocationContext,
  TravelLocation,
} from "@/features/locations/location-types";
import {
  locationAnnouncement,
  locationFieldValue,
} from "@/features/locations/location-presentation";
import { useLocationSearch } from "@/features/locations/use-location-search";
import { useRecentLocations } from "@/features/locations/use-recent-locations";
import { useMediaQuery } from "@/lib/utilities/use-media-query";
import { useDismissable } from "@/lib/accessibility/use-dismissable";
import { cn } from "@/lib/utilities/cn";
import { CloseIcon, PinIcon, SearchIcon } from "@/components/ui/icons";
import { LocationPanel } from "@/components/search/airport-selector/LocationPanel";
import {
  LocationResultList,
  type LocationListLabels,
} from "@/components/search/airport-selector/LocationResultList";

export interface AirportSelectorLabels extends LocationListLabels {
  readonly originTitle: string;
  readonly destinationTitle: string;
  readonly inputLabel: string;
  readonly inputPlaceholder: string;
  readonly clearOrigin: string;
  readonly clearDestination: string;
  readonly close: string;
  readonly resultCount: string;
  readonly selectedOrigin: string;
  readonly selectedDestination: string;
}

interface AirportSelectorProps {
  id: string;
  context: LocationContext;
  /** Visible field label — "From" or "To". */
  label: string;
  labels: AirportSelectorLabels;
  locale: string;
  value: TravelLocation | null;
  query: string;
  onQueryChange: (query: string) => void;
  onSelect: (location: TravelLocation) => void;
  onClear: () => void;
  invalid?: boolean;
  errorMessage?: string;
  /** Called after a selection so the form can advance focus. */
  onSelectionComplete?: () => void;
  className?: string;
}

/** Fills `{count}` / `{name}` placeholders in a localized template. */
function formatMessage(
  template: string,
  values: Readonly<Record<string, string | number>>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

/**
 * Accessible location combobox for the origin and destination fields.
 *
 * The rule that shapes this whole component: **a typed query is never a
 * selected location**. `query` and `value` are separate props, editing the text
 * clears any previously selected entity, nothing is auto-selected on blur or on
 * Enter without an active row, and the form validates on `value` alone.
 *
 * Desktop renders the field itself as the combobox input under an anchored
 * popover. Mobile renders the field as a button that opens a modal sheet whose
 * own input is the combobox — the same state, presented the way each surface
 * expects.
 */
export function AirportSelector({
  id,
  context,
  label,
  labels,
  locale,
  value,
  query,
  onQueryChange,
  onSelect,
  onClear,
  invalid = false,
  errorMessage,
  onSelectionComplete,
  className,
}: AirportSelectorProps) {
  const listboxId = `${id}-listbox`;
  const errorId = `${id}-error`;

  const [open, setOpen] = useState(false);
  const [rawActiveIndex, setRawActiveIndex] = useState(-1);
  const [selectionMessage, setSelectionMessage] = useState("");

  const containerRef = useRef<HTMLDivElement>(null);
  const fieldInputRef = useRef<HTMLInputElement>(null);
  const sheetInputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Map<number, HTMLLIElement>>(new Map());

  const isDesktop = useMediaQuery("(min-width: 768px)", true);
  const { recentIds, remember, clear: clearRecent } = useRecentLocations(context);

  const { status, groups, total, retry } = useLocationSearch({
    enabled: open,
    query,
    context,
    locale,
    recentIds,
  });

  const flat = useMemo(() => groups.flatMap((group) => group.locations), [groups]);

  const optionId = useCallback(
    (index: number) => `${listboxId}-option-${index}`,
    [listboxId],
  );

  /**
   * Clamped during render rather than reset in an effect: if the result set
   * shrinks, a stale index simply stops being active, so Enter can never act
   * on a row that is no longer displayed.
   */
  const activeIndex = rawActiveIndex < flat.length ? rawActiveIndex : -1;

  const setActiveIndex = setRawActiveIndex;

  const close = useCallback(() => {
    setOpen(false);
    setRawActiveIndex(-1);
  }, []);

  useDismissable(open && isDesktop, containerRef, close);

  /**
   * Live-region text is derived, not stored, so it cannot fire on every render.
   * While the panel is open it reports the result count; once closed it holds
   * the last selection confirmation.
   */
  const announcement =
    open && status === "ready"
      ? formatMessage(labels.resultCount, { count: total })
      : selectionMessage;

  useEffect(() => {
    if (!open) return;
    if (isDesktop) fieldInputRef.current?.focus();
    else sheetInputRef.current?.focus();
  }, [open, isDesktop]);

  const scrollActiveIntoView = useCallback((index: number) => {
    optionRefs.current.get(index)?.scrollIntoView({ block: "nearest" });
  }, []);

  const handleSelect = useCallback(
    (location: TravelLocation) => {
      onSelect(location);
      remember(location);
      setSelectionMessage(
        formatMessage(
          context === "origin" ? labels.selectedOrigin : labels.selectedDestination,
          { name: locationAnnouncement(location, locale, labels) },
        ),
      );
      close();
      onSelectionComplete?.();
    },
    [onSelect, remember, context, labels, locale, close, onSelectionComplete],
  );

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        close();
        if (isDesktop) fieldInputRef.current?.focus();
        else triggerRef.current?.focus();
      }
      return;
    }

    if (!open) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setOpen(true);
      }
      return;
    }

    const last = flat.length - 1;

    switch (event.key) {
      case "ArrowDown": {
        event.preventDefault();
        const next = activeIndex >= last ? 0 : activeIndex + 1;
        setActiveIndex(next);
        scrollActiveIntoView(next);
        break;
      }
      case "ArrowUp": {
        event.preventDefault();
        const next = activeIndex <= 0 ? last : activeIndex - 1;
        setActiveIndex(next);
        scrollActiveIntoView(next);
        break;
      }
      case "Home": {
        if (flat.length === 0) break;
        event.preventDefault();
        setActiveIndex(0);
        scrollActiveIntoView(0);
        break;
      }
      case "End": {
        if (flat.length === 0) break;
        event.preventDefault();
        setActiveIndex(last);
        scrollActiveIntoView(last);
        break;
      }
      case "Enter": {
        // Enter without an active row must never invent a location.
        const active = activeIndex >= 0 ? flat[activeIndex] : undefined;
        if (active) {
          event.preventDefault();
          handleSelect(active);
        }
        break;
      }
      default:
        break;
    }
  }

  function handleQueryChange(next: string) {
    onQueryChange(next);
    setRawActiveIndex(-1);
    if (!open) setOpen(true);
  }

  const displayValue = value ? locationFieldValue(value, locale, labels) : query;
  const clearLabel =
    context === "origin" ? labels.clearOrigin : labels.clearDestination;
  const title = context === "origin" ? labels.originTitle : labels.destinationTitle;
  const showClear = Boolean(value) || query.length > 0;

  const comboboxProps = {
    role: "combobox" as const,
    "aria-expanded": open,
    "aria-controls": open ? listboxId : undefined,
    "aria-autocomplete": "list" as const,
    "aria-activedescendant":
      open && activeIndex >= 0 ? optionId(activeIndex) : undefined,
    "aria-invalid": invalid || undefined,
    "aria-describedby": invalid && errorMessage ? errorId : undefined,
    autoComplete: "off" as const,
    spellCheck: false,
  };

  const results = (
    <LocationResultList
      groups={groups}
      flat={flat}
      status={status}
      activeIndex={activeIndex}
      locale={locale}
      labels={labels}
      listboxId={listboxId}
      optionId={optionId}
      hasQuery={query.trim().length > 0}
      showClearRecent={recentIds.length > 0}
      onSelect={handleSelect}
      onClearRecent={clearRecent}
      onClearQuery={() => {
        onClear();
        if (isDesktop) fieldInputRef.current?.focus();
        else sheetInputRef.current?.focus();
      }}
      onRetry={retry}
      registerOption={(index, node) => {
        if (node) optionRefs.current.set(index, node);
        else optionRefs.current.delete(index);
      }}
    />
  );

  return (
    <div
      ref={containerRef}
      className={cn("relative flex flex-col gap-1.5", className)}
    >
      <label
        htmlFor={`${id}-input`}
        className="text-foreground-muted text-xs font-semibold tracking-wide uppercase"
      >
        {label}
      </label>

      <div
        className={cn(
          "flex min-h-12 items-center gap-2.5 rounded-lg border px-3.5",
          "bg-surface gtai-lift",
          invalid
            ? "border-danger"
            : "border-border hover:border-border-strong focus-within:border-brand-400 focus-within:shadow-sm",
        )}
      >
        <span aria-hidden="true" className="text-brand-600 shrink-0">
          <PinIcon size={18} />
        </span>

        {isDesktop ? (
          <input
            {...comboboxProps}
            ref={fieldInputRef}
            id={`${id}-input`}
            value={displayValue}
            placeholder={labels.inputPlaceholder}
            onChange={(event) => handleQueryChange(event.target.value)}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            className="text-foreground placeholder:text-foreground-muted/80 min-w-0 flex-1 bg-transparent py-2.5 text-sm focus:outline-none"
          />
        ) : (
          <button
            ref={triggerRef}
            type="button"
            id={`${id}-input`}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-describedby={invalid && errorMessage ? errorId : undefined}
            onClick={() => setOpen(true)}
            className="min-w-0 flex-1 py-2.5 text-start text-sm focus:outline-none"
          >
            {displayValue ? (
              <span className="text-foreground block truncate">{displayValue}</span>
            ) : (
              <span className="text-foreground-muted/80 block truncate">
                {labels.inputPlaceholder}
              </span>
            )}
          </button>
        )}

        {showClear ? (
          <button
            type="button"
            aria-label={clearLabel}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => {
              onClear();
              if (isDesktop) fieldInputRef.current?.focus();
            }}
            className="text-foreground-muted hover:text-foreground focus-visible:outline-focus-ring inline-flex size-6 shrink-0 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <CloseIcon size={14} />
          </button>
        ) : null}
      </div>

      {invalid && errorMessage ? (
        <p id={errorId} className="text-danger flex items-start gap-1 text-xs">
          <span aria-hidden="true">•</span>
          {errorMessage}
        </p>
      ) : null}

      {open && isDesktop ? (
        <LocationPanel
          variant="popover"
          title={title}
          closeLabel={labels.close}
          align={context === "origin" ? "start" : "end"}
          onClose={close}
        >
          {results}
        </LocationPanel>
      ) : null}

      {open && !isDesktop ? (
        <LocationPanel
          variant="sheet"
          title={title}
          closeLabel={labels.close}
          align="start"
          onClose={() => {
            close();
            triggerRef.current?.focus();
          }}
          header={
            <div className="border-border bg-surface flex min-h-12 items-center gap-2.5 rounded-lg border px-3.5">
              <span aria-hidden="true" className="text-brand-600 shrink-0">
                <SearchIcon size={18} />
              </span>
              <input
                {...comboboxProps}
                ref={sheetInputRef}
                id={`${id}-sheet-input`}
                aria-label={labels.inputLabel}
                value={query}
                placeholder={labels.inputPlaceholder}
                onChange={(event) => handleQueryChange(event.target.value)}
                onKeyDown={onKeyDown}
                className="text-foreground placeholder:text-foreground-muted/80 min-w-0 flex-1 bg-transparent py-2.5 text-sm focus:outline-none"
              />
            </div>
          }
        >
          {results}
        </LocationPanel>
      ) : null}

      <span
        role="status"
        aria-live="polite"
        className="sr-only"
        data-gtai-selector-status={context}
      >
        {announcement}
      </span>
    </div>
  );
}
