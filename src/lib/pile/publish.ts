/**
 * SPEC-031 — Pile republish helper.
 *
 * One place that knows how to round-trip a `Pile` snapshot back to the
 * relay as a fresh kind-30078 event. PileDetail (and any future caller)
 * should funnel mutations through `republishPile(pile)` so a single device
 * edit is visible across devices and to the chapter.
 *
 * Architectural notes:
 *   - The original `signAndPublish` lived on `components/pile/wizardUtils.ts`
 *     because only NewPile needed it. Now that PileDetail also publishes,
 *     the shared helper moves here. `wizardUtils.ts` keeps a re-export for
 *     backward compatibility so NewPile.tsx (and its tests) continue to
 *     compile without churn.
 *   - State-transition validity (`nextState`) is the caller's responsibility
 *     when it routes through this module — `republishPile` itself only
 *     publishes whatever snapshot it's handed. We surface a typed
 *     `PilePublishError` so the UI can show a sensible toast on the four
 *     things that actually fail: no signer, illegal state transition,
 *     pyramid forbidden, network/relay error.
 */
import { NDKEvent, type NDKSigner } from '@nostr-dev-kit/ndk';
import type { NostrEvent } from '@nostr-dev-kit/ndk';

import { getNdk } from '@/lib/ndk';
import { useAuthStore } from '@/lib/auth';
import { encodePile } from './events';
import { nextState } from './state';
import type { Pile, PileState } from './types';

export type PilePublishErrorKind =
  | 'no-signer'
  | 'invalid-state'
  | 'forbidden'
  | 'network';

export class PilePublishError extends Error {
  kind: PilePublishErrorKind;
  constructor(kind: PilePublishErrorKind, message: string) {
    super(message);
    this.name = 'PilePublishError';
    this.kind = kind;
  }
}

interface NdkPublisher {
  publish?: (e: NostrEvent) => Promise<unknown> | unknown;
}

/**
 * Sign + publish an unsigned envelope through the chapter-bound NDK. The
 * relay shape may expose either `publish(rawEvent)` (test mock) or
 * `NDKEvent.publish()` (real NDK); we accept both.
 *
 * Lives here (not on wizardUtils) so anything that publishes through NDK
 * funnels through one helper. `wizardUtils.ts` re-exports for back-compat.
 */
export async function signAndPublish(
  signer: NDKSigner,
  envelope: { kind: number; content: string; tags: string[][]; created_at: number },
): Promise<void> {
  const ndk = getNdk();
  const ev = new NDKEvent(ndk, {
    kind: envelope.kind,
    content: envelope.content,
    tags: envelope.tags,
    created_at: envelope.created_at,
    pubkey: (await signer.user()).pubkey,
  } as unknown as NostrEvent);
  await ev.sign(signer);
  const maybe = ndk as unknown as NdkPublisher;
  if (typeof maybe.publish === 'function') {
    await maybe.publish(ev.rawEvent() as unknown as NostrEvent);
  } else {
    await ev.publish();
  }
}

const ADVANCE_ORDER: PileState[] = [
  'DRAFT',
  'COLLECTING',
  'BUILDING',
  'ACTIVE_TURNS',
  'CURING',
  'READY',
  'CONSUMED',
];

/**
 * State-transition guard. Any of:
 *   - identity (`from === to`) — covers layer/turn/photo mutations,
 *   - forward move along the linear lifecycle (any distance) — covers
 *     both the single-step Advance button and incidental jumps such as
 *     "check off layer 1" auto-advancing DRAFT/COLLECTING → BUILDING,
 *   - any non-terminal → ABANDONED via `nextState(_, 'abandon')`.
 *
 * Backward moves and any move out of a terminal state (CONSUMED,
 * ABANDONED) are rejected. We use `nextState` for the abandon check so
 * the rules stay co-located with the state machine itself.
 */
function isValidTransition(from: PileState, to: PileState): boolean {
  if (from === to) return true;
  if (nextState(from, 'abandon') === to) return true;
  const fromIdx = ADVANCE_ORDER.indexOf(from);
  const toIdx = ADVANCE_ORDER.indexOf(to);
  if (fromIdx < 0 || toIdx < 0) return false;
  return toIdx > fromIdx;
}

export interface RepublishOptions {
  /**
   * The pile state currently persisted on the relay (the one we're about
   * to overwrite). When supplied, `republishPile` validates the snapshot's
   * `state` is one legal step away (or unchanged); otherwise throws
   * `PilePublishError('invalid-state', ...)`.
   */
  previousState?: PileState;
  /** Optional chapter override; defaults to the encoder's default. */
  chapter?: { pubkey: string; d: string };
}

/**
 * Encode `pile`, sign it with the current auth signer, and publish it to
 * the chapter relay. Throws `PilePublishError` on any failure so the UI
 * can roll back local state and surface a typed toast.
 */
export async function republishPile(
  pile: Pile,
  opts: RepublishOptions = {},
): Promise<void> {
  const signer = useAuthStore.getState().signer;
  if (!signer) {
    throw new PilePublishError('no-signer', 'Sign in to save changes.');
  }

  if (opts.previousState && !isValidTransition(opts.previousState, pile.state)) {
    throw new PilePublishError(
      'invalid-state',
      `Illegal pile transition ${opts.previousState} → ${pile.state}.`,
    );
  }

  const envelope = opts.chapter ? encodePile(pile, opts.chapter) : encodePile(pile);
  try {
    await signAndPublish(signer, envelope);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err ?? '');
    if (/restricted|auth[- ]?required|forbidden/i.test(msg)) {
      throw new PilePublishError('forbidden', msg);
    }
    throw new PilePublishError('network', msg || 'Relay publish failed.');
  }
}
