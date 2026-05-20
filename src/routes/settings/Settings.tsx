/**
 * SPEC-024 — Settings.
 *
 * Five cards stacked top-to-bottom:
 *   1. Chapter — current chapter name + relay URL, change/reset buttons.
 *   2. Sign-in — auth method label + truncated npub, optional reveal-nsec.
 *   3. Storage — read-only Blossom upload host derived from the relay.
 *   4. Notifications — request-permission affordance + current state.
 *   5. Sign-out — single destructive action.
 *
 * The route is intentionally read-mostly: the only stateful actions are the
 * Reset / Reveal / Request-permission / Sign-out buttons. "Change chapter"
 * delegates upstream so the parent can route to <ChapterSwitch />.
 */
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardSubtitle, CardTitle } from '@/components/ui/Card';
import { Sheet } from '@/components/ui/Sheet';
import { useToast } from '@/components/ui/Toast';
import {
  DEFAULT_RELAY,
  resetToDefault,
  useCurrentRelay,
} from '@/lib/chapter';
import { useAuth } from '@/lib/auth';
import { relayHttpsBase } from '@/lib/blossom';
import { requestPermission, type Permission } from '@/lib/notifications';

export interface SettingsProps {
  onBack?: () => void;
  onChangeChapter?: () => void;
  onSwitchedChapter?: () => void;
}

const METHOD_LABEL: Record<string, string> = {
  nip07: 'Browser extension',
  nip46: 'Remote signer',
  'nsec-local': 'Local key',
};

function truncateNpub(npub: string): string {
  if (npub.length <= 18) return npub;
  return `${npub.slice(0, 10)}…${npub.slice(-6)}`;
}

function safeBlossomBase(relay: string): string | null {
  try {
    return relayHttpsBase(relay);
  } catch {
    return null;
  }
}

function detectInitialPermission(): Permission | 'unknown' {
  if (typeof Notification === 'undefined') return 'unknown';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return 'unknown';
}

