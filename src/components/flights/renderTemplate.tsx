import { Fragment, type ReactNode } from "react";

import { splitTemplateSegments } from "@/features/flights/flight-offer-formatting";

/**
 * Renders a `"{token}"` template as structured JSX rather than one opaque
 * interpolated string, so each `values` entry — typically a `<bdi>`-isolated
 * code, time or identifier — keeps its own bidi isolation instead of being
 * flattened into the localized surrounding text.
 *
 * This is why "Flight {number}" must not be wrapped in a single
 * `<bdi dir="ltr">`: that would force the localized word *Flight* (پرواز,
 * رحلة, Vol) into left-to-right too. Only the substituted identifier is
 * isolated; the sentence around it keeps the page's direction.
 */
export function renderTemplate(
  template: string,
  values: Readonly<Record<string, ReactNode>>,
): ReactNode {
  return splitTemplateSegments(template).map((segment, index) => {
    if (segment.kind === "text") return segment.value;
    return <Fragment key={index}>{values[segment.key]}</Fragment>;
  });
}
