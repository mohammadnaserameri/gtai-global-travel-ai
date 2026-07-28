/**
 * Recursive partial. Arrays are treated as leaves — a translated list is
 * always supplied whole, never element by element.
 */
export type DeepPartial<T> = T extends readonly unknown[]
  ? T
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;
