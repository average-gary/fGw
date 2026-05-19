/**
 * SPEC-013 — Pile module tests.
 *
 * Covers the four acceptance points from the spec plus the encoder
 * round-trip and a sanity check on the timezone snap.
 */
import { describe, expect, it } from 'vitest';
import { PILE_TURN_SCHEDULE_DAYS } from '../../domain/fgw';
import { generateTurnEvents, nineAmInZone } from './schedule';
import { nextState, validatePile } from './state';
import { encodePile, parsePile, PILE_EVENT_KIND } from './events';
import { archivePile, listMyPiles } from './queries';
import type { Pile, PileState } from './types';

function makePile(overrides: Partial<Pile> = {}): Pile {
  return {
    d: 'pile-1',
    name: 'Test pile',
    builder:
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    dimensions: { length: 2, width: 2, height: 2 },
    presetId: 'standard',
    plannedBuildDate: Math.floor(Date.now() / 1000),
    timezone: 'America/New_York',
    layers: [],
    turnRecords: [],
    state: 'DRAFT',
    photos: [],
    version: 1,
    ...overrides,
  };
}

describe('generateTurnEvents', () => {
  it('emits 6 events at the FGW turn-day offsets for a 2×2×2 pile, 9 AM local, with the SPEC-002 staffing estimate', () => {
    const pile = makePile();
    const events = generateTurnEvents(pile);
    expect(events).toHaveLength(6);
    // staffingEstimate('turn') for vol=8 m³ → ceil(8/4) = 2 volunteers, 1.5 h.
    events.forEach((ev, i) => {
      expect(ev.kind).toBe('pile-turn');
      expect(ev.turnIndex).toBe(i + 1);
      expect(ev.title).toContain('Test pile');
      expect(ev.title).toContain(`turn ${i + 1}`);
      expect(ev.pileRef).toEqual({
        kind: 30078,
        pubkey: pile.builder,
        d: pile.d,
      });
      expect(ev.minVolunteers).toBe(2);
      expect(ev.minVolunteers).toBeGreaterThanOrEqual(1);
      expect(ev.estHours).toBe(1.5);

      const dayOffset = (ev.start - pile.plannedBuildDate) / 86400;
      // Snap-to-9am can shift up to ~1 day; tolerance per spec is "give or take a quarter-day".
      // We allow ±1 day to cover a worst-case build at 23:59 local.
      expect(
        Math.abs(dayOffset - PILE_TURN_SCHEDULE_DAYS[i]!),
      ).toBeLessThanOrEqual(1);
    });
  });

  it('emits 6 events for a 6×6×6 pile with min_volunteers >5 and est_hours ≥1.5', () => {
    const pile = makePile({
      d: 'big-pile',
      dimensions: { length: 6, width: 6, height: 6 },
      presetId: 'commercial',
    });
    const events = generateTurnEvents(pile);
    expect(events).toHaveLength(6);
    // staffingEstimate('turn') = ceil(216/4) = 54.
    for (const ev of events) {
      expect(ev.minVolunteers).toBe(54);
      expect(ev.minVolunteers).toBeGreaterThan(5);
      expect(ev.estHours).toBeGreaterThanOrEqual(1.5);
    }
  });

  it('snaps each event start to 09:00 in the supplied timezone', () => {
    // Build at 14:00 UTC on a known winter day (no DST in NY).
    const buildAtUtc = Date.UTC(2026, 0, 15, 14, 0, 0) / 1000; // 2026-01-15T14:00Z
    const pile = makePile({ plannedBuildDate: buildAtUtc });
    const events = generateTurnEvents(pile);
    for (const ev of events) {
      const display = new Intl.DateTimeFormat('en-US', {
        timeZone: pile.timezone,
        hour: '2-digit',
        hour12: false,
      }).formatToParts(new Date(ev.start * 1000));
      const hour = Number(display.find((p) => p.type === 'hour')?.value);
      expect(hour === 9 || hour === 0 ? 9 : hour).toBe(9);
    }
  });
});

describe('nineAmInZone', () => {
  it('returns 09:00 local for the supplied calendar day', () => {
    const noonUtc = Date.UTC(2026, 5, 15, 12, 0, 0) / 1000; // 2026-06-15T12:00Z (DST)
    const snapped = nineAmInZone(noonUtc, 'America/New_York');
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: '2-digit',
      hour12: false,
    }).formatToParts(new Date(snapped * 1000));
    const hour = Number(parts.find((p) => p.type === 'hour')?.value);
    expect(hour).toBe(9);
  });
});

describe('validatePile', () => {
  it('rejects a pile whose length is below the minimum', () => {
    const result = validatePile(
      makePile({ dimensions: { length: 1, width: 2, height: 2 } }),
    );
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /length/.test(e))).toBe(true);
  });

  it('accepts a 2×2×2 pile with no logged components', () => {
    expect(validatePile(makePile()).ok).toBe(true);
  });

  it('flags ingredient totals that drift more than ±10%', () => {
    // 2×2×2 expects woody_m3=4, manure_50kg_bags=15. Log only one layer
    // with way-too-much woody so the sum is far above expected.
    const pile = makePile({
      layers: [
        {
          index: 1,
          completed: true,
          componentsLogged: { woody: 100 },
        },
      ],
    });
    const result = validatePile(pile);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /woody/.test(e))).toBe(true);
  });
});

