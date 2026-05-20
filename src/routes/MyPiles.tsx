/**
 * SPEC-021 — My piles list.
 *
 * Subscribes to kind-30078 events authored by the current user, parses each
 * into a `Pile`, sorts via `listMyPiles`, and renders one row per pile with
 * its name, lifecycle state, and days-until-next-turn. Tap → onSelect.
 *
 * The Archive button calls `archivePile()` and re-emits the resulting Pile
 * through `onArchive`. Persistence (re-publishing the kind-30078 with the
 * new ABANDONED state) is the parent's responsibility.
 */
import { useEffect, useState } from 'react';
import type { NDKEvent, NostrEvent } from '@nostr-dev-kit/ndk';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardSubtitle, CardTitle } from '@/components/ui/Card';
import { useAuthStore } from '@/lib/auth';
import { getNdk } from '@/lib/ndk';
import { parsePile, PILE_EVENT_KIND } from '@/lib/pile/events';
import { archivePile, listMyPiles } from '@/lib/pile/queries';
import type { Pile } from '@/lib/pile/types';
import { PILE_TURN_SCHEDULE_DAYS } from '@/domain/fgw';
import type { AddressableRef } from '@/lib/listings/types';
import { PILE_STATE_BADGES } from '@/components/pile/wizardUtils';

interface SubscribeShape {
  subscribe: (
    f: Record<string, unknown>,
    h?: { onEvent?: (e: NostrEvent | NDKEvent) => void },
  ) => { stop?: () => void; close?: () => void; on?: (e: 'event', cb: (x: NostrEvent | NDKEvent) => void) => void };
}

function rawFrom(e: NostrEvent | NDKEvent): NostrEvent {
  return (e as NDKEvent).rawEvent
    ? ((e as NDKEvent).rawEvent() as unknown as NostrEvent)
    : (e as NostrEvent);
}

function daysUntilNextTurn(p: Pile): number | null {
  const now = Math.floor(Date.now() / 1000);
  for (let i = 0; i < PILE_TURN_SCHEDULE_DAYS.length; i += 1) {
    const rec = p.turnRecords.find((r) => r.index === i + 1);
    if (rec?.completedAt) continue;
    const off = PILE_TURN_SCHEDULE_DAYS[i];
    if (off === undefined) continue;
    return Math.ceil((p.plannedBuildDate + off * 86400 - now) / 86400);
  }
  return null;
}

function nextLabel(p: Pile): string {
  if (p.state === 'ABANDONED') return '—';
  const d = daysUntilNextTurn(p);
  if (d === null) return 'no upcoming turns';
  return d <= 0 ? 'turn due' : `next turn in ${d}d`;
}

export interface MyPilesProps {
  onSelect?: (ref: AddressableRef) => void;
  onArchive?: (archived: Pile) => void;
  onBack?: () => void;
}

export function MyPiles({ onSelect, onArchive, onBack }: MyPilesProps = {}) {
  const signer = useAuthStore((s) => s.signer);
  const [myPubkey, setMyPubkey] = useState<string | null>(null);
  const [piles, setPiles] = useState<Pile[]>([]);
  const [archived, setArchived] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!signer) {
      setMyPubkey(null);
      return;
    }
    let cancelled = false;
    void signer.user().then((u) => {
      if (!cancelled) setMyPubkey(u.pubkey);
    });
    return () => {
      cancelled = true;
    };
  }, [signer]);

  useEffect(() => {
    if (!myPubkey) return undefined;
    const ndk = getNdk() as unknown as SubscribeShape;
    if (typeof ndk.subscribe !== 'function') return undefined;
    const seen = new Map<string, Pile>();
    const onEvent = (e: NostrEvent | NDKEvent): void => {
      const raw = rawFrom(e);
      const pile = parsePile({
        kind: raw.kind ?? -1,
        content: raw.content ?? '',
        tags: raw.tags ?? [],
        ...(raw.created_at !== undefined ? { created_at: raw.created_at } : {}),
        ...(raw.pubkey !== undefined ? { pubkey: raw.pubkey } : {}),
      });
      if (!pile) return;
      seen.set(pile.d, pile);
      setPiles(listMyPiles(myPubkey, Array.from(seen.values())));
    };
    const sub = ndk.subscribe({ kinds: [PILE_EVENT_KIND], authors: [myPubkey] }, { onEvent });
    if (sub && typeof sub.on === 'function') sub.on('event', onEvent);
    return () => {
      if (sub?.stop) sub.stop();
      else if (sub?.close) sub.close();
    };
  }, [myPubkey]);

  function handleArchive(p: Pile): void {
    setArchived((prev) => new Set(prev).add(p.d));
    onArchive?.(archivePile(p));
  }

  const renderable = piles.map((p) =>
    archived.has(p.d) ? { ...p, state: 'ABANDONED' as const } : p,
  );

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-screen-sm flex-col px-5 py-6 gap-4">
      <header className="flex items-center justify-between">
        {onBack ? (
          <Button variant="ghost" size="sm" onClick={onBack} aria-label="Back">
            ← Back
          </Button>
        ) : (
          <span className="w-10" aria-hidden />
        )}
        <h1 className="font-serif text-3xl text-soil-900 leading-tight">My piles</h1>
        <span className="w-10" aria-hidden />
      </header>

      {!myPubkey && (
        <Card>
          <CardTitle>Sign in to see your piles.</CardTitle>
          <CardSubtitle>Pile lists are scoped to the current pubkey.</CardSubtitle>
        </Card>
      )}

      {myPubkey && renderable.length === 0 && (
        <Card>
          <CardTitle>No piles yet.</CardTitle>
          <CardSubtitle>Tap “New pile” to start one.</CardSubtitle>
        </Card>
      )}

      <ul className="flex flex-col gap-3" aria-label="My piles">
        {renderable.map((p) => {
          const badge = PILE_STATE_BADGES[p.state];
          const isArchived = p.state === 'ABANDONED';
          return (
            <li key={p.d} data-testid="pile-row">
              <Card hoverable>
                <button
                  type="button"
                  className="flex w-full items-start justify-between gap-3 text-left"
                  onClick={() =>
                    onSelect?.({ kind: PILE_EVENT_KIND, pubkey: p.builder, d: p.d })
                  }
                >
                  <div className="flex flex-col gap-1 min-w-0 flex-1">
                    <span className="font-serif text-lg text-soil-900 truncate">{p.name}</span>
                    <span className="font-mono text-xs text-soil-500">{nextLabel(p)}</span>
                  </div>
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                </button>
                {!isArchived && (
                  <div className="mt-3 flex justify-end">
                    <Button variant="secondary" size="sm" onClick={() => handleArchive(p)}>
                      Archive
                    </Button>
                  </div>
                )}
              </Card>
            </li>
          );
        })}
      </ul>
    </main>
  );
}

export default MyPiles;
