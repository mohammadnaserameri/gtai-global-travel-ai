"use client";

import { useState } from "react";

import { cn } from "@/lib/utilities/cn";
import { DrawerShell } from "@/components/ui/DrawerShell";
import { IconButton } from "@/components/ui/IconButton";
import { MenuIcon } from "@/components/ui/icons";
import { NavLink } from "@/components/navigation/NavLink";
import {
  LanguageSelector,
  type LanguageSelectorLabels,
} from "@/components/navigation/LanguageSelector";
import {
  RegionCurrencySelector,
  type RegionSelectorLabels,
} from "@/components/region/RegionCurrencySelector";

export interface MobileNavItem {
  href: string;
  label: string;
}

interface MobileNavProps {
  locale: string;
  primary: readonly MobileNavItem[];
  utility: readonly MobileNavItem[];
  labels: {
    openMenu: string;
    closeMenu: string;
    menu: string;
    primaryLabel: string;
    utilityLabel: string;
    signIn: string;
    signInHint: string;
  };
  languageLabels: LanguageSelectorLabels;
  regionLabels: RegionSelectorLabels;
}

/**
 * Mobile navigation drawer.
 *
 * The drawer traps focus, closes on Escape or backdrop press, and restores
 * focus to the menu button — see `DrawerShell`. Selecting a destination closes
 * it so the page below is never left behind a locked overlay.
 */
export function MobileNav({
  locale,
  primary,
  utility,
  labels,
  languageLabels,
  regionLabels,
}: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <>
      <IconButton
        label={open ? labels.closeMenu : labels.openMenu}
        aria-expanded={open}
        variant="outline"
        className="lg:hidden"
        onClick={() => setOpen(true)}
      >
        <MenuIcon />
      </IconButton>

      <DrawerShell
        open={open}
        onClose={close}
        title={labels.menu}
        closeLabel={labels.closeMenu}
      >
        <nav aria-label={labels.primaryLabel}>
          <ul className="flex flex-col gap-1">
            {primary.map((item) => (
              <li key={item.href}>
                <NavLink
                  href={item.href}
                  label={item.label}
                  variant="drawer"
                  onNavigate={close}
                />
              </li>
            ))}
          </ul>
        </nav>

        <hr className="border-border my-4" />

        <nav aria-label={labels.utilityLabel}>
          <ul className="flex flex-col gap-1">
            {utility.map((item) => (
              <li key={item.href}>
                <NavLink
                  href={item.href}
                  label={item.label}
                  variant="drawer"
                  onNavigate={close}
                />
              </li>
            ))}
          </ul>
        </nav>

        <hr className="border-border my-4" />

        <div className="flex flex-col gap-3">
          <LanguageSelector
            locale={locale}
            labels={languageLabels}
            className={cn("w-full justify-between")}
          />
          <RegionCurrencySelector
            labels={regionLabels}
            className="w-full justify-between"
          />
        </div>

        <hr className="border-border my-4" />

        <div className="border-border bg-surface-subtle rounded-lg border p-3">
          <p className="text-foreground text-sm font-semibold">{labels.signIn}</p>
          <p className="text-foreground-muted mt-1 text-xs leading-relaxed">
            {labels.signInHint}
          </p>
        </div>
      </DrawerShell>
    </>
  );
}
