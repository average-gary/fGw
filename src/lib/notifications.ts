/**
 * SPEC-029 — Local notifications (turn days, RSVPs, expiring listings).
 *
 * Time-sensitive reminders without server push. On Tauri we forward to
 * `@tauri-apps/plugin-notification`'s `sendNotification` / `cancel` APIs and
 * use the plugin's own `Schedule.at(date, ...)` to schedule future fires
 * (verified against
 * `node_modules/@tauri-apps/plugin-notification/dist-js/index.d.ts`:
 * `sendNotification(options: Options | string)` accepts `schedule?: Schedule`,
 * and `cancel(notifications: number[])` removes pending ids).
 *
 * On the web we degrade to a no-op scheduler — we still record entries in the
 * registry so the UI can show "would have notified" state. When permission is
 * denied we additionally push entries into a small zustand fallback store so
 * SPEC-019/021 routes can render an in-app banner.
 *
 * Tauri detection: we prefer `isTauri()` from `@tauri-apps/api/core` (already
 * used by SPEC-009's `nsecLocal.ts`); inside `isTauriEnv()` we wrap that call
 * in a try/catch so that if the import is somehow unavailable in a test
 * environment we fall back to checking `window.__TAURI_INTERNALS__`.
 */
import { create } from 'zustand';
import { isTauri } from '@tauri-apps/api/core';
import {
  sendNotification,
  cancel as tauriCancel,
  requestPermission as tauriRequestPermission,
  Schedule,
} from '@tauri-apps/plugin-notification';
import { generateTurnEvents } from './pile/schedule';
import type { Pile } from './pile/types';
import type { LaborEvent } from './events/types';
import type { Listing } from './listings/types';

export type Permission = 'granted' | 'denied';

export interface ScheduledRef {
  /** Unix milliseconds when the notification should fire. */
  scheduledFor: number;
  payload: { title: string; body: string };
  /** 32-bit integer used by tauri-plugin-notification when on native. */
  tauriId?: number;
}

interface FallbackStore {
  pendingFallback: Array<{ refId: string; ref: ScheduledRef }>;
  push: (refId: string, ref: ScheduledRef) => void;
  drop: (refId: string) => void;
  reset: () => void;
}

export const useNotificationsFallbackStore = create<FallbackStore>((set) => ({
  pendingFallback: [],
  push: (refId, ref) =>
    set((s) => ({ pendingFallback: [...s.pendingFallback, { refId, ref }] })),
  drop: (refId) =>
    set((s) => ({
      pendingFallback: s.pendingFallback.filter((e) => e.refId !== refId),
    })),
  reset: () => set({ pendingFallback: [] }),
}));

const registry = new Map<string, ScheduledRef[]>();
let permissionCache: Permission | null = null;
let nextTauriId = 1;

function isTauriEnv(): boolean {
  try {
    if (isTauri()) return true;
  } catch {
    /* fall through */
  }
  return (
    typeof window !== 'undefined' &&
    (window as unknown as { __TAURI_INTERNALS__?: unknown })
      .__TAURI_INTERNALS__ !== undefined
  );
}

function nowMs(): number {
  return Date.now();
}

/** Reset all module state. Test-only helper. */
export function _resetNotificationsForTests(): void {
  registry.clear();
  permissionCache = null;
  nextTauriId = 1;
  useNotificationsFallbackStore.getState().reset();
}

/**
 * Request notification permission (wraps plugin / web API). Cached so
 * subsequent calls do not re-prompt the user.
 */
export async function requestPermission(): Promise<Permission> {
  if (permissionCache !== null) return permissionCache;
  try {
    if (isTauriEnv()) {
      const r = await tauriRequestPermission();
      permissionCache = r === 'granted' ? 'granted' : 'denied';
      return permissionCache;
    }
    if (
      typeof Notification !== 'undefined' &&
      typeof Notification.requestPermission === 'function'
    ) {
      const r = await Notification.requestPermission();
      permissionCache = r === 'granted' ? 'granted' : 'denied';
      return permissionCache;
    }
  } catch {
    /* swallow — fall through to denied */
  }
  permissionCache = 'denied';
  return permissionCache;
}

/** Force the permission cache (test seam). */
export function _setPermissionForTests(p: Permission | null): void {
  permissionCache = p;
}

function pushToFallback(refId: string, ref: ScheduledRef): void {
  useNotificationsFallbackStore.getState().push(refId, ref);
}

