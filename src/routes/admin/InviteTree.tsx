/**
 * SPEC-026 — Admin: invite tree.
 *
 * Renders a recursive expandable tree starting from the chapter root.
 *
 * Root discovery: `useChapterRootPubkey()` scrapes the relay's `/`
 * (invite-tree) page once and finds the first `/u/{hex}` link adjacent
 * to a `<span ...>root</span>` badge. Cached per chapter; the cache is
 * busted by the chapter-store subscriber on relay change.
 *
 * Per-node inviter/invitee chains are lazy-loaded on expand via
 * `parseMemberPage(html)` — `relayHttpsBase(currentRelay) + '/u/<pk>'`.
 * Results are cached in component state so collapse/re-expand is free.
 *
 * The current user's node is highlighted (ring-moss). The path from root
 * to the current user is highlighted (bg-moss-50/60) by walking the
 * cached invitee map back to root once we've discovered the user.
 */
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Card, CardSubtitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { PubkeyChip } from '@/components/feed/PubkeyChip';
import { useAuthStore } from '@/lib/auth';
import { useChapterStore } from '@/lib/chapter';
import {
  parseMemberPage,
  relayHttpsBase,
  useChapterRootPubkey,
  type MemberInfo,
} from '@/lib/pyramid';
import { cn } from '@/lib/cn';

export interface InviteTreeProps {
  onBack?: () => void;
}

export function InviteTree({ onBack }: InviteTreeProps) {
  const signer = useAuthStore((s) => s.signer);
  const currentRelay = useChapterStore((s) => s.currentRelay);
  const [myPubkey, setMyPubkey] = useState<string | null>(null);
  const root = useChapterRootPubkey();
  const [infoByPk, setInfoByPk] = useState<Record<string, MemberInfo>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [fetching, setFetching] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    if (!signer) {
      setMyPubkey(null);
      return;
    }
    void signer.user().then((u) => {
      if (!cancelled) setMyPubkey(u.pubkey);
    });
    return () => {
      cancelled = true;
    };
  }, [signer]);

  // Compute the path from root → current user using cached invitee chains.
  // Walks the `invitees` lists already fetched into `infoByPk`. If we
  // haven't traversed deep enough yet the path is empty.
  const pathToMe = useMemo<Set<string>>(() => {
    if (!myPubkey || !root) return new Set();
    const seen = new Set<string>();
    function dfs(pk: string, trail: string[]): string[] | null {
      if (seen.has(pk)) return null;
      seen.add(pk);
      if (pk === myPubkey) return trail.concat(pk);
      const info = infoByPk[pk];
      if (!info) return null;
      for (const child of info.invitees) {
        const found = dfs(child, trail.concat(pk));
        if (found) return found;
      }
      return null;
    }
    const path = dfs(root, []);
    return new Set(path ?? []);
  }, [infoByPk, myPubkey, root]);

  async function loadInfo(pubkey: string): Promise<void> {
    if (infoByPk[pubkey] || fetching[pubkey]) return;
    setFetching((f) => ({ ...f, [pubkey]: true }));
    const url = `${relayHttpsBase(currentRelay)}/u/${pubkey}`;
    try {
      const resp = await fetch(url);
      if (!resp.ok) {
        setInfoByPk((m) => ({
          ...m,
          [pubkey]: { pubkey, inviters: [], invitees: [] },
        }));
        return;
      }
      const html = await resp.text();
      const info = parseMemberPage(html);
      // parseMemberPage may yield a different `pubkey` (the page header's
      // first /u/ link). Re-key to the requested pubkey for our cache.
      setInfoByPk((m) => ({
        ...m,
        [pubkey]: {
          pubkey,
          inviters: info.inviters,
          invitees: info.invitees,
        },
      }));
    } catch {
      setInfoByPk((m) => ({
        ...m,
        [pubkey]: { pubkey, inviters: [], invitees: [] },
      }));
    } finally {
      setFetching((f) => {
        const next = { ...f };
        delete next[pubkey];
        return next;
      });
    }
  }

  function toggle(pubkey: string): void {
    const isOpen = expanded[pubkey];
    setExpanded((e) => ({ ...e, [pubkey]: !isOpen }));
    if (!isOpen) void loadInfo(pubkey);
  }

  function renderNode(pubkey: string, depth: number): ReactNode {
    const isMe = pubkey === myPubkey;
    const onPath = pathToMe.has(pubkey);
    const isOpen = !!expanded[pubkey];
    const info = infoByPk[pubkey];
    const isFetching = !!fetching[pubkey];
    return (
      <li key={pubkey} style={{ paddingLeft: depth * 16 }}>
        <div
          className={cn(
            'flex items-center gap-2 p-2 rounded-card',
            onPath && 'bg-moss-50/60',
            isMe && 'ring-1 ring-moss-500',
          )}
        >
          <button
            type="button"
            onClick={() => toggle(pubkey)}
            aria-label={isOpen ? 'Collapse' : 'Expand'}
            className="font-mono text-soil-500 w-5 text-left hover:text-soil-800"
          >
            {isOpen ? '▾' : '▸'}
          </button>
          <PubkeyChip pubkey={pubkey} />
          {isMe && (
            <span className="text-[11px] uppercase tracking-eyebrow text-moss-700">
              you
            </span>
          )}
        </div>
        {isOpen && (
          <ul className="mt-1">
            {isFetching && !info && (
              <li
                className="text-xs text-soil-500 py-1"
                style={{ paddingLeft: (depth + 1) * 16 }}
              >
                Loading…
              </li>
            )}
            {info && info.invitees.length === 0 && (
              <li
                className="text-xs text-soil-400 py-1"
                style={{ paddingLeft: (depth + 1) * 16 }}
              >
                No invitees.
              </li>
            )}
            {info?.invitees.map((child) => renderNode(child, depth + 1))}
          </ul>
        )}
      </li>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-screen-sm flex-col px-5 py-6 gap-4">
      <header className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack} aria-label="Back">
          {'←'} Back
        </Button>
        <h1 className="font-serif text-xl text-soil-900">Invite tree</h1>
        <span className="w-10" aria-hidden />
      </header>

      {!root && (
        <Card>
          <CardSubtitle>Loading roster…</CardSubtitle>
        </Card>
      )}

      {root && (
        <Card bodyless>
          <ul aria-label="Invite tree" className="p-2">
            {renderNode(root, 0)}
          </ul>
        </Card>
      )}
    </main>
  );
}

export default InviteTree;
