/**
 * SPEC-012 — NIP-52 RSVP encoder / decoder (kind 31925).
 *
 * The `d`-tag is derived deterministically from the event reference and
 * author so a person re-RSVPing to the same event replaces (rather than
 * adds to) their prior response. This matches NIP-52's intent.
 */
import type { AddressableRef } from '../listings/types';
import { type Rsvp, isRsvpStatus } from './types';

const CLIENT_TAG = 'compost-marketplace';

export interface UnsignedRsvpEnvelope {
  kind: 31925;
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

/**
 * Deterministic `d`-tag for an RSVP. Uses the event ref's `pubkey:d`
 * (the kind is always 31923 for labor events). Author pubkey is implicit
 * in the RSVP author identity, so we don't fold it in — one author can only
 * have one RSVP per event, which is the desired NIP-33 replace semantics.
 */
export function defaultRsvpDSlug(eventRef: AddressableRef): string {
  return `rsvp-${eventRef.pubkey}-${eventRef.d}`;
}

export function encodeRsvp(
  rsvp: Rsvp,
  opts?: { dSlug?: string },
): UnsignedRsvpEnvelope {
  const dSlug = opts?.dSlug ?? defaultRsvpDSlug(rsvp.eventRef);
  const tags: string[][] = [
    ['d', dSlug],
    ['status', rsvp.status],
    ['a', `31923:${rsvp.eventRef.pubkey}:${rsvp.eventRef.d}`],
    ['p', rsvp.authorPubkey],
    ['client', CLIENT_TAG],
    ['version', '1'],
  ];

  return {
    kind: 31925,
    content: rsvp.comment ?? '',
    tags,
    created_at: Math.floor(Date.now() / 1000),
  };
}

function findTag(tags: string[][], name: string): string | undefined {
  for (const t of tags) if (t[0] === name) return t[1];
  return undefined;
}

function parseEventRef(value: string): AddressableRef | null {
  const parts = value.split(':');
  if (parts.length < 3) return null;
  const [kindStr, pubkey, ...rest] = parts;
  if (kindStr !== '31923' || !pubkey) return null;
  return { kind: 31923, pubkey, d: rest.join(':') };
}

export function parseRsvp(event: RawEvent): Rsvp | null {
  if (event.kind !== 31925) return null;

  const status = findTag(event.tags, 'status');
  if (!status || !isRsvpStatus(status)) return null;

  const aTag = findTag(event.tags, 'a');
  if (!aTag) return null;
  const eventRef = parseEventRef(aTag);
  if (!eventRef) return null;

  const authorPubkey = findTag(event.tags, 'p');
  if (!authorPubkey) return null;

  const out: Rsvp = {
    status,
    eventRef,
    authorPubkey,
    version: 1,
  };
  if (event.content) out.comment = event.content;
  return out;
}
