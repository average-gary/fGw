/**
 * SPEC-017 — Reputation reviews (NIP-32 labels, kind 1985).
 *
 * NOTE on replaceability: kind 1985 is NOT parameterized-replaceable under
 * strict NIP-33 — relays retain every copy. We still emit a `d` tag of
 * `review:<target>:<refKind>:<refPubkey>:<refD>` so that read-side dedup
 * in `aggregateReviews` keeps only the newest review per (reviewer,
 * target, reference). Client-side aggregation rule, not relay-enforced.
 */
import { useEffect, useState } from 'react';
import { NDKEvent, type NostrEvent } from '@nostr-dev-kit/ndk';
import { useAuthStore } from './auth';
import type { AddressableRef } from './listings/types';
import { getNdk } from './ndk';

export const REVIEW_EVENT_KIND = 1985;
export const REVIEW_NAMESPACE = 'compost-marketplace.review';

export type ReviewScore = '+1' | '-1' | 'no-show';

export interface Review {
  id: string;
  reviewerPubkey: string;
  targetPubkey: string;
  reference: AddressableRef;
  score: ReviewScore;
  text?: string;
  createdAt: number;
}

export interface ReputationAggregate {
  score: number;
  positive: number;
  negative: number;
  noShows: number;
}

export interface UseReputationResult extends ReputationAggregate {
  reviews: Review[];
}

export class ReputationError extends Error {
  constructor(public kind: 'no-signer', message: string) {
    super(message);
    this.name = 'ReputationError';
  }
}

const isReviewScore = (v: unknown): v is ReviewScore =>
  v === '+1' || v === '-1' || v === 'no-show';

const reviewDSlug = (target: string, ref: AddressableRef): string =>
  `review:${target}:${ref.kind}:${ref.pubkey}:${ref.d}`;

const findTag = (tags: string[][], name: string): string | undefined => {
  for (const t of tags) if (t[0] === name) return t[1];
  return undefined;
};

/** Parse a kind-1985 raw event into a `Review`, or `null` if it is not a
 * compost-marketplace review label. */
export function parseReview(event: NostrEvent): Review | null {
  if (event.kind !== REVIEW_EVENT_KIND) return null;
  if (findTag(event.tags, 'L') !== REVIEW_NAMESPACE) return null;
  const score = event.tags.find((t) => t[0] === 'l' && t[2] === REVIEW_NAMESPACE)?.[1];
  if (!isReviewScore(score)) return null;
  const target = findTag(event.tags, 'p');
  if (!target) return null;
  const aTag = findTag(event.tags, 'a');
  if (!aTag) return null;
  const parts = aTag.split(':');
  if (parts.length < 3) return null;
  const kindNum = Number(parts[0]);
  const pubkey = parts[1];
  if (!Number.isFinite(kindNum) || !pubkey) return null;
  const reference: AddressableRef = { kind: kindNum, pubkey, d: parts.slice(2).join(':') };
  const out: Review = {
    id: event.id ?? '',
    reviewerPubkey: event.pubkey,
    targetPubkey: target,
    reference,
    score,
    createdAt: event.created_at,
  };
  if (event.content) out.text = event.content;
  return out;
}

export interface PostReviewArgs {
  target: string;
  listingOrEvent: AddressableRef;
  score: ReviewScore;
  text?: string;
}

/** Build & publish a kind-1985 review label. Throws `ReputationError`
 * with `kind === 'no-signer'` if the auth store has no signer. */
export async function postReview(args: PostReviewArgs): Promise<void> {
  const signer = useAuthStore.getState().signer;
  if (!signer) {
    throw new ReputationError('no-signer', 'postReview requires a signer');
  }
  const ref = args.listingOrEvent;
  const tags: string[][] = [
    ['L', REVIEW_NAMESPACE],
    ['l', args.score, REVIEW_NAMESPACE],
    ['p', args.target],
    ['a', `${ref.kind}:${ref.pubkey}:${ref.d}`],
    ['d', reviewDSlug(args.target, ref)],
    ['client', 'compost-marketplace'],
    ['version', '1'],
  ];
  const raw = {
    kind: REVIEW_EVENT_KIND,
    content: args.text ?? '',
    tags,
    created_at: Math.floor(Date.now() / 1000),
  };

  // Test-relay path: the in-memory mock exposes `publish()` directly so
  // tests can inspect raw tags without re-signing. Production: route
  // through NDKEvent for normal sign/publish.
  const ndk = getNdk() as unknown as {
    publish?: (event: unknown) => Promise<unknown> | unknown;
  };
  if (typeof ndk.publish === 'function') {
    const user = await signer.user();
    await ndk.publish({ ...raw, pubkey: user.pubkey });
    return;
  }
  const ev = new NDKEvent(getNdk(), raw);
  await ev.sign(signer);
  await ev.publish();
}

/** Pure aggregator. Drops self-reviews and dedupes by (reviewer,
 * reference) keeping the newest. Score = positive - negative - 2*noShows. */
export function aggregateReviews(
  reviews: Review[],
  targetPubkey: string,
): ReputationAggregate {
  const deduped = new Map<string, Review>();
  for (const r of reviews) {
    if (r.targetPubkey !== targetPubkey) continue;
    if (r.reviewerPubkey === targetPubkey) continue;
    const key = `${r.reviewerPubkey}|${r.reference.kind}|${r.reference.pubkey}|${r.reference.d}`;
    const prev = deduped.get(key);
    if (!prev || r.createdAt > prev.createdAt) deduped.set(key, r);
  }
  let positive = 0,
    negative = 0,
    noShows = 0;
  for (const r of deduped.values()) {
    if (r.score === '+1') positive += 1;
    else if (r.score === '-1') negative += 1;
    else noShows += 1;
  }
  return { positive, negative, noShows, score: positive - negative - 2 * noShows };
}

type SubscribeShape = {
  subscribe: (
    filter: { kinds: number[]; '#p': string[]; '#L': string[] },
    handlers?: { onEvent?: (e: NostrEvent | NDKEvent) => void },
  ) => {
    stop?: () => void;
    close?: () => void;
    on?: (evt: 'event', cb: (e: NostrEvent | NDKEvent) => void) => void;
  };
};

/** React hook: subscribe to reviews for `pubkey` and return the live
 * aggregate. Self-reviews are filtered at ingest and at aggregate time. */
export function useReputation(pubkey: string): UseReputationResult {
  const [reviews, setReviews] = useState<Review[]>([]);

  useEffect(() => {
    if (!pubkey) return;
    setReviews([]);
    const ndk = getNdk() as unknown as SubscribeShape;
    const filter = {
      kinds: [REVIEW_EVENT_KIND],
      '#p': [pubkey],
      '#L': [REVIEW_NAMESPACE],
    };

    const onEvent = (e: NostrEvent | NDKEvent): void => {
      const raw = (e as NDKEvent).rawEvent
        ? ((e as NDKEvent).rawEvent() as unknown as NostrEvent)
        : (e as NostrEvent);
      const parsed = parseReview(raw);
      if (!parsed) return;
      if (parsed.reviewerPubkey === parsed.targetPubkey) return;
      setReviews((prev) =>
        prev.some((r) => r.id && r.id === parsed.id)
          ? prev
          : [...prev, parsed],
      );
    };

    const sub = ndk.subscribe(filter, { onEvent });
    if (typeof sub?.on === 'function') sub.on('event', onEvent);

    return () => {
      if (sub && typeof sub.stop === 'function') sub.stop();
      else if (sub && typeof sub.close === 'function') sub.close();
    };
  }, [pubkey]);

  return { ...aggregateReviews(reviews, pubkey), reviews };
}
