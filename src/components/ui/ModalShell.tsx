"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { cn } from "@/lib/utilities/cn";
import { useDismissable } from "@/lib/accessibility/use-dismissable";
import { useFocusTrap } from "@/lib/accessibility/use-focus-trap";
import { IconButton } from "@/components/ui/IconButton";
import { CloseIcon } from "@/components/ui/icons";

interface ModalShellProps {
  open: boolean;
  onClose: () => void;
  title: string;
  closeLabel: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

/**
 * Centred dialog surface.
 *
 * Shares dismissal and focus-trap behaviour with {@link DrawerShell} so both
 * overlays behave identically for keyboard and screen-reader users.
 */
export function ModalShell({
  open,
  onClose,
  title,
  closeLabel,
  description,
  children,
  className,
}: ModalShellProps) {
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
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center">
      <div
        aria-hidden="true"
        onClick={onClose}
        className="bg-brand-950/35 absolute inset-0 backdrop-blur-[2px]"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="gtai-modal-title"
        aria-describedby={description ? "gtai-modal-description" : undefined}
        className={cn(
          "border-border bg-surface-elevated relative w-full max-w-lg rounded-2xl border p-5 shadow-xl sm:p-6",
          className,
        )}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2
              id="gtai-modal-title"
              className="text-foreground text-lg font-semibold"
            >
              {title}
            </h2>
            {description ? (
              <p
                id="gtai-modal-description"
                className="text-foreground-muted mt-1 text-sm"
              >
                {description}
              </p>
            ) : null}
          </div>
          <IconButton label={closeLabel} onClick={onClose} variant="ghost">
            <CloseIcon />
          </IconButton>
        </div>
        {children}
      </div>
    </div>
  );
}
