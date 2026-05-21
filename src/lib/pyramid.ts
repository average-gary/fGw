/**
 * SPEC-025 / SPEC-049 / SPEC-050 — Pyramid invite-only relay client + state
 * hooks.
 *
 * Pyramid (`fiatjaf/pyramid`) is an invite-tree allowlist relay. Its
 * programmatic admin surface is **NIP-86**: a JSON-RPC envelope POSTed to
 * the relay's HTTPS root, authenticated via a NIP-98 event in the
 * `Authorization: Nostr <base64>` header. NIP-86 also requires a `payload`
 * tag holding the hex sha256 of the request body (NIP-98 normally marks it
 * optional; Pyramid enforces it). The legacy `/allow`, `/ban`, `/allowed`,
 * `/banned` HTTP endpoints don't exist on `chat.virginiafreedom.tech`; this
 * module talks NIP-86 instead.
 *
 * Read methods we use: `listallowedpubkeys`, `listbannedpubkeys`.
 * Write methods we use: `allowpubkey`, `banpubkey`.
 *
 * This module provides:
 *   - `useMembershipStatus(pubkey)` — React hook backed by a zustand cache,
 *     refreshed on chapter swap and via the deterministic
 *     `MembershipPoller` (SPEC-050).
 *   - `startMembershipPoller()` / `stopMembershipPoller()` — wire-on-boot
 *     polling triggers (every 5 min foreground, on visibility-change, and
 *     on chapter relay change). Idempotent.
 *   - `inviteByNpub(npub)` / `dropMember(pubkey)` — NIP-86 RPC calls.
 *   - `parseMemberPage(html)` — extracts inviter/invitee chains from the
 *     `/u/{pubkey}` HTML (still HTML-scraped; NIP-86 doesn't expose the
 *     invite tree).
 *   - `usePublishGuard()` — wraps any publish call; on `restricted` /
 *     `auth-required` rejection it flips a `blocked` flag so callers can
 *     render the SPEC-026 "request invite" sheet.
 *
 * Selector contract for `parseMemberPage`: Pyramid renders members as
 * `<a href="/u/<hex>">…</a>`. We extract the 64-hex-char `<pubkey>` from
 * those hrefs. If the template ever drops the `/u/` prefix or hex-encodes
 * pubkeys differently, parsers gracefully return empty arrays rather than
 * throw.
 */
import { useEffect } from 'react';
import { create } from 'zustand';
import { NDKEvent, type NDKSigner } from '@nostr-dev-kit/ndk';
import * as nip19 from 'nostr-tools/nip19';
import { useAuthStore } from './auth';
import { useChapterStore } from './chapter';
import { getNdk } from './ndk';
import { relayHttpsBase } from './blossom';

// Re-export so callers depending on SPEC-025 don't have to import blossom.
export { relayHttpsBase };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MembershipStatus = 'unknown' | 'allowed' | 'banned' | 'not-listed';

export interface Member {
  pubkey: string;
  npub?: string;
  level?: number;
}

export interface MemberInfo {
  pubkey: string;
  inviters: string[];
  invitees: string[];
}

export type InviteError =
  | 'not-authed'
  | 'over-quota'
  | 'cycle'
  | 'already-member'
  | 'forbidden'
  | 'network';

export type DropError = 'not-authed' | 'forbidden' | 'not-found' | 'network';

export type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };

// ---------------------------------------------------------------------------
// Zustand store
// ---------------------------------------------------------------------------

interface PyramidStore {
  statusByPubkey: Record<string, MembershipStatus>;
  members: Member[];
  banned: Member[];
  lastFetchedAt: number;
  _set: (patch: Partial<PyramidStore>) => void;
  _setStatus: (pubkey: string, status: MembershipStatus) => void;
  _appendMember: (m: Member) => void;
}

export const usePyramidStore = create<PyramidStore>((set) => ({
  statusByPubkey: {},
  members: [],
  banned: [],
  lastFetchedAt: 0,
  _set: (patch) => set(patch),
  _setStatus: (pubkey, status) =>
    set((s) => ({ statusByPubkey: { ...s.statusByPubkey, [pubkey]: status } })),
  _appendMember: (m) =>
    set((s) =>
      s.members.find((x) => x.pubkey === m.pubkey)
        ? s
        : { members: [...s.members, m] },
    ),
}));

