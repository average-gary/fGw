/**
 * SPEC-014 — NIP-17 gift-wrapped DMs.
 *
 * Implementation notes / library choices:
 * - Heavy lifting is delegated to `nostr-tools/nip59` (`wrapEvent` /
 *   `unwrapEvent`). Those helpers cover the full NIP-17 + NIP-59 pipeline:
 *     • build a kind-14 unsigned rumor,
 *     • NIP-44 v2 encrypt the rumor to the recipient and seal it as a
 *       kind-13 event signed by the sender,
 *     • generate a *random ephemeral keypair*,
 *     • NIP-44 v2 encrypt the seal to the recipient and wrap it as a
 *       kind-1059 event signed by the ephemeral key.
 *   They take a raw 32-byte secret key, which we obtain from
 *   `NDKPrivateKeySigner.privateKey` (hex). NDK does ship a `giftWrap`
 *   helper, but it allocates its own ephemeral signer internally and is
 *   harder to mock at the relay layer; using the `nip59` helpers keeps
 *   `dm.ts` pure and fully testable.
 * - Per NIP-17 we publish two wraps: one addressed to the recipient and a
 *   second addressed to self so the sender can read their own thread on
 *   another device.
 * - Auth gate: `sendDm` and `subscribeDms` both require
 *   `useAuthStore.getState().signer` to be set. Today only the
 *   `nsec-local` path is supported because remote signers (NIP-07,
 *   NIP-46) cannot expose the raw private key needed by the
 *   `nostr-tools/nip59` helpers. A future revision can swap in an
 *   `NDKSigner.encrypt('nip44')` based code path; see TODO below.
 */
import { NDKEvent, NDKPrivateKeySigner, type NDKSigner } from '@nostr-dev-kit/ndk';
import type { NostrEvent } from '@nostr-dev-kit/ndk';
import { wrapEvent, unwrapEvent } from 'nostr-tools/nip59';
import { getPublicKey } from 'nostr-tools/pure';
import { useAuthStore } from './auth';
import { getNdk } from './ndk';

export const DM_RUMOR_KIND = 14;
export const DM_GIFT_WRAP_KIND = 1059;

export type DecryptedDm = {
  id: string;
  from: string;
  to: string;
  content: string;
  createdAt: number;
  threadRoot?: string;
};

export class DmError extends Error {
  kind: 'no-signer' | 'unsupported-signer' | 'decrypt-failed';
  constructor(kind: DmError['kind'], message: string) {
    super(message);
    this.kind = kind;
    this.name = 'DmError';
  }
}

/**
 * Pull the raw 32-byte secret from the active signer. Throws DmError if
 * the signer is not a private-key signer (NIP-07 / NIP-46 cannot expose
 * the raw key).
 *
 * TODO(SPEC-014.next): once we want to support DMs under remote signers,
 * replace `nostr-tools/nip59` with a hand-rolled pipeline that uses
 * `signer.encrypt(user, plaintext, 'nip44')` for the seal step and a
 * locally-generated ephemeral keypair for the wrap step.
 */
function requireSecretKey(): { sk: Uint8Array; pubkey: string; signer: NDKSigner } {
  const signer = useAuthStore.getState().signer;
  if (!signer) {
    throw new DmError('no-signer', 'sendDm requires an authenticated signer');
  }
  // NDKPrivateKeySigner exposes `privateKey` as a hex string.
  const maybe = signer as unknown as { privateKey?: string };
  const hex = typeof maybe.privateKey === 'string' ? maybe.privateKey : null;
  if (!hex) {
    throw new DmError(
      'unsupported-signer',
      'NIP-17 DMs currently require a local private-key signer',
    );
  }
  const sk = hexToBytes(hex);
  const pubkey = getPublicKey(sk);
  return { sk, pubkey, signer };
}