async function scheduleOne(
  refId: string,
  ref: ScheduledRef,
  permission: Permission,
): Promise<void> {
  if (permission === 'denied') {
    pushToFallback(refId, ref);
    return;
  }
  if (isTauriEnv()) {
    const id = nextTauriId++;
    ref.tauriId = id;
    try {
      sendNotification({
        id,
        title: ref.payload.title,
        body: ref.payload.body,
        schedule: Schedule.at(new Date(ref.scheduledFor), false, true),
      });
    } catch {
      /* plugin unavailable in test — registry still tracks the entry */
    }
  }
  const arr = registry.get(refId) ?? [];
  arr.push(ref);
  registry.set(refId, arr);
}

/**
 * Schedule one notification per upcoming, uncompleted turn for `pile`. Each
 * fires at the turn's `start` (already snapped to 09:00 in the pile's tz by
 * `generateTurnEvents`). RefId: `pile:<pile.d>`.
 */
export async function scheduleNotificationsForPile(pile: Pile): Promise<void> {
  const permission = await requestPermission();
  const refId = `pile:${pile.d}`;
  const events = generateTurnEvents(pile);
  const now = nowMs();
  for (const ev of events) {
    const idx = (ev.turnIndex ?? 1) - 1;
    if (pile.turnRecords[idx]?.completedAt) continue;
    const fireMs = ev.start * 1000;
    if (fireMs <= now) continue;
    await scheduleOne(
      refId,
      {
        scheduledFor: fireMs,
        payload: {
          title: `Turn ${ev.turnIndex ?? idx + 1} — ${pile.name}`,
          body: `Time to turn the pile (turn ${ev.turnIndex ?? idx + 1} of 6).`,
        },
      },
      permission,
    );
  }
}

/**
 * Schedule 24h + 1h reminders before `event.start`. RefId is supplied
 * explicitly because `LaborEvent` has no public `d`/id; the cleanest call
 * site shape is for the caller (RSVP encoder, calendar route) to pass the
 * NIP-52 `d` tag (or any stable id) through.
 */
export async function scheduleNotificationsForRsvp(
  event: LaborEvent,
  refId: string,
): Promise<void> {
  const permission = await requestPermission();
  const startMs = event.start * 1000;
  const now = nowMs();
  const windows: Array<{ at: number; label: string }> = [
    { at: startMs - 24 * 60 * 60 * 1000, label: 'tomorrow' },
    { at: startMs - 60 * 60 * 1000, label: 'in 1 hour' },
  ];
  for (const w of windows) {
    if (w.at <= now) continue;
    await scheduleOne(
      refId,
      {
        scheduledFor: w.at,
        payload: {
          title: event.title,
          body: `Starting ${w.label}.`,
        },
      },
      permission,
    );
  }
}

/**
 * Schedule a single 24h-before-expiry reminder for `listing`. RefId is
 * supplied explicitly for the same reason as RSVPs (Listing has no `d` on
 * the type).
 */
export async function scheduleNotificationsForListing(
  listing: Listing,
  refId: string,
): Promise<void> {
  if (!listing.expiresAt) return;
  const permission = await requestPermission();
  const fireMs = listing.expiresAt * 1000 - 24 * 60 * 60 * 1000;
  if (fireMs <= nowMs()) return;
  await scheduleOne(
    refId,
    {
      scheduledFor: fireMs,
      payload: {
        title: listing.title,
        body: 'Listing expires in 24 hours.',
      },
    },
    permission,
  );
}

/**
 * Cancel every notification scheduled under `refId`. On Tauri we forward
 * each `tauriId` to the plugin's `cancel(...)` so the OS scheduler drops
 * them too.
 */
export async function cancelNotificationsFor(refId: string): Promise<void> {
  const refs = registry.get(refId);
  if (refs && isTauriEnv()) {
    const ids = refs.map((r) => r.tauriId).filter((x): x is number => !!x);
    if (ids.length) {
      try {
        await tauriCancel(ids);
      } catch {
        /* plugin unavailable in test */
      }
    }
  }
  registry.delete(refId);
  useNotificationsFallbackStore.getState().drop(refId);
}

/** Test/inspection helper — snapshot of the registry. */
export function getPending(): Map<string, ScheduledRef[]> {
  const out = new Map<string, ScheduledRef[]>();
  for (const [k, v] of registry.entries()) out.set(k, [...v]);
  return out;
}
