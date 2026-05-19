/**
 * SPEC-015 — Claims (kind-1 reply with semantic tag).
 *
 * A claim is a public, signed kind-1 note with a `t:claim` tag plus an `e`
 * tag pointing at the target event id and/or an `a` tag pointing at the
 * addressable form (`<kind>:<pubkey>:<d>`). Both `e` and `a` are emitted
 * when the caller hands us a live `NDKEvent` so consumers can fetch the
 * target either by id or by the latest replaceable version.
 */
import { NDKEvent } from '@nostr-dev-kit/ndk';
import type { NostrEvent } from '@nostr-dev-kit/ndk';
import { useAuthStore } from '../auth';
import { getNdk } from '../ndk';
import type { AddressableRef } from './types';

export const CLAIM_KIND = 1 as const;
export const CLAIM_TAG = 'claim' as const;

export interface Claim {
  id: string;
  authorPubkey: string;
  targetEventId?: string;
  targetRef?: AddressableRef;
  message: string;
  createdAt: number;
  /** Optimistic UI overlay; not on the wire. */
  status?: 'pending' | 'fulfilled';
}

export class ClaimError extends Error {
  kind: 'no-signer';
  constructor(kind: 'no-signer', message?: string) {
    super(message ?? kind);
    this.kind = kind;
    this.name = 'ClaimError';
  }
}

const refToA = (ref: AddressableRef): string => `${ref.kind}:${ref.pubkey}:${ref.d}`;

function buildTags(target: NDKEvent | AddressableRef): string[][] {
  const tags: string[][] = [];
  if (target instanceof NDKEvent) {
    if (target.id) tags.push(['e', target.id]);
    const dTag = target.tags.find((t) => t[0] === 'd');
    if (target.kind !== undefined && target.pubkey && dTag?.[1] !== undefined) {
      tags.push(['a', `${target.kind}:${target.pubkey}:${dTag[1]}`]);
    }
  } else {
    tags.push(['a', refToA(target)]);
  }
  tags.push(['t', CLAIM_TAG]);
  return tags;
}

/**
 * Publish a claim (kind-1) targeting a listing or labor event. Returns the
 * signed `NDKEvent`. Throws `ClaimError('no-signer')` when no signer.
 */
export async function claim(
  target: NDKEvent | AddressableRef,
  message?: string,
): Promise<NDKEvent> {
  const signer = useAuthStore.getState().signer;
  if (!signer) {
    throw new ClaimError('no-signer', 'claim requires an authenticated signer');
  }
  const ndk = getNdk();
  // Mocks may be plain objects; assigning a signer is harmless on real NDK too.
  (ndk as unknown as { signer?: unknown }).signer = signer;

  const ev = new NDKEvent(ndk, {
    kind: CLAIM_KIND,
    content: message ?? '',
    tags: buildTags(target),
    created_at: Math.floor(Date.now() / 1000),
  } as Partial<NostrEvent>);

  // Test-relay path: a `publish(rawEvent)` hook short-circuits the real
  // NDKRelay pipeline, so we sign manually and hand it the raw envelope.
  const maybe = ndk as unknown as {
    publish?: (e: NostrEvent) => Promise<unknown> | unknown;
  };
  if (typeof maybe.publish === 'function') {
    ev.pubkey = (await signer.user()).pubkey;
    ev.id = '';
    ev.sig = await signer.sign(ev.rawEvent());
    ev.id = ev.getEventHash();
    await maybe.publish(ev.rawEvent());
    return ev;
  }
  await ev.sign();
  await ev.publish();
  return ev;
}

/** Minimal Observable surface (no rxjs). */
export interface ClaimSubscription {
  subscribe(handler: (claims: Claim[]) => void): () => void;
}

interface NdkSubscriber {
  subscribe: (
    filter: Record<string, unknown>,
    handlers?: { onEvent?: (e: NostrEvent | NDKEvent) => void },
  ) => {
    stop?: () => void;
    close?: () => void;
    on?: (evt: 'event', cb: (e: NostrEvent | NDKEvent) => void) => void;
  };
}

function parseClaim(raw: NostrEvent): Claim | null {
  if (raw.kind !== CLAIM_KIND) return null;
  if (!raw.tags.some((t) => t[0] === 't' && t[1] === CLAIM_TAG)) return null;
  const eTag = raw.tags.find((t) => t[0] === 'e');
  const aTag = raw.tags.find((t) => t[0] === 'a');
  let targetRef: AddressableRef | undefined;
  if (aTag?.[1]) {
    const [kindStr, pubkey, ...rest] = aTag[1].split(':');
    const kind = Number(kindStr);
    if (rest.length && Number.isFinite(kind) && pubkey) {
      targetRef = { kind, pubkey, d: rest.join(':') };
    }
  }
  const out: Claim = {
    id: raw.id ?? '',
    authorPubkey: raw.pubkey,
    message: raw.content ?? '',
    createdAt: raw.created_at,
  };
  if (eTag?.[1]) out.targetEventId = eTag[1];
  if (targetRef) out.targetRef = targetRef;
  return out;
}

function makeSubscription(
  filter: Record<string, unknown>,
  predicate: (c: Claim) => boolean = () => true,
): ClaimSubscription {
  return {
    subscribe(handler) {
      const ndk = getNdk() as unknown as NdkSubscriber;
      const seen = new Map<string, Claim>();
      const emit = (): void => {
        handler(
          Array.from(seen.values()).sort((a, b) => a.createdAt - b.createdAt),
        );
      };
      const onEvent = (e: NostrEvent | NDKEvent): void => {
        const raw = (e as NDKEvent).rawEvent
          ? ((e as NDKEvent).rawEvent() as unknown as NostrEvent)
          : (e as NostrEvent);
        const c = parseClaim(raw);
        if (!c || !c.id || !predicate(c) || seen.has(c.id)) return;
        seen.set(c.id, c);
        emit();
      };
      const sub = ndk.subscribe(filter, { onEvent });
      if (typeof sub?.on === 'function') sub.on('event', onEvent);
      return () => {
        if (sub && typeof sub.stop === 'function') sub.stop();
        else if (sub && typeof sub.close === 'function') sub.close();
      };
    },
  };
}

/** Subscribe to all claims targeting a specific addressable event. */
export function subscribeClaimsFor(target: AddressableRef): ClaimSubscription {
  return makeSubscription({
    kinds: [CLAIM_KIND],
    '#a': [refToA(target)],
    '#t': [CLAIM_TAG],
  });
}

/**
 * Subscribe to claims targeting addressable events authored by `myPubkey`.
 *
 * Trade-off: relays don't support prefix-matching on `#a` filters, so we
 * subscribe to all `t:claim` kind-1 events and filter client-side by parsing
 * each claim's `a` tag for `<kind>:<myPubkey>:<d>`. On a chapter-scoped relay
 * volume is small. If it grows, callers can enumerate their own listings and
 * open one `subscribeClaimsFor` per addressable ref instead.
 */
export function subscribeMyInbox(myPubkey: string): ClaimSubscription {
  return makeSubscription(
    { kinds: [CLAIM_KIND], '#t': [CLAIM_TAG] },
    (c) => c.targetRef?.pubkey === myPubkey,
  );
}
