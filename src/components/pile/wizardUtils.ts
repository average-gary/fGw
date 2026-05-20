/**
 * SPEC-021 — Helper utilities for the New Pile wizard route.
 *
 * Pure functions extracted to keep `routes/NewPile.tsx` under the 500-LOC
 * cap. No React, no side effects.
 */
import {
  PILE_MIN_DIMENSIONS,
  PILE_PRESETS,
  type Dimensions,
  type PilePresetId,
} from '@/domain/fgw';
import type { LaborEvent as PileLaborEvent, PileState } from '@/lib/pile/types';
import type { LaborEvent } from '@/lib/events/types';
// SPEC-031: signAndPublish moved to lib/pile/publish.ts so PileDetail can
// reuse it. Re-exported here to keep NewPile's import path stable.
export { signAndPublish } from '@/lib/pile/publish';

export type PileBadgeVariant = 'default' | 'success' | 'warning' | 'muted' | 'danger';

export const PILE_STATE_BADGES: Record<
  PileState,
  { variant: PileBadgeVariant; label: string }
> = {
  DRAFT: { variant: 'muted', label: 'Draft' },
  COLLECTING: { variant: 'default', label: 'Collecting' },
  BUILDING: { variant: 'warning', label: 'Building' },
  ACTIVE_TURNS: { variant: 'warning', label: 'Active turns' },
  CURING: { variant: 'success', label: 'Curing' },
  READY: { variant: 'success', label: 'Ready' },
  CONSUMED: { variant: 'success', label: 'Consumed' },
  ABANDONED: { variant: 'danger', label: 'Abandoned' },
};

export function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

const COMMON_TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'UTC',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Tokyo',
];

export function tzOptionsFor(
  deviceTz: string,
): Array<{ value: string; label: string }> {
  const set = new Set<string>([deviceTz, ...COMMON_TIMEZONES]);
  return Array.from(set).map((z) => ({
    value: z,
    label: z === deviceTz ? `${z} (device)` : z,
  }));
}

export function dimensionsForPreset(id: PilePresetId): Dimensions {
  if (id === 'custom') return { ...PILE_MIN_DIMENSIONS };
  const p = PILE_PRESETS.find((x) => x.id === id);
  return p ? { ...p.dimensions } : { ...PILE_MIN_DIMENSIONS };
}

export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const suffix = Math.random().toString(36).slice(2, 8);
  return base ? `${base}-${suffix}` : `pile-${suffix}`;
}

/**
 * Bridge `pile/types.LaborEvent` (which carries pile-specific kinds like
 * `'collection'`/`'distribution'` not present in `events/types.LaborEvent`)
 * to the calendar-encoder shape. `generateTurnEvents` only ever returns
 * `'pile-turn'`, so the cast is safe at runtime.
 */
export function asCalendarEvent(ev: PileLaborEvent): LaborEvent {
  return {
    kind: 'pile-turn',
    title: ev.title,
    description: ev.description,
    start: ev.start,
    ...(ev.end !== undefined ? { end: ev.end } : {}),
    ...(ev.pileRef !== undefined ? { pileRef: ev.pileRef } : {}),
    ...(ev.turnIndex !== undefined ? { turnIndex: ev.turnIndex } : {}),
    minVolunteers: ev.minVolunteers,
    estHours: ev.estHours,
    version: 1,
  };
}

