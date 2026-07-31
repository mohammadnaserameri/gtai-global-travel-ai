"use client";

import { useEffect, useRef, type ReactNode } from "react";

import type { Dictionary } from "@/i18n/get-dictionary";
import { Button, ButtonLink } from "@/components/ui/Button";

export type DetailsStateTone = "invalid" | "notice";

interface FlightDetailsStateProps {
  /** Always the page's single `h1` — every Details state exposes exactly one. */
  title: string;
  description?: string;
  tone: DetailsStateTone;
  /** Focus the heading once when this state first appears (used for async failures). */
  focusOnMount?: boolean;
  /** `role="alert"` only where the state is a genuine error, not a routine explanation. */
  alert?: boolean;
  children: ReactNode;
}

/**
 * The shared shell for every non-ready Details state: invalid search,
 * invalid offer id, not found, excluded by filters, and repository error.
 *
 * Each renders the same structure — one `h1`, an optional explanation, and
 * a row of recovery actions — so the page's heading contract holds no
 * matter which branch is taken. `focusOnMount` is deliberately keyed on
 * nothing: it fires once per mount, so an asynchronous failure moves focus
 * to the heading a single time rather than stealing it back on every
 * re-render.
 */
export function FlightDetailsState({
  title,
  description,
  tone,
  focusOnMount = false,
  alert = false,
  children,
}: FlightDetailsStateProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (focusOnMount) headingRef.current?.focus();
    // Intentionally mount-only: re-focusing on every render would trap the
    // visitor's focus on the heading while they try to reach the actions.
  }, [focusOnMount]);

  return (
    <div
      {...(alert ? { role: "alert" } : {})}
      className={
        tone === "invalid"
          ? "border-danger/25 bg-danger-subtle rounded-2xl border p-6 text-center"
          : "border-border bg-surface-subtle rounded-2xl border p-6 text-center"
      }
    >
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="text-foreground text-lg font-semibold focus:outline-none"
      >
        {title}
      </h1>
      {description ? (
        <p className="text-foreground-muted mt-2 text-sm">{description}</p>
      ) : null}
      <div className="mt-5 flex flex-wrap justify-center gap-2">{children}</div>
    </div>
  );
}

/** The two link shapes every state offers, kept here so their variants stay consistent. */
export function DetailsStateActions({
  resultsHref,
  editSearchHref,
  labels,
  primaryHref,
  primaryLabel,
  onRetry,
}: {
  resultsHref: string;
  editSearchHref: string;
  labels: Dictionary["flightDetails"];
  primaryHref?: string;
  primaryLabel?: string;
  onRetry?: () => void;
}) {
  return (
    <>
      {onRetry ? (
        <Button variant="primary" onClick={onRetry}>
          {labels.retry}
        </Button>
      ) : null}
      {primaryHref && primaryLabel ? (
        <ButtonLink href={primaryHref} variant="primary">
          {primaryLabel}
        </ButtonLink>
      ) : null}
      <ButtonLink
        href={resultsHref}
        variant={onRetry || primaryHref ? "secondary" : "primary"}
      >
        {labels.returnToResults}
      </ButtonLink>
      <ButtonLink href={editSearchHref} variant="ghost">
        {labels.editSearch}
      </ButtonLink>
    </>
  );
}
