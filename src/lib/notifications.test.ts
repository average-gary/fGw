/**
 * SPEC-029 — local notifications tests.
 *
 * The Tauri plugin/core modules are mocked so the test runs cleanly under
 * happy-dom (no Tauri runtime). With `isTauri()` mocked to `false` we
 * exercise the web/no-op branch — registry is still populated, but no
 * plugin call is attempted.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => true,
}));

vi.mock('@tauri-apps/plugin-notification', () => ({
  sendNotification: vi.fn(),
  cancel: vi.fn(async () => {}),
  requestPermission: vi.fn(async () => 'granted' as const),
  Schedule: {
    at: (date: Date, repeating = false, allowWhileIdle = true) => ({
      at: { date, repeating, allowWhileIdle },
    }),
  },
}));

import {
  _resetNotificationsForTests,
  _setPermissionForTests,
  cancelNotificationsFor,
  getPending,
  requestPermission,
  scheduleNotificationsForListing,
  scheduleNotificationsForPile,
  scheduleNotificationsForRsvp,
  useNotificationsFallbackStore,
} from './notifications';
import type { Pile } from './pile/types';
import type { LaborEvent } from './events/types';
import type { Listing } from './listings/types';

const FUTURE_BUILD_DAYS = 30; // pile build sits 30 days in the future

function makePile(plannedBuildDate: number): Pile {
  return {
    d: 'pile-001',
    name: 'Backyard pile',
    builder: 'pubkey-builder',
    dimensions: { length: 2, width: 2, height: 2 },
    presetId: 'standard',
    plannedBuildDate,
    timezone: 'America/New_York',
    layers: [],
    turnRecords: [],
    state: 'COLLECTING',
    photos: [],
    version: 1,
  };
}

beforeEach(() => {
  _resetNotificationsForTests();
});

afterEach(() => {
  _resetNotificationsForTests();
});

describe('requestPermission', () => {
  it('returns granted from the Tauri plugin (cached)', async () => {
    const r1 = await requestPermission();
    expect(r1).toBe('granted');
    // Cached: changing the mock now should not affect result.
    const mod = await import('@tauri-apps/plugin-notification');
    (mod.requestPermission as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      'denied',
    );
    const r2 = await requestPermission();
    expect(r2).toBe('granted');
  });
});

describe('scheduleNotificationsForPile', () => {
  it('schedules 6 notifications for a future-dated pile (permission granted)', async () => {
    _setPermissionForTests('granted');
    const buildDate =
      Math.floor(Date.now() / 1000) + FUTURE_BUILD_DAYS * 86400;
    const pile = makePile(buildDate);

    await scheduleNotificationsForPile(pile);

    const pending = getPending();
    const refs = pending.get(`pile:${pile.d}`);
    expect(refs).toBeDefined();
    expect(refs).toHaveLength(6);
  });

  it('cancelNotificationsFor clears the pile entries', async () => {
    _setPermissionForTests('granted');
    const buildDate =
      Math.floor(Date.now() / 1000) + FUTURE_BUILD_DAYS * 86400;
    const pile = makePile(buildDate);

    await scheduleNotificationsForPile(pile);
    expect(getPending().get(`pile:${pile.d}`)).toHaveLength(6);

    await cancelNotificationsFor(`pile:${pile.d}`);
    expect(getPending().get(`pile:${pile.d}`)).toBeUndefined();
  });

  it('skips past-dated turns', async () => {
    _setPermissionForTests('granted');
    // Build was 10 days ago — turns 1, 2, 3 (days 3,6,9) are in the past;
    // turns 4, 5, 6 (days 19, 29, 39) are still in the future.
    const buildDate = Math.floor(Date.now() / 1000) - 10 * 86400;
    const pile = makePile(buildDate);

    await scheduleNotificationsForPile(pile);

    const refs = getPending().get(`pile:${pile.d}`) ?? [];
    expect(refs).toHaveLength(3);
  });

  it('returns without throwing and populates fallback store when denied', async () => {
    _setPermissionForTests('denied');
    const buildDate =
      Math.floor(Date.now() / 1000) + FUTURE_BUILD_DAYS * 86400;
    const pile = makePile(buildDate);

    await expect(scheduleNotificationsForPile(pile)).resolves.toBeUndefined();
    expect(getPending().size).toBe(0);
    const fallback = useNotificationsFallbackStore.getState().pendingFallback;
    expect(fallback).toHaveLength(6);
    expect(fallback.every((e) => e.refId === `pile:${pile.d}`)).toBe(true);
  });
});

describe('scheduleNotificationsForRsvp', () => {
  function makeEvent(startSec: number): LaborEvent {
    return {
      kind: 'pile-turn',
      title: 'Pile turn',
      description: '',
      start: startSec,
      version: 1,
    };
  }

  it('emits 2 notifications when both 24h and 1h windows are in the future', async () => {
    _setPermissionForTests('granted');
    const start = Math.floor(Date.now() / 1000) + 2 * 86400; // 48h ahead
    await scheduleNotificationsForRsvp(makeEvent(start), 'event:abc');
    const refs = getPending().get('event:abc') ?? [];
    expect(refs).toHaveLength(2);
  });

  it('emits 1 notification when only the 1h window remains', async () => {
    _setPermissionForTests('granted');
    // Start in 90 minutes — 24h window already past, 1h window still future.
    const start = Math.floor(Date.now() / 1000) + 90 * 60;
    await scheduleNotificationsForRsvp(makeEvent(start), 'event:soon');
    const refs = getPending().get('event:soon') ?? [];
    expect(refs).toHaveLength(1);
  });

  it('emits 0 notifications when both windows are past', async () => {
    _setPermissionForTests('granted');
    // Start 30 minutes ago — both windows past.
    const start = Math.floor(Date.now() / 1000) - 30 * 60;
    await scheduleNotificationsForRsvp(makeEvent(start), 'event:past');
    expect(getPending().get('event:past')).toBeUndefined();
  });
});

describe('scheduleNotificationsForListing', () => {
  function makeListing(expiresAt: number | undefined): Listing {
    return {
      kind: 'offer',
      material: 'compost-finished',
      title: 'Free finished compost',
      description: '',
      photos: [],
      expiresAt,
      version: 1,
    };
  }

  it('schedules 1 notification 24h before expiry', async () => {
    _setPermissionForTests('granted');
    const expires = Math.floor(Date.now() / 1000) + 5 * 86400;
    await scheduleNotificationsForListing(
      makeListing(expires),
      'listing:offer-1',
    );
    const refs = getPending().get('listing:offer-1') ?? [];
    expect(refs).toHaveLength(1);
  });

  it('skips when expiresAt is missing or too soon', async () => {
    _setPermissionForTests('granted');
    await scheduleNotificationsForListing(
      makeListing(undefined),
      'listing:no-expiry',
    );
    expect(getPending().get('listing:no-expiry')).toBeUndefined();

    const soon = Math.floor(Date.now() / 1000) + 60 * 60; // 1 hour
    await scheduleNotificationsForListing(makeListing(soon), 'listing:soon');
    expect(getPending().get('listing:soon')).toBeUndefined();
  });
});
