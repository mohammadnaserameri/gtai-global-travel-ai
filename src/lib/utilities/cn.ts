/**
 * Minimal class-name joiner.
 *
 * Deliberately dependency-free: the project avoids adding packages for work
 * this small. Falsy values are dropped so conditional classes read cleanly.
 */
export type ClassValue = string | number | false | null | undefined;

export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(" ");
}
