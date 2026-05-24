/**
 * Crash-report I/O layer (Phase 2): error-handler install, localStorage
 * persistence, queue API.
 *
 * Pure domain logic (schema, redaction, `buildReport`) lives in
 * `@/domain/crashReports`. The Nostr DM sender lives elsewhere (Phase 3).
 *
 * Design grounding: see
 * `.wiki/output/projects/crash-reports/plan-crash-reports-2026-05-22.md`
 * — Decision 3 (`localStorage` everywhere) and Phase 2 task list.
 *
 * The crash handler runs in the renderer death path, so all writes are
 * synchronous and wrapped in try/catch — a thrown `localStorage.setItem`
 * (quota / privacy mode) drops the report rather than escalating into a
 * second crash.
 */
import * as nip19 from 'nostr-tools/nip19';
import {
  CRASH_REPORT_QUEUE_CAP,
  MAINTAINER_NPUB,
  buildReport,
  type CrashReport,
} from '@/domain/crashReports';
import { DmError, sendDm } from './dm';

/**
 * `localStorage` key under which the crash queue is persisted. Exported so
 * tests can manipulate the slot directly without depending on the queue
 * write path.
 */
export const CRASH_REPORT_STORAGE_KEY = 'fGw.crashReports';

// Module-level install state. The handlers + uninstall function are also
// kept here so a second `installCrashHandlers()` call is a true no-op:
// the same uninstall closure is returned, and a single uninstall
// removes both listeners exactly once.
let installed = false;
let uninstallFn: (() => void) | null = null;

function readQueue(): CrashReport[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(CRASH_REPORT_STORAGE_KEY);
    if (raw == null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isCrashReportShape);
  } catch {
    return [];
  }
}

function writeQueue(queue: CrashReport[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(CRASH_REPORT_STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // Quota exceeded / privacy mode / disabled storage — drop silently.
    // The crash handler must never throw.
  }
}

function isCrashReportShape(v: unknown): v is CrashReport {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.version === 'number' &&
    typeof r.ts === 'number' &&
    typeof r.app_version === 'string' &&
    typeof r.commit_sha === 'string' &&
    typeof r.platform === 'string' &&
    typeof r.error_name === 'string' &&
    typeof r.error_message === 'string' &&
    typeof r.stack === 'string'
  );
}

/**
 * Synchronously append a `CrashReport` to the on-device queue, evicting
 * the oldest entry if the cap would be exceeded. Internal helper shared by
 * `enqueueReport` and the window event handlers.
 *
 * Never throws: a failed `localStorage.setItem` (quota / privacy mode)
 * silently drops the report.
 */
function appendToQueue(report: CrashReport): void {
  try {
    const queue = readQueue();
    queue.push(report);
    while (queue.length > CRASH_REPORT_QUEUE_CAP) {
      queue.shift();
    }
    writeQueue(queue);
  } catch {
    // Defensive — readQueue/writeQueue already swallow their own errors,
    // but the crash handler must not propagate anything.
  }
}

/**
 * Build a `CrashReport` from a thrown value and append it to the on-device
 * queue. Exported so the React error boundary can call into the same write
 * path the window-level handlers use.
 *
 * Synchronous and exception-safe.
 */
export function enqueueReport(err: unknown): void {
  try {
    const report = buildReport(err);
    appendToQueue(report);
  } catch {
    // `buildReport` reads `import.meta.env` and `navigator.userAgent`; in
    // a degenerate environment any of those could throw. Drop silently.
  }
}

function onWindowError(ev: ErrorEvent): void {
  // `ev.error` is the thrown value when available; some browsers populate
  // only `message`, in which case we fall back to a synthesized Error.
  const thrown = ev.error ?? new Error(ev.message || 'Unknown error');
  enqueueReport(thrown);
}

