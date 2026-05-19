// NIP-99 parser. Tolerant of unknown extra tags; returns `null` on
// malformed events so callers can filter a relay stream cheaply.

import { MATERIAL_KINDS, type MaterialKind } from '../../domain/materials';
import { QUANTITY_UNITS, type Quantity, type QuantityUnit } from '../../domain/quantity';
import {
  LISTING_EVENT_KIND,
  LISTING_VERSION,
  type AddressableRef,
  type Listing,
  type PhotoRef,
} from './types';

type RelayEvent = {
  kind: number;
  content: string;
  tags: string[][];
  created_at: number;
  pubkey?: string;
};

const first = (tags: string[][], n: string) => tags.find((t) => t[0] === n);
const all = (tags: string[][], n: string) => tags.filter((t) => t[0] === n);

export function parseListing(event: RelayEvent): Listing | null {
  if (event.kind !== LISTING_EVENT_KIND) return null;
  const tags = event.tags;
  if (first(tags, 'version')?.[1] !== String(LISTING_VERSION)) return null;

  const tTags = all(tags, 't');
  let kind: 'need' | 'offer' | null = null;
  let material: MaterialKind | null = null;
  for (const t of tTags) {
    const v = t[1];
    if (v === 'compost-need') kind = 'need';
    else if (v === 'compost-offer') kind = 'offer';
    else if (typeof v === 'string' && v.startsWith('material:')) {
      const cand = v.slice(9);
      material = (MATERIAL_KINDS as readonly string[]).includes(cand)
        ? (cand as MaterialKind)
        : null;
      if (material === null) return null; // explicit unknown material → reject
    }
  }
  if (!kind || !material) return null;

  const title = first(tags, 'title')?.[1];
  const summary = first(tags, 'summary')?.[1];
  if (!title || summary === undefined || !first(tags, 'd')?.[1]) return null;

  const out: Listing = {
    kind,
    material,
    title,
    description: summary,
    photos: parsePhotos(tags),
    version: 1,
  };
  const q = parseQuantity(tags);
  if (q) out.quantity = q;
  const g = first(tags, 'g')?.[1];
  if (g) {
    out.geohash = g;
    out.geoPrecision = g.length;
  }
  const loc = first(tags, 'location')?.[1];
  if (loc !== undefined) out.locationText = loc;
  const exp = first(tags, 'expiration')?.[1];
  if (exp) {
    const n = Number(exp);
    if (Number.isFinite(n)) out.expiresAt = n;
  }
  const pile = parsePileRef(tags);
  if (pile) out.pileRef = pile;
  return out;
}

function parseQuantity(tags: string[][]): Quantity | undefined {
  const q = first(tags, 'quantity');
  if (!q) return undefined;
  const value = Number(q[1]);
  const unit = q[2];
  if (
    !Number.isFinite(value) ||
    !unit ||
    !(QUANTITY_UNITS as readonly string[]).includes(unit)
  ) {
    return undefined;
  }
  return { value, unit: unit as QuantityUnit };
}

function parsePhotos(tags: string[][]): PhotoRef[] {
  const out: PhotoRef[] = [];
  for (const tag of all(tags, 'imeta')) {
    let url: string | undefined;
    let sha256: string | undefined;
    let mime: string | undefined;
    let w: number | undefined;
    let h: number | undefined;
    let size: number | undefined;
    for (let i = 1; i < tag.length; i++) {
      const part = tag[i];
      if (typeof part !== 'string') continue;
      const sp = part.indexOf(' ');
      if (sp < 0) continue;
      const k = part.slice(0, sp);
      const v = part.slice(sp + 1);
      if (k === 'url') url = v;
      else if (k === 'x') sha256 = v;
      else if (k === 'm') mime = v;
      else if (k === 'dim') {
        const [a, b] = v.split('x').map(Number);
        if (Number.isFinite(a) && Number.isFinite(b)) {
          w = a;
          h = b;
        }
      } else if (k === 'size') {
        const n = Number(v);
        if (Number.isFinite(n)) size = n;
      }
    }
    if (
      url &&
      sha256 &&
      (mime === 'image/jpeg' || mime === 'image/png') &&
      w !== undefined &&
      h !== undefined &&
      size !== undefined
    ) {
      out.push({ url, sha256, mime, dim: { w, h }, sizeBytes: size });
    }
  }
  return out;
}

function parsePileRef(tags: string[][]): AddressableRef | undefined {
  for (const t of all(tags, 'a')) {
    const v = t[1];
    if (!v) continue;
    const parts = v.split(':');
    if (parts.length < 3) continue;
    const kind = Number(parts[0]);
    const pubkey = parts[1];
    const d = parts.slice(2).join(':');
    if (kind === 30078 && pubkey && d) {
      const ref: AddressableRef = { kind, pubkey, d };
      if (t[2]) ref.relay = t[2];
      return ref;
    }
  }
  return undefined;
}
