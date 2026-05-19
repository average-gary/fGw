/**
 * SPEC-010 — Onboarding route.
 *
 * Three-step flow:
 *   1. Method picker (NIP-07 / NIP-46 / new local key)
 *   2. Passphrase setup or unlock (skipped for nip07)
 *   3. Optional location consent
 *   → "You're in. Welcome to Powder Keg." final card.
 *
 * Acceptance: fresh install, no extension installed → tap "Continue with new
 * key" → enter passphrase → tap "Generate" → see npub. That's 4 taps.
 */
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardTitle, CardSubtitle } from '@/components/ui/Card';
import { Sheet } from '@/components/ui/Sheet';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';
import { detectNip07 } from '@/lib/auth/nip07';
import { useAuth, useAuthStore } from '@/lib/auth';
import { useLocation } from '@/lib/location';
import { useOnboarding } from '@/lib/onboarding';
import { cn } from '@/lib/cn';

type Step = 'method' | 'passphrase' | 'location' | 'done';

function StepDots({ active }: { active: 1 | 2 | 3 | 4 }) {
  return (
    <div
      role="progressbar"
      aria-valuenow={active}
      aria-valuemin={1}
      aria-valuemax={4}
      className="flex items-center justify-center gap-2 py-3"
    >
      {[1, 2, 3, 4].map((n) => (
        <span
          key={n}
          className={cn(
            'block h-1.5 rounded-full transition-all',
            n === active ? 'w-8 bg-moss-600' : 'w-4 bg-soil-200',
          )}
        />
      ))}
    </div>
  );
}

