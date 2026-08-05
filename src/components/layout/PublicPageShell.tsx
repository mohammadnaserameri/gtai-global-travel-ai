import type { ReactNode } from "react";
import Link from "next/link";

import {
  PUBLIC_DOCUMENTS_LAST_UPDATED,
  publicCompanyProfile,
  publicContactMailto,
} from "@/config/public-company-profile";
import { localePath } from "@/i18n/routing";
import type { Dictionary } from "@/i18n/get-dictionary";
import { Container } from "@/components/layout/Container";

interface PublicPageShellProps {
  locale: string;
  dictionary: Dictionary;
  title: string;
  intro: string;
  /** Rendered when the document is a legal or policy notice. */
  showLastUpdated?: boolean;
  /** Rendered when the page should end with the company's public details. */
  showCompanyDetails?: boolean;
  children: ReactNode;
}

/**
 * Shared frame for the five public information pages.
 *
 * One component rather than five page layouts, for the same reason the company
 * profile is one module: About, Contact, Privacy, Terms and the Affiliate
 * Disclosure are read together by anyone evaluating this project, and five
 * independently-built pages drift into five different-looking documents.
 *
 * The measure is deliberately narrow (`max-w-3xl`). These are pages people
 * actually read rather than scan, and full-width legal prose on a 1440 px
 * display is unreadable regardless of how correct the content is.
 */
export function PublicPageShell({
  locale,
  dictionary,
  title,
  intro,
  showLastUpdated = false,
  showCompanyDetails = false,
  children,
}: PublicPageShellProps) {
  const { publicPages } = dictionary;

  return (
    <>
      <section className="border-border/70 from-brand-25 to-background border-b bg-linear-to-b">
        <Container className="py-10 lg:py-14">
          <div className="max-w-3xl">
            <h1 className="text-foreground text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              {title}
            </h1>
            <p className="text-foreground-secondary mt-4 text-base leading-relaxed">
              {intro}
            </p>
            {showLastUpdated ? (
              // `gtai-ltr-numerals` keeps the ISO date reading left-to-right
              // inside an RTL paragraph, and `<time>` gives it machine meaning.
              <p className="text-foreground-muted mt-4 text-sm">
                {publicPages.lastUpdated}{" "}
                <time
                  dateTime={PUBLIC_DOCUMENTS_LAST_UPDATED}
                  className="gtai-ltr-numerals"
                >
                  {PUBLIC_DOCUMENTS_LAST_UPDATED}
                </time>
              </p>
            ) : null}
          </div>
        </Container>
      </section>

      <section className="py-12 lg:py-16">
        <Container>
          <div className="max-w-3xl">
            {children}

            {showCompanyDetails ? <CompanyDetails dictionary={dictionary} /> : null}

            <p className="mt-12">
              <Link
                href={localePath(locale, "/")}
                className="text-brand-ink hover:text-brand-ink-strong focus-visible:outline-focus-ring inline-flex min-h-11 items-center rounded-md text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                {publicPages.backToHome}
              </Link>
            </p>
          </div>
        </Container>
      </section>
    </>
  );
}

/**
 * The company's public facts, rendered from the shared profile.
 *
 * A description list rather than paragraphs: these are labelled values, and
 * `<dl>` is what lets a screen-reader user hear "Legal entity: GROUPE AMERI
 * INC." rather than two unrelated strings. The email is the only interactive
 * element and is given a full-height target.
 */
function CompanyDetails({ dictionary }: { dictionary: Dictionary }) {
  const { publicPages } = dictionary;
  const { labels } = publicPages;

  return (
    <section className="border-border bg-background-muted mt-10 rounded-xl border p-5 sm:p-6">
      <h2 className="text-foreground text-base font-semibold">
        {publicPages.companyHeading}
      </h2>
      <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-[auto_minmax(0,1fr)]">
        <Row label={labels.product} value={publicCompanyProfile.productName} />
        <Row label={labels.legalName} value={publicCompanyProfile.legalName} />
        <Row label={labels.location} value={publicCompanyProfile.publicLocation} />
        <dt className="text-foreground-muted text-sm">{labels.email}</dt>
        <dd className="text-sm">
          <a
            href={publicContactMailto}
            // `break-all` because a long address must wrap rather than push the
            // page wider at 360 px — a clipped contact address is a broken
            // contact page.
            className="text-brand-ink hover:text-brand-ink-strong focus-visible:outline-focus-ring inline-flex min-h-11 items-center rounded-md break-all focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {publicCompanyProfile.contactEmail}
          </a>
        </dd>
        <Row label={labels.website} value={publicCompanyProfile.websiteUrl} />
      </dl>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-foreground-muted text-sm">{label}</dt>
      <dd className="text-foreground text-sm break-words">{value}</dd>
    </>
  );
}

/** A heading plus paragraphs, the shape every policy section uses. */
export function PublicSection({
  heading,
  body,
}: {
  heading: string;
  body: readonly string[];
}) {
  return (
    <section className="mt-8 first:mt-0">
      <h2 className="text-foreground text-lg font-semibold">{heading}</h2>
      {body.map((paragraph) => (
        <p
          key={paragraph}
          className="text-foreground-secondary mt-3 text-sm leading-relaxed"
        >
          {paragraph}
        </p>
      ))}
    </section>
  );
}

/** A heading plus a bulleted list, used by the Affiliate Disclosure. */
export function PublicList({
  heading,
  items,
}: {
  heading: string;
  items: readonly string[];
}) {
  return (
    <section className="mt-8 first:mt-0">
      <h2 className="text-foreground text-lg font-semibold">{heading}</h2>
      <ul className="text-foreground-secondary mt-3 flex list-disc flex-col gap-2 ps-5 text-sm leading-relaxed">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}
