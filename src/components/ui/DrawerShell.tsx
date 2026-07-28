"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { cn } from "@/lib/utilities/cn";
import { useDismissable } from "@/lib/accessibility/use-dismissable";
import { useFocusTrap } from "@/lib/accessibility/use-focus-trap";
import { IconButton } from "@/components/ui/IconButton";
import { CloseIcon } from "@/components/ui/icons";

interface DrawerShellProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name for the dialog. */
  title: string;
  /** Accessible name for the close control. */
  closeLabel: string;
  children: ReactNode;
  className?: string;
}

/**
 * Edge-anchored panel used for mobile navigation.
 *
 * The panel is anchored with logical properties so it slides in from the
 * inline-end edge in LTR and the mirrored edge in RTL. Focus is trapped while
 * open, Escape closes, and background scrolling is locked.
 */
export function DrawerShell({
  open,
  onClose,
  title,
  closeLabel,
  children,
  className,
}: DrawerShellProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useDismissable(open, panelRef, onClose);
  useFocusTrap(open, panelRef);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] lg:hidden">
      <div
        aria-hidden="true"
        onClick={onClose}
        className="bg-brand-950/35 absolute inset-0 backdrop-blur-[2px]"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "absolute inset-y-0 end-0 flex w-[min(22rem,90vw)] flex-col",
          "border-border bg-surface-elevated border-s shadow-xl",
          className,
        )}
      >
        <div className="border-border flex items-center justify-between gap-3 border-b px-4 py-3">
          <span className="text-foreground text-sm font-semibold">{title}</span>
          <IconButton label={closeLabel} onClick={onClose} variant="ghost">
            <CloseIcon />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5">
          {children}
        </div>
      </div>
    </div>
  );
}