export function Onboarding() {
  const auth = useAuth();
  const onboarding = useOnboarding();
  const toast = useToast();
  const loc = useLocation();
  const hasExtension = useMemo(() => detectNip07(), []);
  // If a user already has a stored nsec (returning), prompt unlock instead of
  // generate. We can't detect IndexedDB synchronously without an async call,
  // so we let the user choose; the unlock path is presented when their
  // persisted method is `nsec-local`.
  const isReturningNsec = auth.method === 'nsec-local';
  const [step, setStep] = useState<Step>('method');
  const [nip46Open, setNip46Open] = useState(false);
  const [bunkerUri, setBunkerUri] = useState('');
  const [pw, setPw] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwMode, setPwMode] = useState<'generate' | 'unlock'>(
    isReturningNsec ? 'unlock' : 'generate',
  );
  const [busy, setBusy] = useState(false);
  const [npubShown, setNpubShown] = useState<string | null>(null);

  // If the auth bootstrap has already restored a session (e.g. nip07 user
  // returning with extension still installed), advance past the picker.
  useEffect(() => {
    if (auth.status === 'ready' && step === 'method') {
      setStep('location');
    }
  }, [auth.status, step]);

  const passphraseError = (() => {
    if (pwMode === 'generate') {
      if (pw.length === 0) return undefined;
      if (pw.length < 8) return 'Use at least 8 characters.';
      if (pwConfirm.length > 0 && pw !== pwConfirm)
        return 'Passphrases do not match.';
    }
    return undefined;
  })();

  // ---- Step 1: method picker ------------------------------------------
  function pickNip07() {
    setBusy(true);
    auth
      .loginNip07()
      .then(() => {
        setStep('location');
      })
      .catch((err) => {
        toast.danger(
          'Extension login failed',
          (err as Error)?.message ?? 'Try a different method.',
        );
      })
      .finally(() => setBusy(false));
  }

  function pickNewKey() {
    setPwMode(isReturningNsec ? 'unlock' : 'generate');
    setStep('passphrase');
  }

  function pickRemoteSigner() {
    setNip46Open(true);
  }

  function submitBunkerUri() {
    if (!bunkerUri.trim()) return;
    setBusy(true);
    auth
      .loginNip46(bunkerUri.trim())
      .then(() => {
        setNip46Open(false);
        setStep('location');
      })
      .catch((err) => {
        toast.danger(
          'Bunker connection failed',
          (err as Error)?.message ?? 'Check the URI and try again.',
        );
      })
      .finally(() => setBusy(false));
  }

  // ---- Step 2: passphrase / unlock -------------------------------------
  function submitPassphrase() {
    if (pwMode === 'generate') {
      if (pw.length < 8 || pw !== pwConfirm) return;
    } else {
      if (pw.length === 0) return;
    }
    setBusy(true);
    auth
      .loginNsec(pw, pwMode)
      .then(() => {
        // Read from the store directly — the closed-over `auth.npub` is stale.
        const fresh = useAuthStore.getState().npub ?? '';
        setNpubShown(fresh || null);
      })
      .catch((err) => {
        const e = err as { kind?: string; message?: string };
        toast.danger(
          pwMode === 'generate'
            ? 'Could not create key'
            : 'Could not unlock',
          e?.message ?? e?.kind ?? 'Try again.',
        );
      })
      .finally(() => setBusy(false));
  }

  // After loginNsec resolves, auth.npub becomes available. Sync it.
  useEffect(() => {
    if (
      step === 'passphrase' &&
      auth.status === 'ready' &&
      auth.method === 'nsec-local' &&
      auth.npub
    ) {
      setNpubShown(auth.npub);
    }
  }, [auth.status, auth.method, auth.npub, step]);

  function dismissNpub() {
    setNpubShown(null);
    setPw('');
    setPwConfirm('');
    setStep('location');
  }

  // ---- Step 3: location -------------------------------------------------
  function shareLocation() {
    setBusy(true);
    loc
      .requestLocation()
      .then(() => {
        toast.success('Location saved', `Stored geohash precision ${loc.precision} (~5 km).`);
        setStep('done');
      })
      .catch((err: unknown) => {
        const e = err as { message?: string };
        toast.warning(
          'Location unavailable',
          e?.message ?? 'You can share it later from settings.',
        );
        setStep('done');
      })
      .finally(() => setBusy(false));
  }

  function skipLocation() {
    setStep('done');
  }

  // ---- Done -------------------------------------------------------------
  function openFeed() {
    onboarding.markComplete();
    // Feed isn't built yet (SPEC-018). Leave a breadcrumb for the agent.
    // eslint-disable-next-line no-console
    console.log('[onboarding] TODO: navigate to Feed (SPEC-018) once available.');
  }

  const activeDot: 1 | 2 | 3 | 4 =
    step === 'method' ? 1 : step === 'passphrase' ? 2 : step === 'location' ? 3 : 4;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-screen-sm flex-col px-5 py-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-eyebrow text-soil-500">
            Compost Marketplace
          </p>
          <h1 className="font-serif text-3xl text-soil-900 leading-tight">
            Welcome
          </h1>
        </div>
        <Badge>Powder Keg WV</Badge>
      </header>
      <StepDots active={activeDot} />

      {step === 'method' && (
        <section aria-labelledby="step1-title" className="flex flex-col gap-4">
          <Card>
            <CardTitle id="step1-title">Pick how you sign in</CardTitle>
            <CardSubtitle>
              Compost Marketplace runs on Nostr. You need a key — a tiny
              identity you control. The chapter relay is set automatically.
            </CardSubtitle>
            <div className="mt-4 flex flex-col gap-3">
              <Button
                variant="primary"
                fullWidth
                onClick={pickNewKey}
                disabled={busy}
              >
                Continue with new key
              </Button>
              <Button
                variant="secondary"
                fullWidth
                onClick={pickNip07}
                disabled={busy || !hasExtension}
                loading={busy && auth.status === 'connecting' && auth.method === null}
              >
                Continue with extension
              </Button>
              {!hasExtension && (
                <p className="text-xs text-soil-500 -mt-1">
                  No NIP-07 extension detected (e.g. Alby, nos2x). Skip this
                  option or install one.
                </p>
              )}
              <Button
                variant="ghost"
                fullWidth
                onClick={pickRemoteSigner}
                disabled={busy}
              >
                Use a remote signer
              </Button>
            </div>
          </Card>
        </section>
      )}

      {step === 'passphrase' && !npubShown && (
        <section aria-labelledby="step2-title" className="flex flex-col gap-4">
          <Card>
            <CardTitle id="step2-title">
              {pwMode === 'generate' ? 'Set a passphrase' : 'Unlock your key'}
            </CardTitle>
            <CardSubtitle>
              {pwMode === 'generate'
                ? 'Your passphrase encrypts the key on this device. We cannot recover it. Write it down somewhere safe.'
                : 'Enter the passphrase you used to encrypt this key.'}
            </CardSubtitle>
            <div className="mt-4 flex flex-col gap-3">
              <Input
                label="Passphrase"
                type="password"
                autoComplete="new-password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                helperText={
                  pwMode === 'generate' && !passphraseError
                    ? 'At least 8 characters.'
                    : undefined
                }
                error={passphraseError}
              />
              {pwMode === 'generate' && (
                <Input
                  label="Confirm passphrase"
                  type="password"
                  autoComplete="new-password"
                  value={pwConfirm}
                  onChange={(e) => setPwConfirm(e.target.value)}
                />
              )}
              <Button
                variant="primary"
                fullWidth
                onClick={submitPassphrase}
                loading={busy}
                disabled={
                  busy ||
                  (pwMode === 'generate'
                    ? pw.length < 8 || pw !== pwConfirm
                    : pw.length === 0)
                }
              >
                {pwMode === 'generate' ? 'Generate' : 'Unlock'}
              </Button>
              <Button
                variant="ghost"
                fullWidth
                onClick={() => setStep('method')}
                disabled={busy}
              >
                Back
              </Button>
            </div>
          </Card>
        </section>
      )}

      {step === 'passphrase' && npubShown && (
        <section aria-labelledby="step2b-title" className="flex flex-col gap-4">
          <Card>
            <CardTitle id="step2b-title">Your new key is ready</CardTitle>
            <CardSubtitle>
              This is your public identifier (npub). Share it freely — it does
              not expose your private key.
            </CardSubtitle>
            <div className="mt-4 break-all rounded-card bg-soil-100/70 px-3 py-2.5 font-mono text-xs text-soil-900">
              {npubShown}
            </div>
            <div className="mt-4">
              <Button variant="primary" fullWidth onClick={dismissNpub}>
                Got it
              </Button>
            </div>
          </Card>
        </section>
      )}

      {step === 'location' && (
        <section aria-labelledby="step3-title" className="flex flex-col gap-4">
          <Card>
            <CardTitle id="step3-title">Find nearby compost?</CardTitle>
            <CardSubtitle>
              Sharing approximate location helps you find piles and listings
              near you. We store geohash precision 5 (~5 km) by default —
              never your exact address. You can change this anytime.
            </CardSubtitle>
            <div className="mt-4 flex flex-col gap-3">
              <Button
                variant="primary"
                fullWidth
                onClick={shareLocation}
                loading={busy}
              >
                Share location
              </Button>
              <Button variant="ghost" fullWidth onClick={skipLocation}>
                Skip for now
              </Button>
            </div>
          </Card>
        </section>
      )}

      {step === 'done' && (
        <section aria-labelledby="step4-title" className="flex flex-col gap-4">
          <Card>
            <CardTitle id="step4-title">You&rsquo;re in. Welcome to Powder Keg.</CardTitle>
            <CardSubtitle>
              You can list spent grain, browse compost piles, or update your
              profile from here.
            </CardSubtitle>
            <div className="mt-4">
              <Button variant="primary" fullWidth onClick={openFeed}>
                Open feed
              </Button>
            </div>
          </Card>
        </section>
      )}

      <Sheet
        open={nip46Open}
        onClose={() => setNip46Open(false)}
        title="Use a remote signer"
        description="Paste a bunker:// URI from your NIP-46 signer (e.g. nsec.app)."
        footer={
          <div className="flex gap-2">
            <Button
              variant="ghost"
              fullWidth
              onClick={() => setNip46Open(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              fullWidth
              loading={busy}
              disabled={busy || !bunkerUri.trim()}
              onClick={submitBunkerUri}
            >
              Connect
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <Input
            label="Paste bunker URI"
            placeholder="bunker://..."
            value={bunkerUri}
            onChange={(e) => setBunkerUri(e.target.value)}
          />
          <p className="text-xs text-soil-500">
            QR scanning ships in a later release. For now, copy the URI from
            your signer and paste it here.
          </p>
        </div>
      </Sheet>
    </main>
  );
}

export default Onboarding;
