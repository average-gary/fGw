/**
 * SPEC-028 — Inbox.
 *
 * Combines two live streams into a single time-sorted feed:
 *   • Claims targeting the current user's listings  (kind-1, t:claim)
 *   • Decrypted DMs addressed to the current user   (kind-1059 → 14)
 *
 * Composition: we keep two independent state arrays (`claims`, `dms`)
 * and merge-sort on render. That keeps the wiring trivial — each stream
 * has its own subscriber lifecycle — and avoids `Promise.race`-style
 * coordination across two fundamentally different iterators.
 *
 * On mount, after the first batch of events from BOTH streams settles
 * we mark both scopes read so the badge zeroes out, per acceptance.
 */
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Card, CardSubtitle, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { PubkeyChip } from '@/components/feed/PubkeyChip';
import { ReputationBadge } from '@/components/feed/ReputationBadge';
import { useAuthStore } from '@/lib/auth';
import { markRead } from '@/lib/inbox';
import { subscribeMyInbox, type Claim } from '@/lib/listings/claim';
import { subscribeDms, type DecryptedDm } from '@/lib/dm';

export interface InboxProps {
  onBack?: () => void;
}

type Row =
  | { kind: 'claim'; id: string; createdAt: number; claim: Claim }
  | { kind: 'dm'; id: string; createdAt: number; dm: DecryptedDm };

function refSlug(c: Claim): string {
  if (c.targetRef) return `${c.targetRef.kind}:${c.targetRef.d}`;
  if (c.targetEventId) return c.targetEventId.slice(0, 8) + '…';
  return 'a listing';
}

function previewLine(s: string): string {
  const oneLine = s.replace(/\s+/g, ' ').trim();
  return oneLine.length > 120 ? oneLine.slice(0, 117) + '…' : oneLine;
}

function timeAgo(epoch: number): string {
  const dt = Math.max(0, Math.floor(Date.now() / 1000) - epoch);
  if (dt < 60) return `${dt}s`;
  if (dt < 3600) return `${Math.floor(dt / 60)}m`;
  if (dt < 86400) return `${Math.floor(dt / 3600)}h`;
  return `${Math.floor(dt / 86400)}d`;
}

function ClaimRow({ claim }: { claim: Claim }) {
  return (
    <div className="flex flex-col gap-1.5 p-4 border-b border-soil-100 last:border-b-0">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <PubkeyChip pubkey={claim.authorPubkey} />
          <ReputationBadge pubkey={claim.authorPubkey} />
        </div>
        <span className="font-mono text-[11px] text-soil-500 shrink-0">
          {timeAgo(claim.createdAt)}
        </span>
      </div>
      <p className="text-sm text-soil-700">
        <Badge size="sm" variant="success" className="mr-2">claim</Badge>
        on <span className="font-mono">{refSlug(claim)}</span>
      </p>
      {claim.message && (
        <p className="text-sm text-soil-600 line-clamp-2">{previewLine(claim.message)}</p>
      )}
    </div>
  );
}

function DmRow({ dm }: { dm: DecryptedDm }) {
  return (
    <div className="flex flex-col gap-1.5 p-4 border-b border-soil-100 last:border-b-0">
      <div className="flex items-center justify-between gap-2">
        <PubkeyChip pubkey={dm.from} />
        <span className="font-mono text-[11px] text-soil-500 shrink-0">
          {timeAgo(dm.createdAt)}
        </span>
      </div>
      <p className="text-sm text-soil-700">
        <Badge size="sm" variant="default" className="mr-2">dm</Badge>
        {previewLine(dm.content)}
      </p>
    </div>
  );
}

export function Inbox({ onBack }: InboxProps): ReactNode {
  const signer = useAuthStore((s) => s.signer);
  const [myPubkey, setMyPubkey] = useState<string | null>(null);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [dms, setDms] = useState<DecryptedDm[]>([]);
  const [seenAny, setSeenAny] = useState(false);

  // Resolve our hex pubkey from the signer.
  useEffect(() => {
    let cancelled = false;
    if (!signer) { setMyPubkey(null); return; }
    void signer.user().then((u) => { if (!cancelled) setMyPubkey(u.pubkey); });
    return () => { cancelled = true; };
  }, [signer]);

  // Claims stream (snapshot array per emission).
  useEffect(() => {
    if (!myPubkey) return;
    const unsub = subscribeMyInbox(myPubkey).subscribe((next) => {
      setClaims(next);
      setSeenAny(true);
    });
    return () => unsub();
  }, [myPubkey]);

  // DMs stream (one DecryptedDm per emission).
  useEffect(() => {
    if (!signer) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;
    try {
      const sub = subscribeDms();
      unsub = sub.subscribe((dm) => {
        if (cancelled) return;
        setDms((prev) => (prev.some((d) => d.id === dm.id) ? prev : [...prev, dm]));
        setSeenAny(true);
      });
    } catch {
      // No private-key signer (NIP-07/46). DMs unsupported here; show claims only.
    }
    return () => { cancelled = true; if (unsub) unsub(); };
  }, [signer]);

  // Mark both scopes read after we've successfully mounted the streams.
  // We don't gate on actual events — visiting Inbox is the read signal.
  useEffect(() => {
    void markRead('claims');
    void markRead('dms');
  }, []);

  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    for (const c of claims) {
      out.push({ kind: 'claim', id: 'c:' + c.id, createdAt: c.createdAt, claim: c });
    }
    for (const d of dms) {
      out.push({ kind: 'dm', id: 'd:' + d.id, createdAt: d.createdAt, dm: d });
    }
    out.sort((a, b) => b.createdAt - a.createdAt);
    return out;
  }, [claims, dms]);

  const empty = rows.length === 0;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-screen-sm flex-col px-5 py-6 gap-4">
      <header className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack} aria-label="Back">
          {'←'} Back
        </Button>
        <h1 className="font-serif text-xl text-soil-900">Inbox</h1>
        <span className="w-10" aria-hidden />
      </header>

      {!signer && (
        <Card>
          <CardTitle>Sign in to see your inbox</CardTitle>
          <CardSubtitle>Claims and DMs are private to your key.</CardSubtitle>
        </Card>
      )}

      {signer && empty && (
        <Card>
          <CardTitle>Quiet in here</CardTitle>
          <CardSubtitle>
            {seenAny
              ? 'No claims or DMs yet. New ones will land here.'
              : 'Listening on the chapter relay…'}
          </CardSubtitle>
        </Card>
      )}

      {signer && !empty && (
        <Card bodyless>
          <ul aria-label="Inbox">
            {rows.map((r) => (
              <li key={r.id}>
                {r.kind === 'claim' ? <ClaimRow claim={r.claim} /> : <DmRow dm={r.dm} />}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </main>
  );
}

export default Inbox;