// Bust the cache when the chapter relay changes.
useChapterStore.subscribe((state, prev) => {
  if (state.currentRelay === prev.currentRelay) return;
  usePyramidStore.setState({
    statusByPubkey: {},
    members: [],
    banned: [],
    lastFetchedAt: 0,
  });
});

// ---------------------------------------------------------------------------
// HTML parsing helpers
// ---------------------------------------------------------------------------

const HEX64 = /^[0-9a-f]{64}$/i;
const U_HREF = /\/u\/([0-9a-f]{64})/gi;

function extractAllPubkeys(html: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  U_HREF.lastIndex = 0;
  while ((m = U_HREF.exec(html)) !== null) {
    const pk = (m[1] ?? '').toLowerCase();
    if (HEX64.test(pk) && !seen.has(pk)) {
      seen.add(pk);
      out.push(pk);
    }
  }
  return out;
}

/**
 * Parse `/u/{pubkey}` HTML into inviters and invitees.
 *
 * Pyramid's templ files render two adjacent sections — "Invited by" then
 * "Invited members" — each containing `<a href="/u/<hex>">` links. We split
 * the document on a case-insensitive "invited members" landmark; pubkeys
 * before the split go to `inviters`, after it go to `invitees`. If the
 * landmark is missing the parser falls back to empty arrays.
 */
export function parseMemberPage(html: string): MemberInfo {
  const pageMatch = /\/u\/([0-9a-f]{64})/i.exec(html);
  const pubkey = (pageMatch?.[1] ?? '').toLowerCase();
  const out: MemberInfo = { pubkey, inviters: [], invitees: [] };
  if (!html) return out;

  // Split on the "Invited members" / "Invitees" landmark heading.
  const split = /invited\s+members|invitees/i.exec(html);
  if (!split) return out;
  const before = html.slice(0, split.index);
  const after = html.slice(split.index);

  const inviterPks = extractAllPubkeys(before).filter((pk) => pk !== pubkey);
  const inviteePks = extractAllPubkeys(after).filter((pk) => pk !== pubkey);

  out.inviters = inviterPks;
  out.invitees = inviteePks;
  return out;
}

// ---------------------------------------------------------------------------
// NIP-86 transport helper
// ---------------------------------------------------------------------------

function currentBase(): string {
  return relayHttpsBase(useChapterStore.getState().currentRelay);
}

function b64encode(s: string): string {
  // btoa requires Latin-1; encode UTF-8 bytes first.
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i] ?? 0);
  return btoa(bin);
}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buf);
  const bytes = new Uint8Array(digest);
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    s += (bytes[i] ?? 0).toString(16).padStart(2, '0');
  }
  return s;
}

/**
 * NIP-86 RPC call: POST `{method, params}` to the relay's HTTPS root, signed
 * with a NIP-98 kind-27235 event whose `payload` tag is the hex sha256 of
 * the request body. Throws on transport failure, 401, non-2xx HTTP, or a
 * 200-with-error envelope.
 *
 * The signer is read from `useAuthStore`. Callers (`listMembers`, etc.) are
 * responsible for catching and mapping errors to their typed result unions.
 */
