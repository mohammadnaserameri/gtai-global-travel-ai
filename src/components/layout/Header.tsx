import { primaryNav, utilityNav } from "@/config/navigation";
import { localePath } from "@/i18n/routing";
import type { Dictionary } from "@/i18n/get-dictionary";
import { Container } from "@/components/layout/Container";
import { Logo } from "@/components/brand/Logo";
import { NavLink } from "@/components/navigation/NavLink";
import { MobileNav } from "@/components/navigation/MobileNav";
import { LanguageSelector } from "@/components/navigation/LanguageSelector";
import { RegionCurrencySelector } from "@/components/region/RegionCurrencySelector";
import { TooltipShell } from "@/components/ui/TooltipShell";
import { SparkIcon, TravelersIcon } from "@/components/ui/icons";

interface HeaderProps {
  locale: string;
  dictionary: Dictionary;
}

/**
 * Global application header.
 *
 * Server-rendered. Only the four interactive pieces — active-link marking, the
 * two selectors and the mobile drawer — are Client Components, which keeps the
 * header's JavaScript cost close to zero on a first visit.
 */
export function Header({ locale, dictionary }: HeaderProps) {
  const { nav, language, region } = dictionary;

  const primary = primaryNav.map((item) => ({
    href: localePath(locale, item.path),
    label: nav[item.labelKey],
  }));

  const utility = utilityNav.map((item) => ({
    href: localePath(locale, item.path),
    label: nav[item.labelKey],
  }));

  return (
    <header className="border-border/80 gtai-surface-glass sticky top-0 z-50 border-b">
      <Container className="flex min-h-16 items-center gap-3 py-2">
        <Logo
          href={localePath(locale)}
          homeLabel={nav.goToHome}
          size="md"
          className="shrink-0"
        />

        <nav
          aria-label={nav.primaryLabel}
          className="hidden min-w-0 flex-1 lg:block"
        >
          <ul className="flex items-center gap-0.5 xl:gap-1">
            {primary.map((item) => (
              <li key={item.href}>
                <NavLink href={item.href} label={item.label} />
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex flex-1 items-center justify-end gap-1.5 lg:flex-none lg:gap-2">
          {/* AI Travel is promoted, not buried in the product list.
              The `hidden` wrapper is a separate element on purpose — NavLink
              sets its own `display`, and two display utilities on one element
              resolve by stylesheet order rather than class order. */}
          <span className="hidden sm:block">
            <NavLink
              href={utility[0].href}
              label={utility[0].label}
              className="border-brand-150 bg-brand-50 text-brand-ink-strong hover:bg-brand-150 gap-1.5 border px-3"
            />
          </span>
          <span className="hidden lg:block">
            <NavLink href={utility[1].href} label={utility[1].label} />
          </span>

          <LanguageSelector locale={locale} labels={language} variant="compact" />
          <RegionCurrencySelector labels={region} />

          {/* Wrapped rather than given a `hidden` class directly: TooltipShell
              sets its own `display`, and two display utilities on one element
              resolve by stylesheet order, not by class order. */}
          <span className="hidden lg:block">
            <TooltipShell content={nav.signInHint} align="end">
              <span
                className="rounded-pill border-border-strong bg-surface text-foreground-muted inline-flex min-h-11 items-center gap-2 border px-4 text-sm font-semibold"
                aria-disabled="true"
              >
                <TravelersIcon size={16} />
                {nav.signIn}
              </span>
            </TooltipShell>
          </span>

          <span
            aria-label={nav.profile}
            title={nav.signInHint}
            className="border-border-strong bg-surface text-foreground-muted inline-flex size-11 shrink-0 items-center justify-center rounded-full border lg:hidden"
          >
            <SparkIcon size={18} />
          </span>

          <MobileNav
            locale={locale}
            primary={primary}
            utility={utility}
            labels={{
              openMenu: nav.openMenu,
              closeMenu: nav.closeMenu,
              menu: nav.menu,
              primaryLabel: nav.primaryLabel,
              utilityLabel: nav.utilityLabel,
              signIn: nav.signIn,
              signInHint: nav.signInHint,
            }}
            languageLabels={language}
            regionLabels={region}
          />
        </div>
      </Container>
    </header>
  );
}
