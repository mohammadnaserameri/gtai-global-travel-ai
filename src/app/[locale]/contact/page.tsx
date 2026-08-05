import type { Metadata } from "next";

import { resolveContentLocale } from "@/config/locales";
import { getDictionary } from "@/i18n/get-dictionary";
import { buildPublicMetadata } from "@/lib/seo/public-metadata";
import {
  PUBLIC_PAGE_PATHS,
  publicCompanyProfile,
  publicContactMailto,
} from "@/config/public-company-profile";
import { PublicPageShell } from "@/components/layout/PublicPageShell";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const { meta } = await getDictionary(resolveContentLocale(locale));
  return buildPublicMetadata({
    locale,
    title: meta.contact.title,
    description: meta.contact.description,
    siteName: meta.siteName,
    path: PUBLIC_PAGE_PATHS.contact,
  });
}

/**
 * Contact.
 *
 * Deliberately a `mailto:` address and nothing else. A contact form would mean
 * a backend that receives and stores what visitors type, which is a data-
 * collection surface this stage has no need for and no policy covering. Email
 * puts the message in the visitor's own client, where they can see exactly
 * what they are sending and to whom.
 */
export default async function ContactPage({ params }: PageProps) {
  const { locale } = await params;
  const dictionary = await getDictionary(resolveContentLocale(locale));
  const { publicPages } = dictionary;
  const contact = publicPages.contact;

  return (
    <PublicPageShell
      locale={locale}
      dictionary={dictionary}
      title={contact.title}
      intro={contact.intro}
      showCompanyDetails
    >
      <section>
        <h2 className="text-foreground text-lg font-semibold">
          {contact.emailIntro}
        </h2>
        <p className="mt-3">
          <a
            href={publicContactMailto}
            className="text-brand-ink hover:text-brand-ink-strong focus-visible:outline-focus-ring inline-flex min-h-11 items-center rounded-md text-base font-semibold break-all focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {publicCompanyProfile.contactEmail}
          </a>
        </p>
      </section>

      <section className="mt-8">
        <ul className="text-foreground-secondary flex list-disc flex-col gap-2 ps-5 text-sm leading-relaxed">
          {contact.topics.map((topic) => (
            <li key={topic}>{topic}</li>
          ))}
        </ul>
      </section>

      <p className="text-foreground-muted mt-8 text-sm leading-relaxed">
        {contact.note}
      </p>
    </PublicPageShell>
  );
}
