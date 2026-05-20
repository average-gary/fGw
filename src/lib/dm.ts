/**
 * SPEC-014 — NIP-17 gift-wrapped DMs.
 * SPEC-030 — Signer-agnostic DM pipeline (NIP-07 / NIP-46 support).
 *
 * Implementation notes / library choices:
 * - We hand-roll the NIP-17 + NIP-59 pipeline so it works against any
 *   `NDKSigner`, including remote signers (NIP-07 browser extension and
 *   NIP-46 bunker) which do NOT expose a raw 32-byte private key.
 * - Outgoing pipeline:
 *     1. Build a kind-14 *unsigned rumor* (sender's pubkey, recipient
 *        in `p` tag).
 *     2. Seal it: encrypt the rumor JSON to recipient via
 *        `signer.encrypt(NDKUser{pubkey: recipient}, plaintext, 'nip44')`,
 *        then build a kind-13 NDKEvent and `event.sign(signer)` so the
 *        seal carries the sender's real signature.
 *     3. Wrap it: generate a *fresh ephemeral keypair* locally (via
 *        `nostr-tools/pure.generateSecretKey`), NIP-44 v2 encrypt the
 *        seal JSON to the recipient using a conversation key derived
 *        from `(ephSk, recipientPub)`, and `finalizeEvent` as kind 1059
 *        with the ephemeral key. The wrap never leaves the user's
 *        identity exposed at the relay layer.
 * - Incoming pipeline (mirror):
 *     1. Wrap (kind-1059) is decrypted via
 *        `signer.decrypt(NDKUser{pubkey: wrap.pubkey}, wrap.content, 'nip44')`
 *        — the user's signer key is one half of the conversation key
 *        because the wrap was encrypted to *us*.
 *     2. The resulting JSON is the kind-13 seal. Decrypt its content via
 *        `signer.decrypt(NDKUser{pubkey: seal.pubkey}, seal.content, 'nip44')`
 *        to yield the kind-14 rumor.
 * - Per NIP-17 we publish two wraps per outgoing DM: one addressed to
 *   the recipient and a second addressed to self so the sender can read
 *   their own thread on another device. With a bunker that's two
 *   `signer.encrypt` round-trips + two `event.sign` round-trips per send,
 *   which the user sees as a small handful of approval prompts (or zero,
 *   if the bunker has granted the permission).
 *
 * NDK API surface used (verified against
 * `node_modules/@nostr-dev-kit/ndk/dist/index.d.ts`):
 *   - NDKSigner.encrypt(recipient: NDKUser, value: string,
 *       scheme?: NDKEncryptionScheme): Promise<string>          (line 938)
 *   - NDKSigner.decrypt(sender: NDKUser, value: string,
 *       scheme?: NDKEncryptionScheme): Promise<string>          (line 946)
 *   - NDKEvent.sign(signer?: NDKSigner): Promise<string>        (line 3762)
 *   - new NDKUser({ pubkey: hex })                              (line 770/787)
 *
 * For the wrap step we use `nostr-tools/nip44.v2.utils.getConversationKey`
 * + `nostr-tools/nip44.v2.encrypt` + `nostr-tools/pure.finalizeEvent` so
 * the kind-1059 ephemeral signing path is fully local (no signer
 * round-trip — that's important: we never want to leak our real identity
 * as the `pubkey` of a kind-1059 wrap event).
 */
import { NDKEvent, NDKPrivateKeySigner, NDKUser, type NDKSigner } from '@nostr-dev-kit/ndk';
import type { NostrEvent } from '@nostr-dev-kit/ndk';
import {
  generateSecretKey,
  finalizeEvent,
  getEventHash,
} from 'nostr-tools/pure';
import * as nip44 from 'nostr-tools/nip44';
import { useAuthStore } from './auth';
import { getNdk } from './ndk';

export const DM_RUMOR_KIND = 14;
export const DM_SEAL_KIND = 13;
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
  kind: 'no-signer' | 'decrypt-failed';
  constructor(kind: DmError['kind'], message: string) {
    super(message);
    this.kind = kind;
    this.name = 'DmError';
  }
}

/**
 * Resolve the active signer + the user's pubkey (hex). Throws DmError if
 * no signer is configured. Works for any NDKSigner implementation
 * (NDKPrivateKeySigner, NDKNip07Signer, NDKNip46Signer) because the
 * downstream pipeline only relies on `signer.encrypt/decrypt/sign`.
 */