async function nip86Call<T = unknown>(
  signer: NDKSigner,
  method: string,
  params: unknown[],
): Promise<T> {
  const httpUrl = currentBase();
  const body = JSON.stringify({ method, params });
  const bodyBytes = new TextEncoder().encode(body);
  // Slice to a fresh ArrayBuffer to avoid SharedArrayBuffer typing surprises.
  const payloadHash = await sha256Hex(
    bodyBytes.buffer.slice(
      bodyBytes.byteOffset,
      bodyBytes.byteOffset + bodyBytes.byteLength,
    ),
  );

  const auth = new NDKEvent(getNdk());
  auth.kind = 27235;
  auth.created_at = Math.floor(Date.now() / 1000);
  auth.content = '';
  auth.tags = [
    ['u', httpUrl],
    ['method', 'POST'],
    ['payload', payloadHash],
  ];
  await auth.sign(signer);

  const token = b64encode(JSON.stringify(auth.rawEvent()));
  let res: Response;
  try {
    res = await fetch(httpUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/nostr+json+rpc',
        Authorization: `Nostr ${token}`,
      },
      body,
    });
  } catch (err) {
    // Re-throw as a TypeError-shaped error so callers can detect "network".
    throw err instanceof Error ? err : new Error(String(err));
  }
  if (res.status === 401) throw new Error('NIP-86: unauthorized');
  if (!res.ok) throw new Error(`NIP-86 ${method}: HTTP ${res.status}`);
  let json: { result?: T; error?: string };
  try {
    json = (await res.json()) as { result?: T; error?: string };
  } catch {
    throw new Error(`NIP-86 ${method}: invalid JSON response`);
  }
  if (json.error) throw new Error(`NIP-86 ${method}: ${json.error}`);
  return json.result as T;
}

// ---------------------------------------------------------------------------
// listMembers / listBanned
// ---------------------------------------------------------------------------

interface PubkeyEntry {
  pubkey: string;
  reason?: string;
}

function entriesToMembers(entries: unknown): Member[] {
  if (!Array.isArray(entries)) return [];
  const out: Member[] = [];
  const seen = new Set<string>();
  for (const raw of entries) {
    if (!raw || typeof raw !== 'object') continue;
    const pkRaw = (raw as { pubkey?: unknown }).pubkey;
    if (typeof pkRaw !== 'string') continue;
    const pk = pkRaw.toLowerCase();
    if (!HEX64.test(pk) || seen.has(pk)) continue;
    seen.add(pk);
    try {
      out.push({ pubkey: pk, npub: nip19.npubEncode(pk) });
    } catch {
      out.push({ pubkey: pk });
    }
  }
  return out;
}

export async function listMembers(): Promise<Member[]> {
  const signer = useAuthStore.getState().signer;
  if (!signer) {
    // Pyramid's read methods still require auth; degrade gracefully (mirrors
    // the previous fetch-and-swallow semantics so membership hooks don't
    // crash when the user is signed out).
    usePyramidStore.setState({ members: [], lastFetchedAt: Date.now() });
    return [];
  }
  let entries: PubkeyEntry[];
  try {
    entries = await nip86Call<PubkeyEntry[]>(signer, 'listallowedpubkeys', []);
  } catch {
    usePyramidStore.setState({ members: [], lastFetchedAt: Date.now() });
    return [];
  }
  const members = entriesToMembers(entries);
  usePyramidStore.setState({ members, lastFetchedAt: Date.now() });
  // Mirror into per-pubkey status cache.
  const patch: Record<string, MembershipStatus> = {};
  for (const m of members) patch[m.pubkey] = 'allowed';
  usePyramidStore.setState((s) => ({
    statusByPubkey: { ...s.statusByPubkey, ...patch },
  }));
  return members;
}

export async function listBanned(): Promise<Member[]> {
  const signer = useAuthStore.getState().signer;
  if (!signer) {
    usePyramidStore.setState({ banned: [] });
    return [];
  }
  let entries: PubkeyEntry[];
  try {
    entries = await nip86Call<PubkeyEntry[]>(signer, 'listbannedpubkeys', []);
  } catch {
    usePyramidStore.setState({ banned: [] });
    return [];
  }
  const banned = entriesToMembers(entries);
  usePyramidStore.setState({ banned });
  const patch: Record<string, MembershipStatus> = {};
  for (const m of banned) patch[m.pubkey] = 'banned';
  usePyramidStore.setState((s) => ({
    statusByPubkey: { ...s.statusByPubkey, ...patch },
  }));
  return banned;
}

// ---------------------------------------------------------------------------
// inviteByNpub / dropMember
// ---------------------------------------------------------------------------

/**
 * Map a thrown error from `nip86Call` to an `InviteError`. The matchers are
 * substring-based against the error message because Pyramid surfaces
 * free-form reasons in the NIP-86 `error` field (and we wrap HTTP
 * non-success codes into `NIP-86 <method>: HTTP <n>`).
 */
