import { describe, expect, it } from 'vitest';
import { encodeLaborEvent, parseLaborEvent } from './calendar';
import { encodeRsvp, parseRsvp } from './rsvp';
import type { LaborEvent, Rsvp } from './types';

const CHAPTER_PUBKEY = 'a'.repeat(64);
const PILE_PUBKEY = 'b'.repeat(64);
const EVENT_AUTHOR_PUBKEY = 'c'.repeat(64);

describe('LaborEvent round-trip (pile-turn)', () => {
  it('preserves all fields including staffing on encode → parse', () => {
    const original: LaborEvent = {
      kind: 'pile-turn',
      title: 'Turn #1 — Front Pile',
      description: 'Bring pitchforks. We FGW-turn the front pile, layer by layer.',
      start: 1_725_000_000,
      end: 1_725_007_200,
      locationText: '123 High View Rd',
      geohash: 'dqbnd5xy', // 8 chars; should be truncated to 7 by default
      pileRef: { kind: 30078, pubkey: PILE_PUBKEY, d: 'pile-2025-08' },
      turnIndex: 1,
      minVolunteers: 4,
      estHours: 2,
      version: 1,
    };

    const envelope = encodeLaborEvent(original, {
      chapter: { pubkey: CHAPTER_PUBKEY, d: 'powder-keg-wv' },
    });
    expect(envelope.kind).toBe(31923);
    expect(envelope.content).toBe(original.description);

    const parsed = parseLaborEvent(envelope);
    expect(parsed).not.toBeNull();
    if (!parsed) return;
    expect(parsed.kind).toBe('pile-turn');
    expect(parsed.title).toBe(original.title);
    expect(parsed.description).toBe(original.description);
    expect(parsed.start).toBe(original.start);
    expect(parsed.end).toBe(original.end);
    expect(parsed.locationText).toBe(original.locationText);
    expect(parsed.minVolunteers).toBe(4);
    expect(parsed.estHours).toBe(2);
    expect(parsed.turnIndex).toBe(1);
    expect(parsed.pileRef).toEqual(original.pileRef);
    // Geohash truncated to default 7 chars on encode.
    expect(parsed.geohash).toBe('dqbnd5x');
    expect(parsed.geoPrecision).toBe(7);
    expect(parsed.version).toBe(1);
  });
});

describe('LaborEvent default geo precision', () => {
  it('truncates a long geohash to 7 chars when geoPrecision is unset', () => {
    const ev: LaborEvent = {
      kind: 'pile-build',
      title: 'Build day',
      description: 'Inaugural pile.',
      start: 1_725_000_000,
      geohash: 'dnv5xyzab', // 9 chars
      version: 1,
    };
    const envelope = encodeLaborEvent(ev);
    const gTag = envelope.tags.find((t) => t[0] === 'g');
    expect(gTag).toBeDefined();
    expect(gTag?.[1]).toBe('dnv5xyz');
    expect(gTag?.[1]).toHaveLength(7);
  });

  it('honours an explicit geoPrecision of 5', () => {
    const ev: LaborEvent = {
      kind: 'mulch-drive',
      title: 'Mulch drive',
      description: 'Pickups in town.',
      start: 1_725_000_000,
      geohash: 'dnv5xyzab',
      geoPrecision: 5,
      version: 1,
    };
    const envelope = encodeLaborEvent(ev);
    const gTag = envelope.tags.find((t) => t[0] === 'g');
    expect(gTag?.[1]).toBe('dnv5x');
  });
});