function hexToBytes(hex: string): Uint8Array {
  const len = hex.length / 2;
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

/** Build the NIP-10-ish thread tags for a kind-14 rumor. */
function threadTagsFor(threadRoot?: string): string[][] {
  if (!threadRoot) return [];
  return [['e', threadRoot, '', 'root']];
}

/**
 * Publish a single raw NIP-59 wrap event. Routed through `getNdk()` so
 * tests can swap the entire transport via `vi.mock('@/lib/ndk', ...)`.
 *
 * Production path: wraps the raw event in NDKEvent and calls
 * `event.publish()`. Because the wrap is already signed (with the
 * ephemeral key), NDKEvent will publish-as-is without re-signing.
 *
 * Test path: if `getNdk()` returns an object that already exposes a
 * `publish(event)` function (the in-memory mock relay), we use it
 * directly.
 */
async function publishWrap(wrap: NostrEvent): Promise<void> {
  const ndk = getNdk() as unknown as {
    publish?: (event: NostrEvent) => Promise<unknown> | unknown;
  };
  if (typeof ndk.publish === 'function') {
    await ndk.publish(wrap);
    return;
  }
  const ev = new NDKEvent(getNdk(), wrap);
  await ev.publish();
}

/**
 * Send a NIP-17 gift-wrapped DM. Publishes two kind-1059 wraps: one for
 * the recipient and one for self (so the sender can re-read the thread
 * from another device).
 */
export async function sendDm(
  to: string,
  content: string,
  threadRoot?: string,
): Promise<void> {
  const { sk, pubkey } = requireSecretKey();
  const tags: string[][] = [['p', to], ...threadTagsFor(threadRoot)];
  const rumor: Parameters<typeof wrapEvent>[0] = {
    kind: DM_RUMOR_KIND,
    content,
    tags,
    pubkey,
    created_at: Math.floor(Date.now() / 1000),
  };

  // Wrap once for the recipient.
  const wrapForRecipient = wrapEvent(rumor, sk, to);
  await publishWrap(wrapForRecipient as unknown as NostrEvent);

  // Wrap once for self so the sender can read their own outbox on
  // another device. Uses a fresh ephemeral keypair internally.
  const wrapForSelf = wrapEvent(rumor, sk, pubkey);
  await publishWrap(wrapForSelf as unknown as NostrEvent);
}

/** Minimal Observable surface (no rxjs dependency). */
export interface DmSubscription {
  subscribe(handler: (dm: DecryptedDm) => void): () => void;
}

/**
 * Subscribe to incoming DMs for the current user. Each kind-1059 wrap
 * tagged `#p` with the user's pubkey is unwrapped to a kind-14 rumor and
 * surfaced as a `DecryptedDm`.
 *
 * Other people's wraps (and our own outgoing wraps) cannot be decrypted
 * with our key and are silently dropped, matching the NIP-17 design
 * where each wrap is encrypted to one specific recipient.
 */
export function subscribeDms(): DmSubscription {
  return {
    subscribe(handler) {
      const { sk, pubkey } = requireSecretKey();
      const ndk = getNdk() as unknown as {
        subscribe: (
          filter: { kinds: number[]; '#p': string[] },
          handlers?: { onEvent?: (e: NostrEvent | NDKEvent) => void },
        ) => { stop?: () => void; close?: () => void; on?: (evt: 'event', cb: (e: NostrEvent | NDKEvent) => void) => void };
      };

      const filter = { kinds: [DM_GIFT_WRAP_KIND], '#p': [pubkey] };

      const onEvent = (e: NostrEvent | NDKEvent): void => {
        const raw = (e as NDKEvent).rawEvent
          ? ((e as NDKEvent).rawEvent() as unknown as NostrEvent)
          : (e as NostrEvent);
        try {
          const rumor = unwrapEvent(raw as Parameters<typeof unwrapEvent>[0], sk);
          // Defensive: ignore anything that isn't a kind-14 chat rumor.
          if (rumor.kind !== DM_RUMOR_KIND) return;
          const pTag = rumor.tags.find((t) => t[0] === 'p');
          const eTag = rumor.tags.find((t) => t[0] === 'e');
          const dm: DecryptedDm = {
            id: rumor.id,
            from: rumor.pubkey,
            to: pTag?.[1] ?? pubkey,
            content: rumor.content,
            createdAt: rumor.created_at,
          };
          if (eTag?.[1]) dm.threadRoot = eTag[1];
          handler(dm);
        } catch {
          // Not addressed to us, malformed, or replay; drop silently.
        }
      };

      // Production NDK: `subscribe(filter, opts, autoStart, handlers)`.
      // Test mock: `subscribe(filter, { onEvent })`. Try the simple path
      // first; if it isn't honored, the mock can also expose `.on`.
      const sub = ndk.subscribe(filter, { onEvent });
      if (typeof sub?.on === 'function') {
        sub.on('event', onEvent);
      }

      return () => {
        if (sub && typeof sub.stop === 'function') sub.stop();
        else if (sub && typeof sub.close === 'function') sub.close();
      };
    },
  };
}

/** Test-only helper: inject a private-key signer for the active store. */
export function _setLocalSignerForTests(sk: Uint8Array): void {
  const hex = Array.from(sk)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const signer = new NDKPrivateKeySigner(hex);
  useAuthStore.setState({ signer, status: 'ready' });
}