async function requireSigner(): Promise<{ signer: NDKSigner; pubkey: string }> {
  const signer = useAuthStore.getState().signer;
  if (!signer) {
    throw new DmError('no-signer', 'sendDm requires an authenticated signer');
  }
  // `userSync` may throw "Not ready" on remote signers; fall back to the
  // async getter in that case.
  let pubkey: string | undefined;
  try {
    pubkey = signer.userSync?.pubkey;
  } catch {
    pubkey = undefined;
  }
  if (!pubkey) {
    const user = await signer.user();
    pubkey = user.pubkey;
  }
  return { signer, pubkey };
}

/** Build an NDKUser referencing a bare pubkey (no NDK relay context needed). */
function userOf(pubkeyHex: string): NDKUser {
  return new NDKUser({ pubkey: pubkeyHex });
}

/** Build the NIP-10-ish thread tags for a kind-14 rumor. */
function threadTagsFor(threadRoot?: string): string[][] {
  if (!threadRoot) return [];
  return [['e', threadRoot, '', 'root']];
}

/**
 * Build + sign a kind-13 *seal* over the given kind-14 rumor. The seal
 * content is the rumor JSON encrypted (NIP-44 v2) to the recipient via
 * the signer's encrypt method; the seal itself is signed by the user's
 * real signer so a recipient who unwraps + unseals can verify the
 * sender's identity.
 */
async function signSeal(
  rumor: NostrEvent,
  signer: NDKSigner,
  recipientPubkey: string,
): Promise<NostrEvent> {
  const ciphertext = await signer.encrypt(
    userOf(recipientPubkey),
    JSON.stringify(rumor),
    'nip44',
  );
  const seal = new NDKEvent(undefined, {
    kind: DM_SEAL_KIND,
    content: ciphertext,
    tags: [],
    created_at: Math.floor(Date.now() / 1000),
  } as unknown as NostrEvent);
  await seal.sign(signer);
  return seal.rawEvent() as unknown as NostrEvent;
}

/**
 * Wrap a sealed event (kind-13) for a recipient as a kind-1059 event.
 * Uses a freshly generated ephemeral keypair so the wrap pubkey is not
 * linkable to the sender. No signer round-trip is needed.
 */
function wrapForRecipient(seal: NostrEvent, recipientHex: string): NostrEvent {
  const ephSk = generateSecretKey();
  const conversationKey = nip44.v2.utils.getConversationKey(ephSk, recipientHex);
  const ciphertext = nip44.v2.encrypt(JSON.stringify(seal), conversationKey);
  const template = {
    kind: DM_GIFT_WRAP_KIND,
    content: ciphertext,
    tags: [['p', recipientHex]],
    created_at: Math.floor(Date.now() / 1000),
  };
  const signed = finalizeEvent(template, ephSk);
  return signed as unknown as NostrEvent;
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
  const { signer, pubkey } = await requireSigner();
  const tags: string[][] = [['p', to], ...threadTagsFor(threadRoot)];
  const baseRumor = {
    kind: DM_RUMOR_KIND,
    content,
    tags,
    pubkey,
    created_at: Math.floor(Date.now() / 1000),
  };
  // NIP-59 rumors are unsigned but carry an `id` (the event hash) so the
  // recipient can dedupe / reference replies. We compute it the same way
  // `nostr-tools/nip59.createRumor` does.
  const rumor = {
    ...baseRumor,
    id: getEventHash(baseRumor),
  } as unknown as NostrEvent;

  // Seal once for the recipient and publish a wrap addressed to them.
  const sealForRecipient = await signSeal(rumor, signer, to);
  const wrapToRecipient = wrapForRecipient(sealForRecipient, to);
  await publishWrap(wrapToRecipient);

  // Seal again for self (separate ciphertext, separate seal signature)
  // so the sender can read their own outbox on another device.
  const sealForSelf = await signSeal(rumor, signer, pubkey);
  const wrapToSelf = wrapForRecipient(sealForSelf, pubkey);
  await publishWrap(wrapToSelf);
}

/** Minimal Observable surface (no rxjs dependency). */
export interface DmSubscription {
  subscribe(handler: (dm: DecryptedDm) => void): () => void;
}

/**
 * Unwrap an inbound kind-1059 event into a kind-14 rumor by:
 *   1) decrypting the wrap content with the user's signer (sender =
 *      the wrap's ephemeral pubkey),
 *   2) parsing the resulting JSON as a kind-13 seal,
 *   3) decrypting the seal content with the user's signer (sender =
 *      the seal's pubkey, i.e. the real sender),
 *   4) parsing the resulting JSON as a kind-14 rumor.
 *
 * Throws if any step fails (wrong recipient, malformed payload, etc.);
 * the caller in `subscribeDms` swallows these silently.
 */
