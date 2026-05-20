import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import { sendDm, subscribeDms, type DecryptedDm } from '@/lib/dm';
import { cn } from '@/lib/cn';
import { truncatedNpub } from './PubkeyChip';

export interface DmThreadSheetProps {
  open: boolean;
  onClose: () => void;
  me: string;
  other: string;
}

/**
 * Inline DM thread for a (me, other) pair, mounted in a Sheet. Subscribes
 * to NIP-17 wraps for the current user; filters client-side to messages
 * that involve `other`. Send disabled until the textarea is non-empty.
 */
export function DmThreadSheet({ open, onClose, me, other }: DmThreadSheetProps) {
  const [messages, setMessages] = useState<DecryptedDm[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    setMessages([]);
    let active = true;
    let unsub: (() => void) | undefined;
    try {
      unsub = subscribeDms().subscribe((dm) => {
        if (!active) return;
        const involves =
          (dm.from === me && dm.to === other) ||
          (dm.from === other && dm.to === me);
        if (!involves) return;
        setMessages((prev) =>
          prev.some((p) => p.id && p.id === dm.id)
            ? prev
            : [...prev, dm].sort((a, b) => a.createdAt - b.createdAt),
        );
      });
    } catch {
      /* no signer (logged out mid-render) — sheet still opens, send will surface the error */
    }
    return () => {
      active = false;
      unsub?.();
    };
  }, [open, me, other]);

  const handleSend = async (): Promise<void> => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await sendDm(other, text);
      setDraft('');
    } catch (err) {
      toast.danger(
        'Could not send DM',
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Direct message"
      description={truncatedNpub(other)}
    >
      <div className="flex flex-col gap-2 min-h-[20vh]" data-testid="dm-thread">
        {messages.length === 0 ? (
          <p className="text-sm text-soil-500 italic">No messages yet.</p>
        ) : (
          messages.map((m) => (
            <div
              key={m.id || `${m.from}-${m.createdAt}`}
              className={cn(
                'rounded-card px-3 py-2 max-w-[85%] text-sm',
                m.from === me
                  ? 'self-end bg-moss-100 text-moss-900'
                  : 'self-start bg-soil-100 text-soil-900',
              )}
            >
              {m.content}
            </div>
          ))
        )}
      </div>
      <div className="mt-4 flex flex-col gap-2">
        <Textarea
          aria-label="Message"
          placeholder="Type a message…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button
            onClick={handleSend}
            loading={sending}
            disabled={!draft.trim()}
          >
            Send
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

export default DmThreadSheet;
