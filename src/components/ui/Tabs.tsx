"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";

import { cn } from "@/lib/utilities/cn";
import type { Direction } from "@/config/locales";

export interface TabItem {
  id: string;
  label: string;
  /** Optional leading glyph. Decorative only — the label carries the meaning. */
  icon?: ReactNode;
}

interface TabsProps {
  /** Accessible name for the tab list. */
  label: string;
  items: readonly TabItem[];
  value: string;
  onValueChange: (id: string) => void;
  /** Namespaces the generated `id` attributes when several tab sets coexist. */
  idPrefix: string;
  /** Arrow-key direction follows the document direction. */
  dir?: Direction;
  className?: string;
}

export function tabId(prefix: string, id: string) {
  return `${prefix}-tab-${id}`;
}

export function tabPanelId(prefix: string, id: string) {
  return `${prefix}-panel-${id}`;
}

/**
 * WAI-ARIA tab list with roving tabindex.
 *
 * Arrow keys move between tabs (mirrored under RTL), Home/End jump to the ends,
 * and only the selected tab is in the tab sequence.
 */
export function Tabs({
  label,
  items,
  value,
  onValueChange,
  idPrefix,
  dir = "ltr",
  className,
}: TabsProps) {
  const listRef = useRef<HTMLDivElement>(null);

  function focusTab(index: number) {
    const next = items[(index + items.length) % items.length];
    if (!next) return;
    onValueChange(next.id);
    listRef.current
      ?.querySelector<HTMLButtonElement>(`#${CSS.escape(tabId(idPrefix, next.id))}`)
      ?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = items.findIndex((item) => item.id === value);
    if (current < 0) return;

    const forward = dir === "rtl" ? "ArrowLeft" : "ArrowRight";
    const backward = dir === "rtl" ? "ArrowRight" : "ArrowLeft";

    switch (event.key) {
      case forward:
        event.preventDefault();
        focusTab(current + 1);
        break;
      case backward:
        event.preventDefault();
        focusTab(current - 1);
        break;
      case "Home":
        event.preventDefault();
        focusTab(0);
        break;
      case "End":
        event.preventDefault();
        focusTab(items.length - 1);
        break;
      default:
        break;
    }
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      /* Never wraps: a travel product row that breaks onto two lines stops
         reading as a product switcher. Below `sm` the tabs shed their icons to
         fit, and horizontal scrolling is the fallback for long translations. */
      className={cn(
        "gtai-scroll-x flex items-center gap-1.5 overflow-x-auto sm:gap-2",
        className,
      )}
    >
      {items.map((item) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={tabId(idPrefix, item.id)}
            aria-selected={selected}
            aria-controls={tabPanelId(idPrefix, item.id)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onValueChange(item.id)}
            className={cn(
              "rounded-pill gtai-lift inline-flex min-h-11 shrink-0 items-center gap-2 px-3.5 text-sm font-semibold sm:px-4",
              "focus-visible:outline-focus-ring focus-visible:outline-2 focus-visible:outline-offset-2",
              selected
                ? "bg-brand-800 text-brand-on-action shadow-brand"
                : "bg-surface/70 text-foreground-secondary border-border hover:border-brand-300 hover:text-brand-ink border",
            )}
          >
            {item.icon ? (
              <span aria-hidden="true" className="hidden shrink-0 sm:inline-flex">
                {item.icon}
              </span>
            ) : null}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

interface TabPanelProps {
  idPrefix: string;
  id: string;
  active: boolean;
  children: ReactNode;
  className?: string;
}

export function TabPanel({
  idPrefix,
  id,
  active,
  children,
  className,
}: TabPanelProps) {
  return (
    <div
      role="tabpanel"
      id={tabPanelId(idPrefix, id)}
      aria-labelledby={tabId(idPrefix, id)}
      hidden={!active}
      tabIndex={0}
      className={cn("focus-visible:outline-offset-4", className)}
    >
      {active ? children : null}
    </div>
  );
}
