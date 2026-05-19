/**
 * SPEC-025 — Pyramid invite-only relay client + state hooks.
 *
 * Pyramid (`fiatjaf/pyramid`) is an invite-tree allowlist relay. It exposes
 * HTTP admin endpoints (`/allow`, `/ban`) gated by NIP-98 auth and HTML
 * read endpoints (`/allowed`, `/banned`, `/u/{pubkey}`) we screen-scrape.
 *
 * This module provides:
 *   - `useMembershipStatus(pubkey)` — React hook backed by a zustand cache,
 *     refreshed on chapter swap and on kind-22242 membership-change events.
 *   - `inviteByNpub(npub)` / `dropMember(pubkey)` — NIP-98 authed POSTs.
 *   - `parseMemberPage(html)` — extracts inviter/invitee chains from
 *     `/u/{pubkey}`.
 *   - `usePublishGuard()` — wraps any publish call; on `restricted` /
 *     `auth-required` rejection it flips a `blocked` flag so callers can
 *     render the SPEC-026 "request invite" sheet.
 *
 * Selector contract: Pyramid renders members as `<a href="/u/<hex>">…</a>`.
 * We extract the 64-hex-char `<pubkey>` from those hrefs. If the template
 * ever drops the `/u/` prefix or hex-encodes pubkeys differently, all
 * parsers gracefully return empty arrays rather than throw.
 */
import { useEffect } from 'react';
import { create } from 'zustand';
import NDK, { NDKEvent, type NDKSigner } from '@nostr-dev-kit/ndk';
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

function pubkeysToMembers(pubkeys: string[]): Member[] {
  return pubkeys.map((pubkey) => {
    try {
      return { pubkey, npub: nip19.npubEncode(pubkey) };
    } catch {
      return { pubkey };
    }
  });
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
// listMembers / listBanned
// ---------------------------------------------------------------------------

function currentBase(): string {
  return relayHttpsBase(useChapterStore.getState().currentRelay);
}

async function fetchAndExtract(url: string): Promise<Member[]> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return [];
    const html = await resp.text();
    return pubkeysToMembers(extractAllPubkeys(html));
  } catch {
    return [];
  }
}

export async function listMembers(): Promise<Member[]> {
  const base = currentBase();
  const members = await fetchAndExtract(`${base}/allowed`);
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
  const base = currentBase();
  const banned = await fetchAndExtract(`${base}/banned`);
  usePyramidStore.setState({ banned });
  const patch: Record<string, MembershipStatus> = {};
  for (const m of banned) patch[m.pubkey] = 'banned';
  usePyramidStore.setState((s) => ({
    statusByPubkey: { ...s.statusByPubkey, ...patch },
  }));
  return banned;
}

// ---------------------------------------------------------------------------
// NIP-98 auth header
// ---------------------------------------------------------------------------

function b64encode(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i] ?? 0);
  return btoa(bin);
}

async function nip98Header(
  signer: NDKSigner,
  url: string,
  method: 'GET' | 'POST',
): Promise<string> {
  const ev = new NDKEvent(new NDK());
  ev.kind = 27235;
  ev.created_at = Math.floor(Date.now() / 1000);
  ev.content = '';
  ev.tags = [
    ['u', url],
    ['method', method],
  ];
  await ev.sign(signer);
  return `Nostr ${b64encode(JSON.stringify(ev.rawEvent()))}`;
}

// ---------------------------------------------------------------------------
// inviteByNpub / dropMember
// ---------------------------------------------------------------------------

function classifyInviteBody(body: string): InviteError {
  const b = body.toLowerCase();
  if (b.includes('quota') || b.includes('too many')) return 'over-quota';
  if (b.includes('cycle') || b.includes('loop')) return 'cycle';
  if (b.includes('already')) return 'already-member';
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

  const url = `${currentBase()}/allow?type=invite&target=${hex}`;
  let auth: string;
  try {
    auth = await nip98Header(signer, url, 'POST');
  } catch {
    return { ok: false, error: 'not-authed' };
  }

  let resp: Response;
  try {
    resp = await fetch(url, { method: 'POST', headers: { Authorization: auth } });
  } catch {
    return { ok: false, error: 'network' };
  }

  if (resp.ok) {
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

  if (resp.status === 401) return { ok: false, error: 'not-authed' };
  if (resp.status === 403) return { ok: false, error: 'forbidden' };
  if (resp.status === 422) {
    let body = '';
    try {
      body = await resp.text();
    } catch {
      /* ignore */
    }
    return { ok: false, error: classifyInviteBody(body) };
  }
  if (resp.status >= 500) return { ok: false, error: 'network' };
  return { ok: false, error: 'forbidden' };
}

export async function dropMember(
  pubkey: string,
): Promise<Result<void, DropError>> {
  const signer = useAuthStore.getState().signer;
  if (!signer) return { ok: false, error: 'not-authed' };
  if (!HEX64.test(pubkey)) return { ok: false, error: 'not-found' };

  const url = `${currentBase()}/ban?type=drop&target=${pubkey.toLowerCase()}`;
  let auth: string;
  try {
    auth = await nip98Header(signer, url, 'POST');
  } catch {
    return { ok: false, error: 'not-authed' };
  }

  let resp: Response;
  try {
    resp = await fetch(url, { method: 'POST', headers: { Authorization: auth } });
  } catch {
    return { ok: false, error: 'network' };
  }

  if (resp.ok) {
    usePyramidStore.getState()._setStatus(pubkey.toLowerCase(), 'banned');
    usePyramidStore.setState((s) => ({
      members: s.members.filter((m) => m.pubkey !== pubkey.toLowerCase()),
    }));
    return { ok: true, value: undefined };
  }
  if (resp.status === 401) return { ok: false, error: 'not-authed' };
  if (resp.status === 404) return { ok: false, error: 'not-found' };
  if (resp.status >= 500) return { ok: false, error: 'network' };
  return { ok: false, error: 'forbidden' };
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
 * Subscribe to kind-22242 membership-change events on the current relay
 * and refresh the cache whenever one arrives. Pyramid does not currently
 * emit kind-22242 from `chat.virginiafreedom.tech`; the listener is wired
 * defensively so a future server-side push would Just Work.
 *
 * TODO: confirm Pyramid's emit semantics once the upstream PR lands.
 */
let membershipSubInstalled = false;
function ensureMembershipSubscription(): void {
  if (membershipSubInstalled) return;
  membershipSubInstalled = true;
  try {
    const ndk = getNdk() as unknown as {
      subscribe?: (
        filter: { kinds: number[] },
        handlers?: { onEvent?: () => void },
      ) => { on?: (evt: 'event', cb: () => void) => void } | undefined;
    };
    if (typeof ndk.subscribe !== 'function') return;
    const sub = ndk.subscribe(
      { kinds: [22242] },
      {
        onEvent: () => {
          usePyramidStore.setState({ lastFetchedAt: 0 });
          void refreshMembership();
        },
      },
    );
    if (sub && typeof sub.on === 'function') {
      sub.on('event', () => {
        usePyramidStore.setState({ lastFetchedAt: 0 });
        void refreshMembership();
      });
    }
  } catch {
    /* swallow — module-load must not throw */
  }
}

export function useMembershipStatus(pubkey: string): MembershipStatus {
  const status = usePyramidStore(
    (s) => s.statusByPubkey[pubkey.toLowerCase()] ?? 'unknown',
  );
  const lastFetchedAt = usePyramidStore((s) => s.lastFetchedAt);

  useEffect(() => {
    ensureMembershipSubscription();
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
  membershipSubInstalled = false;
  inflightRefresh = null;
}
