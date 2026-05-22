/**
 * SPEC-026 — Admin: members roster.
 *
 * Renders the chapter membership roster sourced from `listMembers()`.
 * Top-right floating CTA opens a Sheet to invite a new member by npub.
 *
 * Authority enforcement is **client-side only** — the relay is the source
 * of truth and rejects unauthorized POSTs (we surface the resulting
 * `forbidden`/`over-quota` etc. errors via toasts).
 *
 * Drop button visibility heuristic: per-row inviter chains are NOT eagerly
 * fetched (would be N HTTP round-trips). We render Drop optimistically for
 * every row when the current user is signed in; the relay's 403 lands as a
 * toast on click. This is a deliberate trade-off documented at the top of
 * SPEC-026 ("show the Drop Button when current user is root, OR
 * optimistically and let the relay 403"). When the current user IS root
 * (resolved via `useIsRoot()`, which scrapes the signed-in user's
 * `/u/{pubkey}` page since NIP-86 list responses don't carry level), Drop
 * is unconditional.
 */
import { useEffect, useMemo, useState } from 'react';
import { Card, CardSubtitle, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Sheet } from '@/components/ui/Sheet';
import { useToast } from '@/components/ui/Toast';
import { PubkeyChip } from '@/components/feed/PubkeyChip';
import { useAuthStore } from '@/lib/auth';
import {
  listMembers,
  inviteByNpub,
  dropMember,
  useIsRoot,
  type Member,
  type InviteError,
  type DropError,
} from '@/lib/pyramid';

export interface MembersProps {
  onBack?: () => void;
  /** When set, opens the invite Sheet pre-populated with this npub. */
  deepLinkInviteNpub?: string;
}

function inviteErrorMessage(e: InviteError): string {
  switch (e) {
    case 'not-authed':
      return 'Sign in first.';
    case 'over-quota':
      return 'You are over your invite quota for this period.';
    case 'cycle':
      return 'That would create an invite cycle.';
    case 'already-member':
      return 'That npub is already a chapter member.';
    case 'forbidden':
      return 'The relay refused the invite.';
    case 'network':
      return 'Network error — try again.';
  }
}

function dropErrorMessage(e: DropError): string {
  switch (e) {
    case 'not-authed':
      return 'Sign in first.';
    case 'forbidden':
      return 'You do not have authority to drop that member.';
    case 'not-found':
      return 'Member not found.';
    case 'network':
      return 'Network error — try again.';
  }
}

export function Members({ onBack, deepLinkInviteNpub }: MembersProps) {
  const signer = useAuthStore((s) => s.signer);
  const [myPubkey, setMyPubkey] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteValue, setInviteValue] = useState(deepLinkInviteNpub ?? '');
  const [inviting, setInviting] = useState(false);
  const [droppingPk, setDroppingPk] = useState<string | null>(null);
  const toast = useToast();

  // Resolve our hex pubkey from the signer.
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

  // Load roster on mount.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void listMembers()
      .then((rows) => {
        if (!cancelled) setMembers(rows);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Open the invite sheet if a deep-link npub is supplied.
  useEffect(() => {
    if (deepLinkInviteNpub) {
      setInviteValue(deepLinkInviteNpub);
      setInviteOpen(true);
    }
  }, [deepLinkInviteNpub]);

  // Resolved by scraping the signed-in user's `/u/{pubkey}` page (status
  // text === "root member"). NIP-86 list responses don't carry level.
  const isRoot = useIsRoot();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) =>
        m.pubkey.toLowerCase().includes(q) ||
        (m.npub ?? '').toLowerCase().includes(q),
    );
  }, [members, search]);

  async function submitInvite(): Promise<void> {
    const npub = inviteValue.trim();
    if (!npub) {
      toast.warning('Enter an npub', 'Paste a public key starting with npub1…');
      return;
    }
    setInviting(true);
    try {
      const res = await inviteByNpub(npub);
      if (res.ok) {
        toast.success('Invited', 'Member added to the chapter.');
        setInviteOpen(false);
        setInviteValue('');
        // Re-fetch roster to surface the new member.
        const rows = await listMembers();
        setMembers(rows);
      } else {
        toast.danger('Could not invite', inviteErrorMessage(res.error));
      }
    } finally {
      setInviting(false);
    }
  }

  async function submitDrop(pubkey: string): Promise<void> {
    setDroppingPk(pubkey);
    try {
      const res = await dropMember(pubkey);
      if (res.ok) {
        toast.success('Dropped', 'Member removed.');
        setMembers((prev) => prev.filter((m) => m.pubkey !== pubkey));
      } else {
        toast.danger('Could not drop', dropErrorMessage(res.error));
      }
    } finally {
      setDroppingPk(null);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-screen-sm flex-col px-5 py-6 gap-4">
      <header className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack} aria-label="Back">
          {'←'} Back
        </Button>
        <h1 className="font-serif text-xl text-soil-900">Members</h1>
        <Button
          variant="primary"
          size="sm"
          onClick={() => setInviteOpen(true)}
          aria-label="Invite by npub"
        >
          + Invite
        </Button>
      </header>

      <Input
        aria-label="Search members"
        placeholder="Search by npub or pubkey"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {loading && (
        <Card>
          <CardSubtitle>Loading roster…</CardSubtitle>
        </Card>
      )}

      {!loading && filtered.length === 0 && (
        <Card>
          <CardTitle>No members</CardTitle>
          <CardSubtitle>
            {search
              ? 'Nothing matches that search.'
              : 'Roster is empty on the chapter relay.'}
          </CardSubtitle>
        </Card>
      )}

      {!loading && filtered.length > 0 && (
        <Card bodyless>
          <ul aria-label="Members">
            {filtered.map((m) => {
              const canDrop = !!signer && (isRoot || myPubkey !== m.pubkey);
              const truncatedNpub = m.npub
                ? m.npub.slice(0, 12) + '…' + m.npub.slice(-4)
                : m.pubkey.slice(0, 12) + '…';
              return (
                <li
                  key={m.pubkey}
                  className="flex items-center justify-between gap-3 p-3 border-b border-soil-100 last:border-b-0"
                >
                  <div className="min-w-0 flex-1 flex flex-col gap-1">
                    <PubkeyChip pubkey={m.pubkey} />
                    <span className="font-mono text-[11px] text-soil-500 truncate">
                      {truncatedNpub}
                    </span>
                  </div>
                  {canDrop && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void submitDrop(m.pubkey)}
                      loading={droppingPk === m.pubkey}
                      disabled={droppingPk !== null}
                      aria-label={`Drop ${truncatedNpub}`}
                    >
                      Drop
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Sheet
        open={inviteOpen}
        onClose={() => {
          if (!inviting) setInviteOpen(false);
        }}
        title="Invite by npub"
        description="Add a new member to this chapter."
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => setInviteOpen(false)}
              disabled={inviting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => void submitInvite()}
              loading={inviting}
            >
              Send invite
            </Button>
          </div>
        }
      >
        <Input
          label="npub"
          value={inviteValue}
          onChange={(e) => setInviteValue(e.target.value)}
          placeholder="npub1…"
          aria-label="Invitee npub"
          inputClassName="font-mono"
        />
        <p className="mt-2 text-xs text-soil-500">
          The relay will reject the invite if you are over quota or the npub
          is already a member.
        </p>
      </Sheet>
    </main>
  );
}

export default Members;