function classifyInviteError(err: unknown): InviteError {
  if (err instanceof TypeError) return 'network';
  const msg = err instanceof Error ? err.message : String(err ?? '');
  if (msg === 'NIP-86: unauthorized') return 'not-authed';
  const lower = msg.toLowerCase();
  if (lower.includes('quota') || lower.includes('too many')) return 'over-quota';
  if (lower.includes('cycle') || lower.includes('loop')) return 'cycle';
  if (lower.includes('already')) return 'already-member';
  if (/^nip-86 allowpubkey: http 5\d\d/i.test(msg)) return 'network';
  return 'forbidden';
}

function classifyDropError(err: unknown): DropError {
  if (err instanceof TypeError) return 'network';
  const msg = err instanceof Error ? err.message : String(err ?? '');
  if (msg === 'NIP-86: unauthorized') return 'not-authed';
  const lower = msg.toLowerCase();
  if (lower.includes('not found') || lower.includes('unknown pubkey')) {
    return 'not-found';
  }
  if (/^nip-86 banpubkey: http 5\d\d/i.test(msg)) return 'network';
  return 'forbidden';
}

export async function inviteByNpub(
  npub: string,
): Promise<Result<void, InviteError>> {
  const signer = useAuthStore.getState().signer;
  if (!signer) return { ok: false, error: 'not-authed' };

  let hex: string;
  try {
    const decoded = nip19.decode(npub);
    if (decoded.type !== 'npub' || typeof decoded.data !== 'string') {
      return { ok: false, error: 'forbidden' };
    }
    hex = decoded.data;
  } catch {
    return { ok: false, error: 'forbidden' };
  }

  let result: unknown;
  try {
    result = await nip86Call<unknown>(signer, 'allowpubkey', [hex]);
  } catch (err) {
    return { ok: false, error: classifyInviteError(err) };
  }
  if (result !== true) {
    return { ok: false, error: 'forbidden' };
  }

  usePyramidStore.getState()._setStatus(hex, 'allowed');
  let npubEnc: string | undefined;
  try {
    npubEnc = nip19.npubEncode(hex);
  } catch {
    /* ignore */
  }
  const member: Member = npubEnc ? { pubkey: hex, npub: npubEnc } : { pubkey: hex };
  usePyramidStore.getState()._appendMember(member);
  return { ok: true, value: undefined };
}

export async function dropMember(
  pubkey: string,
): Promise<Result<void, DropError>> {
  const signer = useAuthStore.getState().signer;
  if (!signer) return { ok: false, error: 'not-authed' };
  if (!HEX64.test(pubkey)) return { ok: false, error: 'not-found' };

  const hex = pubkey.toLowerCase();
  let result: unknown;
  try {
    result = await nip86Call<unknown>(signer, 'banpubkey', [hex]);
  } catch (err) {
    return { ok: false, error: classifyDropError(err) };
  }
  if (result !== true) {
    return { ok: false, error: 'forbidden' };
  }

  usePyramidStore.getState()._setStatus(hex, 'banned');
  usePyramidStore.setState((s) => ({
    members: s.members.filter((m) => m.pubkey !== hex),
  }));
  return { ok: true, value: undefined };
}

// ---------------------------------------------------------------------------
// useMembershipStatus
// ---------------------------------------------------------------------------

const STALE_MS = 60_000;
let inflightRefresh: Promise<void> | null = null;

async function refreshMembership(): Promise<void> {
  if (inflightRefresh) return inflightRefresh;
  inflightRefresh = (async () => {
    try {
      await Promise.all([listMembers(), listBanned()]);
    } finally {
      inflightRefresh = null;
    }
  })();
  return inflightRefresh;
}