export function Settings({
  onBack,
  onChangeChapter,
  onSwitchedChapter,
}: SettingsProps) {
  const relay = useCurrentRelay();
  const auth = useAuth();
  const toast = useToast();
  const isDefault = relay === DEFAULT_RELAY;
  const chapterName = isDefault ? 'Powder Keg WV' : 'Custom relay';
  const blossomBase = safeBlossomBase(relay);
  const methodLabel = auth.method ? METHOD_LABEL[auth.method] ?? auth.method : 'Not signed in';

  const [permission, setPermission] = useState<Permission | 'unknown'>(
    detectInitialPermission(),
  );
  const [requestingPerm, setRequestingPerm] = useState(false);

  const [revealOpen, setRevealOpen] = useState(false);
  const [revealPw, setRevealPw] = useState('');
  const [revealedNsec, setRevealedNsec] = useState<string | null>(null);
  const [revealError, setRevealError] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);

  // Whenever the chapter relay actually changes, fire the upstream callback
  // so the parent can refetch / reconnect / refresh the feed.
  useEffect(() => {
    onSwitchedChapter?.();
    // We deliberately depend only on the relay URL, so the callback fires
    // after a change rather than on every parent re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relay]);

  function handleReset() {
    if (isDefault) return;
    resetToDefault();
    toast.success('Chapter reset', 'Reconnected to Powder Keg WV.');
  }

  async function handleRequestPermission() {
    setRequestingPerm(true);
    try {
      const r = await requestPermission();
      setPermission(r);
      if (r === 'granted') toast.success('Notifications enabled');
      else toast.warning('Notifications denied', 'You can enable later in your OS settings.');
    } finally {
      setRequestingPerm(false);
    }
  }

  function openReveal() {
    setRevealOpen(true);
    setRevealPw('');
    setRevealError(null);
    setRevealedNsec(null);
  }

  function closeReveal() {
    setRevealOpen(false);
    setRevealPw('');
    setRevealError(null);
    setRevealedNsec(null);
  }

  async function handleReveal() {
    setRevealing(true);
    setRevealError(null);
    try {
      const nsec = await auth.revealNsec(revealPw);
      setRevealedNsec(nsec);
    } catch (err) {
      setRevealError((err as Error)?.message ?? 'Could not reveal');
    } finally {
      setRevealing(false);
    }
  }

  async function handleSignOut() {
    await auth.logout();
    toast.success('Signed out');
  }

  const permLabel =
    permission === 'granted'
      ? 'Granted'
      : permission === 'denied'
        ? 'Denied'
        : 'Not requested';

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-screen-sm flex-col px-5 py-6 gap-4">
      <header className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack} aria-label="Back">
          {'←'} Back
        </Button>
        <h1 className="font-serif text-xl text-soil-900">Settings</h1>
        <span className="w-12" />
      </header>

      <Card>
        <CardTitle>Chapter</CardTitle>
        <CardSubtitle>{chapterName}</CardSubtitle>
        <p className="mt-2 break-all font-mono text-xs text-soil-500" aria-label="Current relay URL">
          {relay}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={onChangeChapter}>
            Change chapter
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            disabled={isDefault}
          >
            Reset to default chapter
          </Button>
        </div>
      </Card>

      <Card>
        <CardTitle>Sign-in</CardTitle>
        <CardSubtitle>{methodLabel}</CardSubtitle>
        {auth.npub && (
          <p className="mt-2 break-all font-mono text-xs text-soil-500" aria-label="Current npub">
            {truncateNpub(auth.npub)}
          </p>
        )}
        {auth.method === 'nsec-local' && (
          <div className="mt-4">
            <Button variant="secondary" size="sm" onClick={openReveal}>
              Reveal nsec once
            </Button>
          </div>
        )}
      </Card>

      <Card>
        <CardTitle>Storage</CardTitle>
        <CardSubtitle>Blossom upload server (read-only)</CardSubtitle>
        <p className="mt-2 break-all font-mono text-xs text-soil-500" aria-label="Blossom server URL">
          {blossomBase ?? '(unavailable for the current relay)'}
        </p>
      </Card>

      <Card>
        <CardTitle>Notifications</CardTitle>
        <CardSubtitle>Status: {permLabel}</CardSubtitle>
        {permission !== 'granted' && (
          <div className="mt-4">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleRequestPermission}
              loading={requestingPerm}
              disabled={requestingPerm}
            >
              Request permission
            </Button>
          </div>
        )}
      </Card>

      <Card>
        <CardTitle>Sign out</CardTitle>
        <CardSubtitle>Disconnects this device. Your keys stay where they are.</CardSubtitle>
        <div className="mt-4">
          <Button variant="destructive" size="sm" onClick={handleSignOut}>
            Sign out
          </Button>
        </div>
      </Card>

      <Sheet
        open={revealOpen}
        onClose={closeReveal}
        title="Reveal nsec"
        description="Your secret key will appear once. Treat it like a master password."
        footer={
          revealedNsec ? (
            <Button fullWidth onClick={closeReveal}>Done</Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="ghost" fullWidth onClick={closeReveal}>Cancel</Button>
              <Button
                fullWidth
                onClick={handleReveal}
                loading={revealing}
                disabled={revealing || revealPw.length === 0}
              >
                Reveal
              </Button>
            </div>
          )
        }
      >
        {revealedNsec ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-harvest-700 font-medium">
              Anyone with this string can act as you. Copy it once into a password
              manager and never share it.
            </p>
            <code
              aria-label="Revealed nsec"
              className="rounded-card bg-soil-100 p-3 font-mono text-xs break-all text-soil-900"
            >
              {revealedNsec}
            </code>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <Input
              label="Passphrase"
              type="password"
              value={revealPw}
              onChange={(e) => setRevealPw(e.target.value)}
              autoFocus
              error={revealError ?? undefined}
            />
          </div>
        )}
      </Sheet>
    </main>
  );
}

export default Settings;
