/**
 * SPEC-012 — NIP-52 labor event encoder / decoder.
 *
 * Encodes a `LaborEvent` to a kind-31923 (date-based calendar event)
 * unsigned envelope, and parses such an envelope back. Geohashes are
 * truncated to `geoPrecision` chars (default 7 = ~76 m, street level).
 */
import { truncateGeohash } from '../../domain/geoPrecision';
import { CHAPTER_A_TAG_DEFAULTS } from '../listings/types';
import type { AddressableRef } from '../listings/types';
import { type LaborEvent, isLaborEventKind } from './types';

export { CHAPTER_A_TAG_DEFAULTS };

const CLIENT_TAG = 'compost-marketplace';
const DEFAULT_GEO_PRECISION = 7;

/** Unsigned NIP-01 envelope (caller signs + publishes). */
export interface UnsignedLaborEventEnvelope {
  kind: 31923;
  content: string;
  tags: string[][];
  created_at: number;
}

export interface RawEvent {
  kind: number;
  content: string;
  tags: string[][];
  created_at: number;
}

function defaultDSlug(ev: LaborEvent): string {
  // Stable-ish: kind + start. Caller should pass an explicit dSlug when
  // the same kind+start could legitimately have multiple instances.
  return `${ev.kind}-${ev.start}`;
}

export function encodeLaborEvent(
  ev: LaborEvent,
  opts?: { dSlug?: string; chapter?: { pubkey: string; d: string } },
): UnsignedLaborEventEnvelope {
  const chapter = opts?.chapter ?? CHAPTER_A_TAG_DEFAULTS;
  const dSlug = opts?.dSlug ?? defaultDSlug(ev);
  const precision = ev.geoPrecision ?? DEFAULT_GEO_PRECISION;

  const tags: string[][] = [
    ['d', dSlug],
    ['title', ev.title],
    ['summary', ev.description],
    ['start', String(ev.start)],
  ];
  if (ev.end !== undefined) tags.push(['end', String(ev.end)]);
  if (ev.geohash) tags.push(['g', truncateGeohash(ev.geohash, precision)]);
  if (ev.locationText) tags.push(['location', ev.locationText]);
  tags.push(['t', `labor:${ev.kind}`]);
  tags.push(['a', `34550:${chapter.pubkey}:${chapter.d}`]);
  if (ev.pileRef) {
    tags.push(['a', `${ev.pileRef.kind}:${ev.pileRef.pubkey}:${ev.pileRef.d}`]);
  }
  if (ev.minVolunteers !== undefined) {
    tags.push(['min_volunteers', String(ev.minVolunteers)]);
  }
  if (ev.estHours !== undefined) tags.push(['est_hours', String(ev.estHours)]);
  if (ev.turnIndex !== undefined) tags.push(['turn_index', String(ev.turnIndex)]);
  tags.push(['client', CLIENT_TAG]);
  tags.push(['version', '1']);

  return {
    kind: 31923,
    content: ev.description,
    tags,
    created_at: Math.floor(Date.now() / 1000),
  };
}

function findTag(tags: string[][], name: string): string | undefined {
  for (const t of tags) if (t[0] === name) return t[1];
  return undefined;
}

function findAllTags(tags: string[][], name: string): string[][] {
  return tags.filter((t) => t[0] === name);
}

function parseLaborKindTag(tags: string[][]): string | undefined {
  for (const t of tags) {
    const v = t[1];
    if (t[0] === 't' && v && v.startsWith('labor:')) return v.slice('labor:'.length);
  }
  return undefined;
}

function parseAddressableRef(value: string): AddressableRef | null {
  const parts = value.split(':');
  if (parts.length < 3) return null;
  const [kindStr, pubkey, ...rest] = parts;
  if (!kindStr || !pubkey) return null;
  const kind = Number(kindStr);
  if (!Number.isFinite(kind)) return null;
  return { kind, pubkey, d: rest.join(':') };
}

export function parseLaborEvent(event: RawEvent): LaborEvent | null {
  if (event.kind !== 31923) return null;

  const laborKind = parseLaborKindTag(event.tags);
  if (!laborKind || !isLaborEventKind(laborKind)) return null;

  const title = findTag(event.tags, 'title');
  const summary = findTag(event.tags, 'summary');
  const startStr = findTag(event.tags, 'start');
  if (!title || summary === undefined || !startStr) return null;
  const start = Number(startStr);
  if (!Number.isFinite(start)) return null;

  const out: LaborEvent = {
    kind: laborKind,
    title,
    description: summary,
    start,
    version: 1,
  };

  const endStr = findTag(event.tags, 'end');
  if (endStr) {
    const end = Number(endStr);
    if (Number.isFinite(end)) out.end = end;
  }
  const g = findTag(event.tags, 'g');
  if (g) {
    out.geohash = g;
    out.geoPrecision = g.length;
  }
  const location = findTag(event.tags, 'location');
  if (location) out.locationText = location;

  // Pile ref: any `a` tag that is NOT the chapter (34550).
  for (const t of findAllTags(event.tags, 'a')) {
    const v = t[1];
    if (!v || v.startsWith('34550:')) continue;
    const ref = parseAddressableRef(v);
    if (ref) {
      out.pileRef = ref;
      break;
    }
  }

  const minV = findTag(event.tags, 'min_volunteers');
  if (minV !== undefined) {
    const n = Number(minV);
    if (Number.isFinite(n)) out.minVolunteers = n;
  }
  const estH = findTag(event.tags, 'est_hours');
  if (estH !== undefined) {
    const n = Number(estH);
    if (Number.isFinite(n)) out.estHours = n;
  }
  const turn = findTag(event.tags, 'turn_index');
  if (turn !== undefined) {
    const n = Number(turn);
    if (Number.isFinite(n)) out.turnIndex = n;
  }

  return out;
}
