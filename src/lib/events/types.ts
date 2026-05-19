/**
 * SPEC-012 — NIP-52 labor events + RSVPs (types).
 *
 * Defines the in-memory shape of labor events and RSVPs. The wire-format
 * encoders/decoders live in `./calendar` and `./rsvp`.
 */

// Re-export the canonical AddressableRef from SPEC-011 listings so callers
// only need to import from `events/types`.
export type { AddressableRef } from '../listings/types';
import type { AddressableRef } from '../listings/types';

/** The kinds of labor events Powder Keg coordinates. */
export type LaborEventKind =
  | 'pile-build'
  | 'pile-turn'
  | 'mulch-drive'
  | 'planting-day'
  | 'harvest-day'
  | 'other';

const LABOR_EVENT_KINDS: readonly LaborEventKind[] = [
  'pile-build',
  'pile-turn',
  'mulch-drive',
  'planting-day',
  'harvest-day',
  'other',
] as const;

export function isLaborEventKind(value: string): value is LaborEventKind {
  return (LABOR_EVENT_KINDS as readonly string[]).includes(value);
}

export interface LaborEvent {
  kind: LaborEventKind;
  title: string;
  description: string;
  /** Unix seconds. */
  start: number;
  /** Unix seconds. */
  end?: number;
  locationText?: string;
  /** Geohash (any precision); will be truncated on encode. */
  geohash?: string;
  /** Geohash chars to emit on encode. Defaults to 7 (street level). */
  geoPrecision?: number;
  /** Optional `a` ref to an SPEC-014 pile (kind 30078). */
  pileRef?: AddressableRef;
  /** For `pile-turn` events: the 1-indexed turn number (1..6). */
  turnIndex?: number;
  /** Minimum staffing target (nullable for non-staffed events like `other`). */
  minVolunteers?: number;
  /** Estimated hours of work for planning (decimal allowed). */
  estHours?: number;
  /** Schema version. Bump on breaking shape changes. */
  version: 1;
}

export type RsvpStatus = 'accepted' | 'tentative' | 'declined';

const RSVP_STATUSES: readonly RsvpStatus[] = ['accepted', 'tentative', 'declined'] as const;

export function isRsvpStatus(value: string): value is RsvpStatus {
  return (RSVP_STATUSES as readonly string[]).includes(value);
}

export interface Rsvp {
  status: RsvpStatus;
  /** `a`-tag target: the labor event being responded to. */
  eventRef: AddressableRef;
  /** `p`-tag target: pubkey of the labor event author. */
  authorPubkey: string;
  comment?: string;
  version: 1;
}