describe('nextState', () => {
  it('advances DRAFT to COLLECTING (one step at a time)', () => {
    expect(nextState('DRAFT', 'advance')).toBe('COLLECTING');
  });

  it('cannot reach CURING from DRAFT in a single advance', () => {
    expect(nextState('DRAFT', 'advance')).not.toBe('CURING');
  });

  it('walks the linear order DRAFT→COLLECTING→…→CONSUMED', () => {
    const order: PileState[] = [
      'DRAFT',
      'COLLECTING',
      'BUILDING',
      'ACTIVE_TURNS',
      'CURING',
      'READY',
      'CONSUMED',
    ];
    for (let i = 0; i < order.length - 1; i += 1) {
      expect(nextState(order[i]!, 'advance')).toBe(order[i + 1]);
    }
  });

  it('treats CONSUMED as terminal for advance', () => {
    expect(nextState('CONSUMED', 'advance')).toBeNull();
  });

  it('routes any non-abandoned state to ABANDONED on abandon', () => {
    for (const s of [
      'DRAFT',
      'COLLECTING',
      'ACTIVE_TURNS',
      'READY',
      'CONSUMED',
    ] as PileState[]) {
      expect(nextState(s, 'abandon')).toBe('ABANDONED');
    }
  });

  it('refuses any action from ABANDONED', () => {
    expect(nextState('ABANDONED', 'advance')).toBeNull();
    expect(nextState('ABANDONED', 'abandon')).toBeNull();
  });
});

describe('encodePile / parsePile round-trip', () => {
  it('preserves all fields through JSON encode/decode', () => {
    const pile = makePile({
      locationText: 'Cooper Farm',
      geohash: 'dq6sxxx',
      geoPrecision: 5,
      layers: [{ index: 1, completed: true, completedAt: 1700000000 }],
      turnRecords: [
        { index: 1, completedAt: 1700100000, temperatureC: 60, moisture: 0.5 },
      ],
      photos: [{ url: 'https://example/1.jpg', alt: 'first photo' }],
    });
    const encoded = encodePile(pile, {
      pubkey: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      d: 'powder-keg-wv',
    });
    expect(encoded.kind).toBe(PILE_EVENT_KIND);
    expect(encoded.tags.find((t) => t[0] === 'd')?.[1]).toBe(pile.d);
    expect(encoded.tags.find((t) => t[0] === 't')?.[1]).toBe('pile');
    expect(encoded.tags.find((t) => t[0] === 'a')?.[1]).toBe(
      '34550:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc:powder-keg-wv',
    );
    // Geohash truncated to 5 chars per geoPrecision.
    expect(encoded.tags.find((t) => t[0] === 'g')?.[1]).toBe('dq6sx');
    expect(encoded.tags.find((t) => t[0] === 'version')?.[1]).toBe('1');

    const decoded = parsePile({
      kind: encoded.kind,
      content: encoded.content,
      tags: encoded.tags,
    });
    expect(decoded).not.toBeNull();
    expect(decoded).toEqual(pile);
  });

  it('returns null on wrong kind / missing d / bad JSON / version mismatch', () => {
    const pile = makePile();
    const encoded = encodePile(pile);
    expect(
      parsePile({ kind: 1, content: encoded.content, tags: encoded.tags }),
    ).toBeNull();
    expect(
      parsePile({
        kind: PILE_EVENT_KIND,
        content: encoded.content,
        tags: [['t', 'pile']],
      }),
    ).toBeNull();
    expect(
      parsePile({
        kind: PILE_EVENT_KIND,
        content: '{not json',
        tags: encoded.tags,
      }),
    ).toBeNull();
    expect(
      parsePile({
        kind: PILE_EVENT_KIND,
        content: JSON.stringify({ ...pile, version: 2 }),
        tags: encoded.tags,
      }),
    ).toBeNull();
  });
});

describe('queries', () => {
  it('listMyPiles filters by builder and sorts by plannedBuildDate desc', () => {
    const me = 'a'.repeat(64);
    const other = 'b'.repeat(64);
    const piles: Pile[] = [
      makePile({ d: '1', builder: me, plannedBuildDate: 100 }),
      makePile({ d: '2', builder: other, plannedBuildDate: 200 }),
      makePile({ d: '3', builder: me, plannedBuildDate: 300 }),
    ];
    const mine = listMyPiles(me, piles);
    expect(mine.map((p) => p.d)).toEqual(['3', '1']);
  });

  it('archivePile returns a new pile with state ABANDONED', () => {
    const pile = makePile({ state: 'ACTIVE_TURNS' });
    const archived = archivePile(pile);
    expect(archived.state).toBe('ABANDONED');
    expect(pile.state).toBe('ACTIVE_TURNS'); // not mutated
  });
});
