/**
 * SPEC-013 — Pile state + events (kind 30078).
 *
 * Defines the canonical pile shape, layer/turn records, lifecycle states,
 * and the validation result shape used by `state.ts` and `events.ts`.
 */
import type { Dimensions, PilePresetId } from '../../domain/fgw';

export type PileState =
  | 'DRAFT'
  | 'COLLECTING'
  | 'BUILDING'
  | 'ACTIVE_TURNS'
  | 'CURING'
  | 'READY'
  | 'CONSUMED'
  | 'ABANDONED';

export type LayerComponent = 'woody' | 'dry' | 'green' | 'manure' | 'water';

export interface LayerRecord {
  /** 1-based layer index. */
  index: number;
  completed: boolean;
  /** Unix seconds. */
  completedAt?: number;
  /** Optional sanity counts per component (units depend on component). */
  componentsLogged?: Partial<Record<LayerComponent, number>>;
}

export interface TurnRecord {
  /** 1..6 — matches `PILE_TURN_SCHEDULE_DAYS`. */
  index: number;
  /** Unix seconds. */
  completedAt?: number;
  temperatureC?: number;
  /** 0..1. */
  moisture?: number;
  notes?: string;
}

/**
 * Minimal photo reference. Mirrors the shape SPEC-005's `listings/types`
 * will export; once that file lands this can re-export from there.
 */
export interface PhotoRef {
  url: string;
  hash?: string;
  alt?: string;
}

export interface Pile {
  /** Slug — stable identifier within the builder's pile set. */
  d: string;
  /** Human-readable name for multi-pile UX. */
  name: string;
  /** Hex pubkey of the builder. */
  builder: string;
  locationText?: string;
  geohash?: string;
  geoPrecision?: number;
  dimensions: Dimensions;
  presetId: PilePresetId;
  /** Unix seconds — when the pile is planned to be built. */
  plannedBuildDate: number;
  /** IANA timezone identifier (e.g. 'America/New_York'). */
  timezone: string;
  layers: LayerRecord[];
  turnRecords: TurnRecord[];
  state: PileState;
  /** Unix seconds — date the cure period ends, if applicable. */
  cureUntil?: number;
  photos: PhotoRef[];
  version: 1;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

/**
 * Local stand-in for SPEC-012's `LaborEvent`. When that file lands, swap
 * this type for its export — the field names are aligned.
 */
export interface LaborEvent {
  kind: 'pile-turn' | 'pile-build' | 'collection' | 'distribution';
  title: string;
  description: string;
  /** Unix seconds. */
  start: number;
  /** Optional unix-seconds end. */
  end?: number;
  /** Reference to the parent addressable event (e.g. the pile). */
  pileRef?: { kind: number; pubkey: string; d: string };
  /** 1..6 for pile-turn events. */
  turnIndex?: number;
  minVolunteers: number;
  estHours: number;
  version: 1;
}
