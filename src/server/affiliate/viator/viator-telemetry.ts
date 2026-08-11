import "../../server-only";

interface ViatorClickEvent {
  readonly provider: "viator-affiliate";
  readonly productCodeHash: string;
  readonly createdAt: string;
  readonly result: "redirected";
}
const events: ViatorClickEvent[] = [];
const MAX_EVENTS = 256;

export function recordViatorClick(event: ViatorClickEvent): void {
  events.push(Object.freeze({ ...event }));
  if (events.length > MAX_EVENTS) events.shift();
}

export function getViatorClickCount(): number {
  return events.length;
}