function onUnhandledRejection(ev: Event): void {
  // `PromiseRejectionEvent` extends `Event` with a `reason` field. We type
  // the parameter as `Event` because happy-dom doesn't expose
  // `PromiseRejectionEvent` at all — but `Event#reason` still round-trips
  // when set via `Object.defineProperty`, which is what tests do.
  const reason = (ev as Event & { reason?: unknown }).reason;
  enqueueReport(reason ?? new Error('Unhandled promise rejection'));
}

/**
 * Install global crash handlers on `window`. Returns a function that
 * removes both listeners.
 *
 * Idempotent: a second call without uninstalling between is a no-op and
 * returns the same uninstall closure as the first call.
 */
export function installCrashHandlers(): () => void {
  if (installed && uninstallFn != null) {
    return uninstallFn;
  }
  if (typeof window === 'undefined') {
    // SSR / non-browser environment — return a no-op. Treat as installed
    // so a second call doesn't try again.
    installed = true;
    uninstallFn = () => {
      installed = false;
      uninstallFn = null;
    };
    return uninstallFn;
  }
  window.addEventListener('error', onWindowError);
  window.addEventListener('unhandledrejection', onUnhandledRejection);
  installed = true;
  uninstallFn = () => {
    window.removeEventListener('error', onWindowError);
    window.removeEventListener('unhandledrejection', onUnhandledRejection);
    installed = false;
    uninstallFn = null;
  };
  return uninstallFn;
}

/**
 * Synchronously read the persisted crash queue. Returns `[]` on missing
 * key, parse error, or any other read failure. Defensive shape-filter
 * tolerates externally-mutated localStorage.
 */
export function getQueuedReports(): CrashReport[] {
  return readQueue();
}

/**
 * Remove the queued report with the matching `ts` (capture timestamp).
 * No-op if the queue does not contain that entry.
 */
export function clearReport(ts: number): void {
  const queue = readQueue();
  const next = queue.filter((r) => r.ts !== ts);
  if (next.length === queue.length) return;
  writeQueue(next);
}

/**
 * Remove all queued reports. Removes the localStorage slot entirely so
 * subsequent reads see a clean missing-key state.
 */
export function clearAllReports(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(CRASH_REPORT_STORAGE_KEY);
  } catch {
    // Ignore — clearing a non-existent or unavailable slot is fine.
  }
}

/**
 * Result of `sendCrashReport`. Discriminated union so callers can branch on
 * `ok` and surface a specific reason for the failure modes that actually
 * matter (no signer → "sign in first"; anything else → generic "try again
 * later"). The function never throws; all errors land here.
 */
export type SendCrashReportResult =
  | { ok: true }
  | { ok: false; reason: 'no-signer' | 'decode-failed' | 'send-failed' };

/**
 * Ship one queued `CrashReport` to the maintainer as a NIP-17 gift-wrapped
 * DM. On success, removes the report from the on-device queue. On
 * `no-signer` the report stays queued so a later boot (with a signer
 * available) can retry.
 *
 * Never throws — every error path resolves to `{ ok: false, reason }`.
 *
 * Design grounding: see plan Phase 3 + Decision 1 (real signer, not
 * ephemeral) in
 * `.wiki/output/projects/crash-reports/plan-crash-reports-2026-05-22.md`.
 */
export async function sendCrashReport(
  report: CrashReport,
): Promise<SendCrashReportResult> {
  let maintainerHex: string;
  try {
    const decoded = nip19.decode(MAINTAINER_NPUB);
    if (decoded.type !== 'npub' || typeof decoded.data !== 'string') {
      return { ok: false, reason: 'decode-failed' };
    }
    maintainerHex = decoded.data;
  } catch {
    return { ok: false, reason: 'decode-failed' };
  }

  try {
    await sendDm(maintainerHex, JSON.stringify(report));
  } catch (err) {
    if (err instanceof DmError && err.kind === 'no-signer') {
      return { ok: false, reason: 'no-signer' };
    }
    return { ok: false, reason: 'send-failed' };
  }

  clearReport(report.ts);
  return { ok: true };
}
