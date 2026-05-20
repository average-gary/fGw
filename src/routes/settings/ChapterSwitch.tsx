/**
 * SPEC-024 — Chapter switch.
 *
 * Full-screen flow (not a sheet) because changing the relay rewrites every
 * subscription in the app. Two confirmations gate the destructive action:
 *   1. Type the literal current chapter name into a confirmation input.
 *   2. Provide a syntactically-valid `wss://` (or `ws://`) URL.
 *
 * Until both are present, the Switch button is disabled. On click we call
 * `setCurrentRelay`, fire the upstream callback, and let the parent route
 * back to wherever it came from.
 */
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardSubtitle, CardTitle } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';
import {
  DEFAULT_RELAY,
  setCurrentRelay,
  useCurrentRelay,
} from '@/lib/chapter';

export interface ChapterSwitchProps {
  onCancel?: () => void;
  onSwitched?: (newRelay: string) => void;
}

const WARNING_TEXT =
  "You're about to leave Powder Keg WV. Listings, events, piles, and people from this chapter will no longer appear. Switch to a relay you trust — usually one a friend or chapter leader has shared with you.";

function isValidWsUrl(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  return u.protocol === 'wss:' || u.protocol === 'ws:';
}

function chapterNameForRelay(relay: string): string {
  return relay === DEFAULT_RELAY ? 'Powder Keg WV' : 'Custom relay';
}

export function ChapterSwitch({ onCancel, onSwitched }: ChapterSwitchProps) {
  const currentRelay = useCurrentRelay();
  const currentName = chapterNameForRelay(currentRelay);
  const toast = useToast();

  const [confirmName, setConfirmName] = useState('');
  const [url, setUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameMatches = confirmName.trim() === currentName;
  const urlValid = useMemo(() => isValidWsUrl(url.trim()), [url]);
  const sameAsCurrent = url.trim() === currentRelay;
  const canSwitch = nameMatches && urlValid && !sameAsCurrent;

  async function handleSwitch() {
    if (!canSwitch) return;
    setSubmitting(true);
    setError(null);
    try {
      const next = url.trim();
      setCurrentRelay(next);
      toast.success('Chapter switched', `Connecting to ${next}…`);
      onSwitched?.(next);
    } catch (err) {
      setError((err as Error)?.message ?? 'Could not switch.');
    } finally {
      setSubmitting(false);
    }
  }

  // The URL helper line lights up red as soon as the user types something
  // that is not a `ws(s)://` URL — we never block typing.
  const urlError =
    url.length > 0 && !urlValid
      ? 'Must be a wss:// or ws:// URL.'
      : sameAsCurrent && url.length > 0
        ? 'That is your current relay.'
        : undefined;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-screen-sm flex-col px-5 py-6 gap-4">
      <header className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onCancel} aria-label="Cancel">
          {'←'} Cancel
        </Button>
        <h1 className="font-serif text-xl text-soil-900">Switch chapter</h1>
        <span className="w-12" />
      </header>

      <div
        role="alert"
        className="rounded-card border border-harvest-300 bg-harvest-50 p-4 text-sm text-harvest-900 leading-snug"
      >
        {WARNING_TEXT}
      </div>

      <Card>
        <CardTitle>Confirm chapter name</CardTitle>
        <CardSubtitle>
          Type <span className="font-mono">{currentName}</span> to confirm you want
          to leave it.
        </CardSubtitle>
        <div className="mt-4">
          <Input
            label={`Type "${currentName}"`}
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            placeholder={currentName}
            autoComplete="off"
          />
        </div>
      </Card>

      <Card>
        <CardTitle>New relay URL</CardTitle>
        <CardSubtitle>
          Paste the wss:// URL of the chapter you are joining.
        </CardSubtitle>
        <div className="mt-4">
          <Input
            label="Relay URL"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="wss://relay.example.org"
            autoComplete="off"
            disabled={!nameMatches}
            error={urlError}
          />
        </div>
      </Card>

      {error && (
        <p role="alert" className="text-sm text-harvest-700">
          {error}
        </p>
      )}

      <div className="flex gap-2 pt-2">
        <Button variant="ghost" fullWidth onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button
          variant="destructive"
          fullWidth
          onClick={handleSwitch}
          loading={submitting}
          disabled={!canSwitch || submitting}
        >
          Switch
        </Button>
      </div>
    </main>
  );
}

export default ChapterSwitch;
