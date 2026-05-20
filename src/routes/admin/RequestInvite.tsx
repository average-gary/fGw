/**
 * SPEC-026 — Admin: request-an-invite flow.
 *
 * For prospective ("not-listed") users. Shows the user's own npub
 * (read-only), a roster picker (multi-select), an optional note, and a
 * submit button that fans out a NIP-17 DM to each chosen member with a
 * deep-link a member's app can intercept to pre-fill the invite modal.
 *
 * Deep-link payload: `compostmkt://invite-request?npub=<npub>` plus the
 * note as plain text. The receiving SPEC-014 inbox is responsible for
 * recognizing the URI scheme and surfacing the "Approve and send invite"
 * action — that handoff lives in SPEC-028 (Inbox); this route only sends
 * the message.
 */
import { useEffect, useMemo, useState } from 'react';
import { Card, CardSubtitle, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import { PubkeyChip } from '@/components/feed/PubkeyChip';
import { useAuthStore } from '@/lib/auth';
import { listMembers, type Member } from '@/lib/pyramid';
import { sendDm } from '@/lib/dm';
import { cn } from '@/lib/cn';

export interface RequestInviteProps {
  onBack?: () => void;
}

function buildMessage(myNpub: string, note: string): string {
  const lines: string[] = [];
  lines.push('Hi — I would like to be invited to this Compost chapter.');
  lines.push('');
  lines.push(`My npub: ${myNpub}`);
  if (note.trim()) {
    lines.push('');
    lines.push(note.trim());
  }
  lines.push('');
  lines.push(`compostmkt://invite-request?npub=${myNpub}`);
  return lines.join('\n');
}

export function RequestInvite({ onBack }: RequestInviteProps) {
  const myNpub = useAuthStore((s) => s.npub);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const toast = useToast();

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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) =>
        m.pubkey.toLowerCase().includes(q) ||
        (m.npub ?? '').toLowerCase().includes(q),
    );
  }, [members, search]);

  function toggle(pk: string): void {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(pk)) next.delete(pk);
      else next.add(pk);
      return next;
    });
  }

  async function submit(): Promise<void> {
    if (!myNpub) {
      toast.danger('Sign in first', 'Generate or unlock a key to continue.');
      return;
    }
    if (picked.size === 0) {
      toast.warning('Pick at least one member', 'Select someone to ask.');
      return;
    }
    setSending(true);
    const content = buildMessage(myNpub, note);
    let sent = 0;
    let failed = 0;
    for (const pk of picked) {
      try {
        await sendDm(pk, content);
        sent += 1;
      } catch {
        failed += 1;
      }
    }
    setSending(false);
    if (sent > 0) {
      setDone(true);
      toast.success(
        'Request sent',
        `Delivered to ${sent} member${sent === 1 ? '' : 's'}${
          failed ? ` (${failed} failed)` : ''
        }.`,
      );
    } else {
      toast.danger(
        'Could not send',
        'All requests failed — try again or pick someone else.',
      );
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-screen-sm flex-col px-5 py-6 gap-4">
      <header className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack} aria-label="Back">
          {'←'} Back
        </Button>
        <h1 className="font-serif text-xl text-soil-900">Request invite</h1>
        <span className="w-10" aria-hidden />
      </header>

      {done ? (
        <Card>
          <CardTitle>Request sent.</CardTitle>
          <CardSubtitle>Watch for a DM if approved.</CardSubtitle>
          <div className="mt-4">
            <Button variant="secondary" onClick={onBack} fullWidth>
              Done
            </Button>
          </div>
        </Card>
      ) : (
        <>
          <Card>
            <CardTitle>Ask to join</CardTitle>
            <CardSubtitle>
              Pick one or more existing members to ask. They'll get a DM with
              your npub.
            </CardSubtitle>
            <div className="mt-4 flex flex-col gap-4">
              <Input
                label="Your npub"
                aria-label="Your npub"
                value={myNpub ?? ''}
                readOnly
                inputClassName="font-mono"
              />
              <Textarea
                label="Note (optional)"
                aria-label="Note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. I'm a Powder Keg CSA member"
                autoGrow
              />
            </div>
          </Card>

          <Input
            aria-label="Search members"
            placeholder="Search members"
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
              <CardSubtitle>
                {search ? 'Nothing matches.' : 'No members on this relay.'}
              </CardSubtitle>
            </Card>
          )}

          {!loading && filtered.length > 0 && (
            <Card bodyless>
              <ul aria-label="Members">
                {filtered.map((m) => {
                  const isPicked = picked.has(m.pubkey);
                  return (
                    <li
                      key={m.pubkey}
                      className={cn(
                        'flex items-center justify-between gap-3 p-3 border-b border-soil-100 last:border-b-0',
                        isPicked && 'bg-moss-50/60',
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <PubkeyChip pubkey={m.pubkey} />
                      </div>
                      <Button
                        variant={isPicked ? 'primary' : 'secondary'}
                        size="sm"
                        onClick={() => toggle(m.pubkey)}
                        aria-label={
                          isPicked
                            ? `Remove ${m.pubkey.slice(0, 8)}`
                            : `Pick ${m.pubkey.slice(0, 8)}`
                        }
                        aria-pressed={isPicked}
                      >
                        {isPicked ? 'Picked' : 'Pick'}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          <Button
            variant="primary"
            fullWidth
            onClick={() => void submit()}
            loading={sending}
            disabled={sending || !myNpub || picked.size === 0}
          >
            Send request
            {picked.size > 0 ? ` to ${picked.size}` : ''}
          </Button>
        </>
      )}
    </main>
  );
}

export default RequestInvite;