async function unwrapInbound(
  wrap: NostrEvent,
  signer: NDKSigner,
): Promise<NostrEvent> {
  const sealJson = await signer.decrypt(userOf(wrap.pubkey), wrap.content, 'nip44');
  const seal = JSON.parse(sealJson) as NostrEvent;
  if (seal.kind !== DM_SEAL_KIND) {
    throw new DmError('decrypt-failed', `expected kind-13 seal, got ${seal.kind}`);
  }
  const rumorJson = await signer.decrypt(userOf(seal.pubkey), seal.content, 'nip44');
  const rumor = JSON.parse(rumorJson) as NostrEvent;
  // The rumor's claimed `pubkey` MUST match the seal's signer or the
  // sender is forging identity. NIP-59 doesn't formally require this
  // check but it's cheap and defends against a malicious sealer.
  if (rumor.pubkey !== seal.pubkey) {
    throw new DmError(
      'decrypt-failed',
      'rumor pubkey does not match seal signer',
    );
  }
  return rumor;
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
      // Resolve the signer eagerly so callers see the same `no-signer`
      // error they used to. Capture both the signer and pubkey here;
      // the async `requireSigner()` is awaited in a fire-and-forget
      // wrapper so the public API remains synchronous-returning.
      const signer = useAuthStore.getState().signer;
      if (!signer) {
        throw new DmError(
          'no-signer',
          'subscribeDms requires an authenticated signer',
        );
      }

      const ndk = getNdk() as unknown as {
        subscribe: (
          filter: { kinds: number[]; '#p': string[] },
          handlers?: { onEvent?: (e: NostrEvent | NDKEvent) => void },
        ) => {
          stop?: () => void;
          close?: () => void;
          on?: (evt: 'event', cb: (e: NostrEvent | NDKEvent) => void) => void;
        };
      };

      // We need the pubkey to build the relay filter. Try the sync
      // path; fall back to deferring sub creation until the async
      // `user()` resolves.
      let syncPubkey: string | undefined;
      try {
        syncPubkey = signer.userSync?.pubkey;
      } catch {
        syncPubkey = undefined;
      }

      let stop: (() => void) | undefined;
      let cancelled = false;

      const onEvent = (e: NostrEvent | NDKEvent): void => {
        const raw = (e as NDKEvent).rawEvent
          ? ((e as NDKEvent).rawEvent() as unknown as NostrEvent)
          : (e as NostrEvent);
        // Fire-and-forget; unwrap is async but the caller's handler is
        // sync-shaped. Errors (wrong recipient, malformed) are dropped.
        unwrapInbound(raw, signer)
          .then((rumor) => {
            if (cancelled) return;
            // Defensive: ignore anything that isn't a kind-14 chat rumor.
            if (rumor.kind !== DM_RUMOR_KIND) return;
            const pTag = rumor.tags.find((t) => t[0] === 'p');
            const eTag = rumor.tags.find((t) => t[0] === 'e');
            const dm: DecryptedDm = {
              id: rumor.id ?? '',
              from: rumor.pubkey,
              to: pTag?.[1] ?? '',
              content: rumor.content,
              createdAt: rumor.created_at,
            };
            if (eTag?.[1]) dm.threadRoot = eTag[1];
            handler(dm);
          })
          .catch(() => {
            // Not addressed to us, malformed, or replay; drop silently.
          });
      };

      const startWith = (pubkey: string): void => {
        const filter = { kinds: [DM_GIFT_WRAP_KIND], '#p': [pubkey] };
        // Production NDK: `subscribe(filter, opts, autoStart, handlers)`.
        // Test mock: `subscribe(filter, { onEvent })`. Try the simple
        // path first; if it isn't honored, the mock can also expose
        // `.on`.
        const sub = ndk.subscribe(filter, { onEvent });
        if (typeof sub?.on === 'function') {
          sub.on('event', onEvent);
        }
        stop = (): void => {
          if (sub && typeof sub.stop === 'function') sub.stop();
          else if (sub && typeof sub.close === 'function') sub.close();
        };
        if (cancelled) stop();
      };

      if (syncPubkey) {
        startWith(syncPubkey);
      } else {
        signer
          .user()
          .then((u) => {
            if (cancelled) return;
            startWith(u.pubkey);
          })
          .catch(() => {
            /* surfaced once via no-signer above; ignore late failures */
          });
      }

      return () => {
        cancelled = true;
        stop?.();
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
