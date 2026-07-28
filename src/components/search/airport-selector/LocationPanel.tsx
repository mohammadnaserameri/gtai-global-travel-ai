"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { cn } from "@/lib/utilities/cn";
import { useFocusTrap } from "@/lib/accessibility/use-focus-trap";
import { IconButton } from "@/components/ui/IconButton";
import { CloseIcon } from "@/components/ui/icons";

interface LocationPanelProps {
  /** `popover` anchors to the field; `sheet` is a modal surface on mobile. */
  variant: "popover" | "sheet";
  /** Sheet-only heading, e.g. "Choose your origin". */
  title: string;
  closeLabel: string;
  /** Which edge a popover anchors to. Logical, so it mirrors under RTL. */
  align: "start" | "end";
  onClose: () => void;
  /** Rendered above the results — the sheet's own search input. */
  header?: ReactNode;
  children: ReactNode;
}

/**
 * The surface the suggestions render in.
 *
 * Desktop uses an anchored popover that stays visually attached to its field.
 * Mobile uses a true modal sheet: focus is trapped, background scroll is
 * locked, and dismissing restores focus to the field that opened it.
 *
 * Width is capped with `min(…, calc(100vw - 2rem))` so the popover can never
 * push the page into horizontal overflow, and positioning uses logical
 * properties so both variants mirror correctly in Persian and Arabic.
 */
export function LocationPanel({
  variant,
  title,
  closeLabel,
  align,
  onClose,
  header,
  children,
}: LocationPanelProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const isSheet = variant === "sheet";

  useFocusTrap(isSheet, sheetRef);

  useEffect(() => {
    if (!isSheet) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isSheet]);

  if (isSheet) {
    return (
      <div className="fixed inset-0 z-[120]">
        <div
          aria-hidden="true"
          onClick={onClose}
          className="bg-brand-950/40 absolute inset-0"
        />
        <div
          ref={sheetRef}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className={cn(
            "bg-surface-elevated absolute inset-x-0 top-0 bottom-0 flex flex-col",
            "pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]",
          )}
        >
          <div className="border-border flex items-center justify-between gap-3 border-b px-4 py-3">
            <h2 className="text-foreground text-sm font-semibold">{title}</h2>
            <IconButton label={closeLabel} variant="ghost" onClick={onClose}>
              <CloseIcon />
            </IconButton>
          </div>

          {header ? <div className="px-4 pt-4">{header}</div> : null}

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 py-2">
            {children}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "absolute top-[calc(100%+0.5rem)] z-50 w-[min(30rem,calc(100vw-2rem))]",
        "border-border bg-surface-elevated max-h-[26rem] overflow-y-auto",
        "overscroll-contain rounded-xl border p-1 shadow-xl",
        align === "end" ? "end-0" : "start-0",
      )}
    >
      {children}
    </div>
  );
}