describe('Rsvp round-trip', () => {
  it('preserves status, eventRef, and authorPubkey', () => {
    const original: Rsvp = {
      status: 'accepted',
      eventRef: { kind: 31923, pubkey: EVENT_AUTHOR_PUBKEY, d: '31923-1725000000' },
      authorPubkey: EVENT_AUTHOR_PUBKEY,
      comment: 'Bringing two pitchforks.',
      version: 1,
    };

    const envelope = encodeRsvp(original);
    expect(envelope.kind).toBe(31925);
    expect(envelope.content).toBe('Bringing two pitchforks.');

    const parsed = parseRsvp(envelope);
    expect(parsed).not.toBeNull();
    if (!parsed) return;
    expect(parsed.status).toBe('accepted');
    expect(parsed.eventRef).toEqual(original.eventRef);
    expect(parsed.authorPubkey).toBe(EVENT_AUTHOR_PUBKEY);
    expect(parsed.comment).toBe('Bringing two pitchforks.');
  });

  it('uses a deterministic d-tag derived from the event ref', () => {
    const rsvp: Rsvp = {
      status: 'tentative',
      eventRef: { kind: 31923, pubkey: EVENT_AUTHOR_PUBKEY, d: 'turn-1' },
      authorPubkey: EVENT_AUTHOR_PUBKEY,
      version: 1,
    };
    const a = encodeRsvp(rsvp);
    const b = encodeRsvp(rsvp);
    const aD = a.tags.find((t) => t[0] === 'd')?.[1];
    const bD = b.tags.find((t) => t[0] === 'd')?.[1];
    expect(aD).toBe(bD);
    expect(aD).toBe(`rsvp-${EVENT_AUTHOR_PUBKEY}-turn-1`);
  });

  it('omits comment when none is provided', () => {
    const rsvp: Rsvp = {
      status: 'declined',
      eventRef: { kind: 31923, pubkey: EVENT_AUTHOR_PUBKEY, d: 'turn-2' },
      authorPubkey: EVENT_AUTHOR_PUBKEY,
      version: 1,
    };
    const envelope = encodeRsvp(rsvp);
    expect(envelope.content).toBe('');
    const parsed = parseRsvp(envelope);
    expect(parsed?.comment).toBeUndefined();
  });
});

describe('parseLaborEvent rejects invalid input', () => {
  it('returns null for unknown labor kinds', () => {
    const envelope = {
      kind: 31923,
      content: 'Lunch break',
      tags: [
        ['d', '31923-1725000000'],
        ['title', 'Lunch'],
        ['summary', 'Lunch break'],
        ['start', '1725000000'],
        ['t', 'labor:lunchtime'],
        ['a', `34550:${CHAPTER_PUBKEY}:powder-keg-wv`],
        ['client', 'compost-marketplace'],
        ['version', '1'],
      ],
      created_at: 1_725_000_000,
    };
    expect(parseLaborEvent(envelope)).toBeNull();
  });

  it('returns null for the wrong nostr kind', () => {
    const envelope = {
      kind: 1,
      content: '',
      tags: [],
      created_at: 0,
    };
    expect(parseLaborEvent(envelope)).toBeNull();
  });

  it('returns null when the start tag is missing', () => {
    const envelope = {
      kind: 31923,
      content: '',
      tags: [
        ['d', 'x'],
        ['title', 'No start'],
        ['summary', ''],
        ['t', 'labor:pile-build'],
      ],
      created_at: 0,
    };
    expect(parseLaborEvent(envelope)).toBeNull();
  });
});

describe('Acceptance: pile-turn + RSVP', () => {
  it('counts 1 RSVP for an event with minVolunteers=4 and preserves staffing fields', () => {
    // 1. Author A creates a pile-turn event.
    const ev: LaborEvent = {
      kind: 'pile-turn',
      title: 'Turn #2',
      description: 'Second turn at +6 days.',
      start: 1_725_500_000,
      pileRef: { kind: 30078, pubkey: PILE_PUBKEY, d: 'pile-2025-08' },
      turnIndex: 2,
      minVolunteers: 4,
      estHours: 2,
      version: 1,
    };
    const eventEnvelope = encodeLaborEvent(ev, {
      dSlug: 'turn-2-pile-2025-08',
      chapter: { pubkey: CHAPTER_PUBKEY, d: 'powder-keg-wv' },
    });
    const eventDTag = eventEnvelope.tags.find((t) => t[0] === 'd')?.[1] ?? '';

    // 2. A second key RSVPs accepted.
    const rsvp: Rsvp = {
      status: 'accepted',
      eventRef: { kind: 31923, pubkey: EVENT_AUTHOR_PUBKEY, d: eventDTag },
      authorPubkey: EVENT_AUTHOR_PUBKEY,
      version: 1,
    };
    const rsvpEnvelope = encodeRsvp(rsvp);

    // 3. Filter "RSVPs for this event" by a-tag → exactly one match.
    const aTagWanted = `31923:${EVENT_AUTHOR_PUBKEY}:${eventDTag}`;
    const inbox = [rsvpEnvelope];
    const matchingRsvps = inbox
      .map(parseRsvp)
      .filter((r): r is Rsvp => r !== null)
      .filter((r) => `31923:${r.eventRef.pubkey}:${r.eventRef.d}` === aTagWanted);
    expect(matchingRsvps).toHaveLength(1);

    // 4. Staffing fields survive round-trip on the labor event.
    const parsed = parseLaborEvent(eventEnvelope);
    expect(parsed?.minVolunteers).toBe(4);
    expect(parsed?.estHours).toBe(2);
    expect(parsed?.turnIndex).toBe(2);
  });
});
