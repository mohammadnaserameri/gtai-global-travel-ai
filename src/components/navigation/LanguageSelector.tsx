"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";

import { locales } from "@/config/locales";
import { switchLocale } from "@/i18n/routing";
import { cn } from "@/lib/utilities/cn";
import { DropdownShell } from "@/components/ui/DropdownShell";
import { CheckIcon, ChevronDownIcon, GlobeIcon } from "@/components/ui/icons";

export interface LanguageSelectorLabels {
  label: string;
  selectorLabel: string;
  current: string;
  translationNotice: string;
  demoAvailable: string;
}

interface LanguageSelectorProps {
  locale: string;
  labels: LanguageSelectorLabels;
  /** `compact` shows only the language code; `full` shows the native name. */
  variant?: "compact" | "full";
  className?: string;
}

/**
 * Switches locale while staying on the current page.
 *
 * Every locale is listed with both its native and English name so a visitor can
 * find their language even if the interface is currently in a script they
 * cannot read.
 */
export function LanguageSelector({
  locale,
  labels,
  variant = "full",
  className,
}: LanguageSelectorProps) {
  const pathname = usePathname();
  const active = locales.find((item) => item.code === locale) ?? locales[0];

  return (
    <DropdownShell
      align="end"
      triggerLabel={`${labels.selectorLabel} — ${labels.current}: ${active.englishName}`}
      triggerClassName={className}
      trigger={
        <>
          <GlobeIcon size={18} />
          {/* Below `sm` the trigger collapses to the globe alone so the mobile
              header still fits at 360px. The accessible name always names the
              current language. */}
          <span className={cn(variant === "compact" && "hidden sm:inline")}>
            {variant === "compact" ? active.code.toUpperCase() : active.nativeName}
          </span>
          <ChevronDownIcon
            size={14}
            className={cn(variant === "compact" && "hidden sm:block")}
          />
        </>
      }
    >
      {(close) => (
        <div>
          <p className="text-foreground-muted mb-2 text-xs font-semibold tracking-wide uppercase">
            {labels.label}
          </p>
          <ul className="-mx-1 max-h-[min(24rem,60vh)] overflow-y-auto overscroll-contain">
            {locales.map((item) => {
              const selected = item.code === locale;
              return (
                <li key={item.code}>
                  <Link
                    href={switchLocale(pathname, item.code)}
                    hrefLang={item.code}
                    lang={item.code}
                    dir={item.dir}
                    onClick={close}
                    aria-current={selected ? "true" : undefined}
                    className={cn(
                      "flex min-h-11 items-center justify-between gap-3 rounded-lg px-3 text-sm",
                      "hover:bg-brand-50 focus-visible:outline-focus-ring focus-visible:outline-2 focus-visible:outline-offset-[-2px]",
                      selected && "bg-brand-50 text-brand-ink-strong font-semibold",
                    )}
                  >
                    <span className="flex min-w-0 flex-col text-start">
                      <span className="truncate">{item.nativeName}</span>
                      <span
                        lang="en"
                        dir="ltr"
                        className="text-foreground-muted truncate text-xs"
                      >
                        {item.englishName}
                        {item.hasDictionary ? ` · ${labels.demoAvailable}` : ""}
                      </span>
                    </span>
                    {selected ? (
                      <span aria-hidden="true" className="text-brand-700 shrink-0">
                        <CheckIcon size={16} />
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className="border-border text-foreground-muted mt-3 border-t pt-3 text-xs leading-relaxed">
            {labels.translationNotice}
          </p>
        </div>
      )}
    </DropdownShell>
  );
}