/**
 * SPEC-050 — Deterministic membership polling.
 *
 * Replaces the (defensive but never-firing) NDK subscription removed with
 * this spec. Pyramid never broadcasts membership-change events to
 * subscribers (NIP-42 reserves the only kind that carried that meaning for
 * client→relay AUTH challenge responses), so we poll on a deterministic
 * schedule instead.
 *
 * Triggers:
 *   1. boot: immediate fetch when `start()` is called.
 *   2. foreground: every 5 minutes via `setInterval`. The interval
 *      callback skips when the document is backgrounded so we don't burn
 *      battery off-screen.
 *   3. visibility-change: when the tab/app comes back to the foreground,
 *      fire an immediate fetch.
 *   4. chapter-store change: when `currentRelay` flips, fire an immediate
 *      fetch (the existing module-level subscriber wipes the cache; this
 *      poller subscriber re-fills it).
 *
 * Idempotent: calling `start()` twice is a no-op. `stop()` is provided for
 * symmetry (used in tests; useful for future logout flows).
 */
const POLL_INTERVAL_MS = 5 * 60 * 1000;

class MembershipPoller {
  private timer: ReturnType<typeof setInterval> | null = null;
  private chapterUnsubscribe: (() => void) | null = null;
  private started = false;

  start(): void {
    if (this.started) return;
    this.started = true;

    // Immediate fetch on boot.
    void refreshMembership();

    // Foreground cadence — skip when backgrounded.
    this.timer = setInterval(() => {
      if (
        typeof document === 'undefined' ||
        document.visibilityState === 'visible'
      ) {
        void refreshMembership();
      }
    }, POLL_INTERVAL_MS);

    // Visibility change (foreground return).
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibility);
    }

    // Chapter relay change. The module-level subscriber above wipes the
    // cache on change; this one re-fills it with a fresh fetch.
    this.chapterUnsubscribe = useChapterStore.subscribe((state, prev) => {
      if (state.currentRelay !== prev.currentRelay) {
        void refreshMembership();
      }
    });
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibility);
    }
    this.chapterUnsubscribe?.();
    this.chapterUnsubscribe = null;
  }

  private onVisibility = (): void => {
    if (typeof document === 'undefined') return;
    if (document.visibilityState === 'visible') {
      void refreshMembership();
    }
  };
}

const membershipPoller = new MembershipPoller();

/** Start the membership poller. Idempotent — safe to call from any boot path. */
export function startMembershipPoller(): void {
  membershipPoller.start();
}

/** Stop the membership poller. Idempotent. */
export function stopMembershipPoller(): void {
  membershipPoller.stop();
}

export function useMembershipStatus(pubkey: string): MembershipStatus {
  const status = usePyramidStore(
    (s) => s.statusByPubkey[pubkey.toLowerCase()] ?? 'unknown',
  );
  const lastFetchedAt = usePyramidStore((s) => s.lastFetchedAt);

  useEffect(() => {
    if (!pubkey) return;
    if (status !== 'unknown') return;
    if (Date.now() - lastFetchedAt < STALE_MS) return;
    void refreshMembership();
  }, [pubkey, status, lastFetchedAt]);

  return status;
}

// ---------------------------------------------------------------------------
// usePublishGuard
// ---------------------------------------------------------------------------

const RESTRICTED_RE = /restricted|auth[- ]?required/i;

interface PublishGuardStore {
  blocked: boolean;
  setBlocked: (v: boolean) => void;
}

const useGuardStore = create<PublishGuardStore>((set) => ({
  blocked: false,
  setBlocked: (blocked) => set({ blocked }),
}));

export function usePublishGuard(): {
  guard: <T>(publish: () => Promise<T>) => Promise<T | null>;
  blocked: boolean;
} {
  const blocked = useGuardStore((s) => s.blocked);
  const setBlocked = useGuardStore((s) => s.setBlocked);

  async function guard<T>(publish: () => Promise<T>): Promise<T | null> {
    try {
      const out = await publish();
      if (blocked) setBlocked(false);
      return out;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err ?? '');
      if (RESTRICTED_RE.test(msg)) {
        setBlocked(true);
        return null;
      }
      throw err;
    }
  }

  return { guard, blocked };
}

/** Test-only: clear the in-memory pyramid + guard state. */
export function _resetPyramidForTests(): void {
  usePyramidStore.setState({
    statusByPubkey: {},
    members: [],
    banned: [],
    lastFetchedAt: 0,
  });
  useGuardStore.setState({ blocked: false });
  membershipPoller.stop();
  inflightRefresh = null;
}
