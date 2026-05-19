/**
 * SPEC-013 — Turn-event scheduling.
 *
 * Generates the six labor events for a pile's turn cycle by applying
 * `PILE_TURN_SCHEDULE_DAYS` to `pile.plannedBuildDate` and snapping each
 * `start` to 09:00 in `pile.timezone`. Uses `Intl.DateTimeFormat` to
 * compute the zone's UTC offset on each target date — so DST transitions
 * across the schedule are handled correctly without hard-coded offsets.
 */
import {
  PILE_TURN_SCHEDULE_DAYS,
  PILE_DEFAULT_TURN_HOUR_LOCAL,
} from '../../domain/fgw';
import { staffingEstimate } from '../../domain/pileMath';
import type { LaborEvent, Pile } from './types';

/**
 * Returns the wall-clock fields (year/month/day/hour/minute/second) that
 * `instant` displays as in the supplied IANA timezone.
 */
function wallClockInZone(
  instant: Date,
  tz: string,
): { y: number; m: number; d: number; h: number; mi: number; s: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  let h = get('hour');
  // Some runtimes emit "24" for midnight; normalise.
  if (h === 24) h = 0;
  return {
    y: get('year'),
    m: get('month'),
    d: get('day'),
    h,
    mi: get('minute'),
    s: get('second'),
  };
}

/**
 * Given a target wall-clock (y,m,d,h) in `tz`, return the unix-seconds
 * instant that displays as that wall-clock. Iterates twice to converge
 * across the zone offset (handles DST without hard-coded rules).
 */
function unixForLocalWallClock(
  y: number,
  m: number,
  d: number,
  h: number,
  tz: string,
): number {
  // Initial guess: pretend the target is UTC.
  let guessMs = Date.UTC(y, m - 1, d, h, 0, 0);
  for (let i = 0; i < 2; i += 1) {
    const wc = wallClockInZone(new Date(guessMs), tz);
    const desiredUtc = Date.UTC(y, m - 1, d, h, 0, 0);
    const seenUtc = Date.UTC(wc.y, wc.m - 1, wc.d, wc.h, wc.mi, wc.s);
    const offsetMs = seenUtc - guessMs; // tz offset east of UTC, in ms
    guessMs = desiredUtc - offsetMs;
  }
  return Math.floor(guessMs / 1000);
}

/**
 * Returns the unix-seconds instant of `PILE_DEFAULT_TURN_HOUR_LOCAL` (09:00)
 * on the same calendar day as `unixSec` interpreted in `tz`.
 */
export function nineAmInZone(unixSec: number, tz: string): number {
  const wc = wallClockInZone(new Date(unixSec * 1000), tz);
  return unixForLocalWallClock(
    wc.y,
    wc.m,
    wc.d,
    PILE_DEFAULT_TURN_HOUR_LOCAL,
    tz,
  );
}

/**
 * Build the six turn events for `pile`. Each event references the pile via
 * `pileRef` and inherits its staffing estimate from `staffingEstimate`.
 */
export function generateTurnEvents(pile: Pile): LaborEvent[] {
  const staffing = staffingEstimate(pile.dimensions, 'turn');
  return PILE_TURN_SCHEDULE_DAYS.map((dayOffset, i) => {
    const rawInstant = pile.plannedBuildDate + dayOffset * 86400;
    const start = nineAmInZone(rawInstant, pile.timezone);
    return {
      kind: 'pile-turn' as const,
      title: `Turn ${pile.name} (turn ${i + 1})`,
      description: '',
      start,
      pileRef: { kind: 30078, pubkey: pile.builder, d: pile.d },
      turnIndex: i + 1,
      minVolunteers: staffing.min_volunteers,
      estHours: staffing.est_hours,
      version: 1 as const,
    };
  });
}
