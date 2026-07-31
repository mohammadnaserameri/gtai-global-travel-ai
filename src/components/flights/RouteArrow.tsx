/**
 * A chronological route separator — origin, then this arrow, then
 * destination, always in that DOM order. The glyph itself mirrors under RTL
 * (matching the Date Picker's month chevrons) so it *looks* right-to-left
 * without ever reversing which element comes first in the document.
 */
export function RouteArrow() {
  return (
    <span aria-hidden="true" className="text-foreground-muted rtl:-scale-x-100">
      →
    </span>
  );
}
