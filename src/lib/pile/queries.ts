/**
 * SPEC-013 — Pure query helpers for the multi-pile UX.
 *
 * The live subscription wiring lands in a later spec; these helpers
 * operate on whatever array the caller has already collected.
 */
import type { Pile } from './types';

/**
 * Filter the supplied pile list down to those owned by `builder` and
 * sort by `plannedBuildDate` descending (newest first).
 */
export function listMyPiles(builder: string, all: Pile[]): Pile[] {
  return all
    .filter((p) => p.builder === builder)
    .slice()
    .sort((a, b) => b.plannedBuildDate - a.plannedBuildDate);
}

/** Returns a new `Pile` with `state: 'ABANDONED'`. Pure. */
export function archivePile(p: Pile): Pile {
  return { ...p, state: 'ABANDONED' };
}
