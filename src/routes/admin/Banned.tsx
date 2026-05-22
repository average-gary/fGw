/**
 * SPEC-026 — Admin: banned roster + root-only restore.
 *
 * Calls `listBanned()` on mount; restore is gated to root only and re-uses
 * `inviteByNpub` (a successful invite re-allows a banned pubkey on Pyramid).
 *
 * Root detection: `useIsRoot()` scrapes the signed-in user's
 * `/u/{pubkey}` HTML page (NIP-86 list responses omit level).
 */
import { useEffect, useState } from 'react';
import * as nip19 from 'nostr-tools/nip19';
import { Card, CardSubtitle, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { PubkeyChip } from '@/components/feed/PubkeyChip';
import { listBanned, inviteByNpub, useIsRoot, type Member } from '@/lib/pyramid';

export interface BannedProps {
  onBack?: () => void;
}

export function Banned({ onBack }: BannedProps) {
  const [banned, setBanned] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringPk, setRestoringPk] = useState<string | null>(null);
  const toast = useToast();
  const isRoot = useIsRoot();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void listBanned()
      .then((b) => { if (!cancelled) setBanned(b); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  async function restore(m: Member): Promise<void> {
    let npub = m.npub;
    if (!npub) {
      try { npub = nip19.npubEncode(m.pubkey); } catch { /* fall-through */ }
    }
    if (!npub) {
      toast.danger('Could not restore', 'Invalid pubkey on this row.');
      return;
    }
    setRestoringPk(m.pubkey);
    try {
      const res = await inviteByNpub(npub);
      if (res.ok) {
        toast.success('Restored', 'Member is allowed again.');
        setBanned((prev) => prev.filter((x) => x.pubkey !== m.pubkey));
      } else {
        toast.danger('Could not restore', `Relay error: ${res.error}`);
      }
    } finally { setRestoringPk(null); }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-screen-sm flex-col px-5 py-6 gap-4">
      <header className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack} aria-label="Back">{'←'} Back</Button>
        <h1 className="font-serif text-xl text-soil-900">Banned</h1>
        <span className="w-10" aria-hidden />
      </header>

      {loading && (<Card><CardSubtitle>Loading banned roster…</CardSubtitle></Card>)}

      {!loading && banned.length === 0 && (
        <Card>
          <CardTitle>No banned members</CardTitle>
          <CardSubtitle>The chapter has no dropped accounts on record.</CardSubtitle>
        </Card>
      )}

      {!loading && banned.length > 0 && (
        <Card bodyless>
          <ul aria-label="Banned members">
            {banned.map((m) => (
              <li key={m.pubkey} className="flex items-center justify-between gap-3 p-3 border-b border-soil-100 last:border-b-0">
                <div className="min-w-0 flex-1"><PubkeyChip pubkey={m.pubkey} /></div>
                {isRoot && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void restore(m)}
                    loading={restoringPk === m.pubkey}
                    disabled={restoringPk !== null}
                    aria-label={`Restore ${m.pubkey.slice(0, 8)}`}
                  >
                    Restore
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </main>
  );
}

export default Banned;
