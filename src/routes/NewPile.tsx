/**
 * SPEC-021 — New pile wizard.
 *
 * Five visible steps (preset / [size] / location / schedule / preview) flow
 * the operator from picking a `PILE_PRESETS` size to publishing one
 * kind-30078 pile event + six kind-31923 turn events. On success we call
 * `scheduleNotificationsForPile(pile)` so the local notification scheduler
 * arms reminders for the upcoming turns. On partial failure we show a
 * "Publish remaining (N)" button that retries only the failed events.
 *
 * Membership-gated: while `useMembershipStatus` ≠ `'allowed'`, the wizard
 * still renders for review but the publish action is locked behind a banner.
 *
 * Step bodies live in `components/pile/PileWizardSteps.tsx` so this file
 * stays under the spec's 500-LOC ceiling.
 */
import { useEffect, useMemo, useState } from 'react';
import { type NDKSigner } from '@nostr-dev-kit/ndk';

import { Button } from '@/components/ui/Button';
import { Card, CardSubtitle, CardTitle } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';
import {
  LocationStep,
  PresetStep,
  PreviewStep,
  ScheduleStep,
  SizeStep,
  type PublishStatusRow,
} from '@/components/pile/PileWizardSteps';
import {
  asCalendarEvent,
  deviceTimezone,
  dimensionsForPreset,
  signAndPublish,
  slugify,
  tzOptionsFor,
} from '@/components/pile/wizardUtils';

import { PILE_MIN_DIMENSIONS, type Dimensions, type PilePresetId } from '@/domain/fgw';
import { truncateGeohash } from '@/domain/geoPrecision';

import { useAuth, useAuthStore } from '@/lib/auth';
import { useLocation } from '@/lib/location';
import { useMembershipStatus, usePublishGuard } from '@/lib/pyramid';
import { encodePile } from '@/lib/pile/events';
import { generateTurnEvents } from '@/lib/pile/schedule';
import type { Pile } from '@/lib/pile/types';
import { encodeLaborEvent } from '@/lib/events/calendar';
import { scheduleNotificationsForPile } from '@/lib/notifications';

type Step = 'preset' | 'size' | 'location' | 'schedule' | 'preview';

export interface NewPileProps {
  onPublished?: (pileD: string) => void;
  onCancel?: () => void;
  onRequestInvite?: () => void;
}

export function NewPile({ onPublished, onCancel, onRequestInvite }: NewPileProps = {}) {
  const auth = useAuth();
  const toast = useToast();
  const loc = useLocation();
  const { guard, blocked } = usePublishGuard();

  const [myPubkey, setMyPubkey] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const signer = auth.signer as NDKSigner | null;
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
  }, [auth.signer]);

  const membership = useMembershipStatus(myPubkey ?? '');
  const readOnly = !!myPubkey && membership !== 'allowed';

  const deviceTz = useMemo(() => deviceTimezone(), []);
  const tzOptions = useMemo(() => tzOptionsFor(deviceTz), [deviceTz]);

  const [step, setStep] = useState<Step>('preset');
  const [presetId, setPresetId] = useState<PilePresetId>('standard');
  const [dim, setDim] = useState<Dimensions>(() => dimensionsForPreset('standard'));
  const [name, setName] = useState('');
  const [locationText, setLocationText] = useState('');
  const [geoPrecision, setGeoPrecision] = useState<number>(loc.precision ?? 5);
  const [plannedDate, setPlannedDate] = useState('');
  const [timezone, setTimezone] = useState(deviceTz);
  const [busy, setBusy] = useState(false);
  // Slug minted on the first publish attempt so retries replace the same
  // addressable kind-30078 + 31923 events instead of forking new ones.
  const [pileSlug, setPileSlug] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<PublishStatusRow[]>([]);

  useEffect(() => {
    if (presetId !== 'custom') setDim(dimensionsForPreset(presetId));
  }, [presetId]);

  const minDimErrors = useMemo(() => {
    const errs: string[] = [];
    if (dim.length < PILE_MIN_DIMENSIONS.length)
      errs.push(`length ≥ ${PILE_MIN_DIMENSIONS.length} m`);
    if (dim.width < PILE_MIN_DIMENSIONS.width)
      errs.push(`width ≥ ${PILE_MIN_DIMENSIONS.width} m`);
    if (dim.height < PILE_MIN_DIMENSIONS.height)
      errs.push(`height ≥ ${PILE_MIN_DIMENSIONS.height} m`);
    return errs;
  }, [dim]);

  const plannedBuildSec = useMemo(() => {
    if (!plannedDate) return 0;
    const ms = Date.parse(`${plannedDate}T09:00:00`);
    return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
  }, [plannedDate]);

  const draftPile = useMemo<Pile | null>(() => {
    if (!myPubkey || !name.trim() || plannedBuildSec === 0) return null;
    if (minDimErrors.length > 0) return null;
    const truncatedGeohash =
      loc.geohash && geoPrecision > 0
        ? truncateGeohash(loc.geohash, Math.min(geoPrecision, loc.geohash.length))
        : undefined;
    const p: Pile = {
      d: pileSlug ?? '__preview__',
      name: name.trim(),
      builder: myPubkey,
      dimensions: dim,
      presetId,
      plannedBuildDate: plannedBuildSec,
      timezone,
      layers: [],
      turnRecords: [],
      state: 'DRAFT',
      photos: [],
      version: 1,
    };
    if (locationText.trim()) p.locationText = locationText.trim();
    if (truncatedGeohash) {
      p.geohash = truncatedGeohash;
      p.geoPrecision = truncatedGeohash.length;
    }
    return p;
  }, [
    myPubkey,
    name,
    plannedBuildSec,
    minDimErrors.length,
    loc.geohash,
    geoPrecision,
    dim,
    presetId,
    timezone,
    locationText,
    pileSlug,
  ]);

  const turnEventsPreview = useMemo(
    () => (draftPile ? generateTurnEvents(draftPile) : []),
    [draftPile],
  );

  const stepOrder: Step[] = ['preset', 'size', 'location', 'schedule', 'preview'];
  const visibleSteps = stepOrder.filter((s) => s !== 'size' || presetId === 'custom');
  const canAdvanceFrom: Record<Step, boolean> = {
    preset: presetId !== 'custom' || minDimErrors.length === 0,
    size: minDimErrors.length === 0,
    location: true,
    schedule: name.trim().length > 0 && plannedBuildSec > 0,
    preview: true,
  };

  function go(delta: 1 | -1): void {
    const idx = visibleSteps.indexOf(step);
    if (idx < 0) return;
    const next = visibleSteps[idx + delta];
    if (next) setStep(next);
  }

  async function publishOne(
    pile: Pile,
    target: PublishStatusRow,
    signer: NDKSigner,
  ): Promise<boolean> {
    const result = await guard(async () => {
      if (target.kind === 'pile') {
        await signAndPublish(signer, encodePile(pile));
      } else {
        const events = generateTurnEvents(pile);
        const ev = events[target.index - 1];
        if (!ev) throw new Error(`turn ${target.index} missing`);
        await signAndPublish(
          signer,
          encodeLaborEvent(asCalendarEvent(ev), {
            dSlug: `${pile.d}-turn-${target.index}`,
          }),
        );
      }
      return true as const;
    });
    return !!result;
  }

  function patchStatus(target: PublishStatusRow, state: PublishStatusRow['state']): void {
    setStatuses((prev) =>
      prev.map((s) =>
        s.kind === target.kind && s.index === target.index ? { ...s, state } : s,
      ),
    );
  }

  async function publishAll(): Promise<void> {
    if (!draftPile || readOnly || busy) return;
    const signer = useAuthStore.getState().signer as NDKSigner | null;
    if (!signer) {
      toast.danger('Not signed in', 'Sign in before creating a pile.');
      return;
    }
    setBusy(true);

    const slug = pileSlug ?? slugify(draftPile.name);
    if (!pileSlug) setPileSlug(slug);
    const pile: Pile = { ...draftPile, d: slug };

    const fresh: PublishStatusRow[] = [
      { kind: 'pile', index: 0, state: 'pending' },
      ...Array.from({ length: 6 }, (_, i) => ({
        kind: 'turn' as const,
        index: i + 1,
        state: 'pending' as const,
      })),
    ];
    setStatuses(fresh);

    let pileOk = false;
    let turnOk = 0;
    for (const target of fresh) {
      try {
        const ok = await publishOne(pile, target, signer);
        if (ok) {
          patchStatus(target, 'sent');
          if (target.kind === 'pile') pileOk = true;
          else turnOk += 1;
        } else {
          patchStatus(target, 'failed');
        }
      } catch {
        patchStatus(target, 'failed');
      }
    }

    setBusy(false);

    if (pileOk) {
      try {
        await scheduleNotificationsForPile(pile);
      } catch {
        /* notifications are best-effort */
      }
    }

    if (pileOk && turnOk === 6) {
      toast.success('Pile published', `${pile.name} + 6 turn events`);
      onPublished?.(pile.d);
    } else {
      toast.warning(
        'Some events failed',
        'Tap “Publish remaining” to retry the failed events.',
      );
    }
  }

  async function publishRemaining(): Promise<void> {
    if (!draftPile || readOnly || busy) return;
    const signer = useAuthStore.getState().signer as NDKSigner | null;
    if (!signer || !pileSlug) return;
    const pile: Pile = { ...draftPile, d: pileSlug };
    setBusy(true);
    for (const s of statuses.filter((x) => x.state === 'failed')) {
      try {
        const ok = await publishOne(pile, s, signer);
        patchStatus(s, ok ? 'sent' : 'failed');
      } catch {
        patchStatus(s, 'failed');
      }
    }
    setBusy(false);
  }

  const remainingFailed = statuses.filter((s) => s.state === 'failed').length;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-screen-sm flex-col px-5 pb-12 pt-6 gap-4">
      <header className="flex items-center justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-eyebrow text-soil-500">
            Start a pile
          </p>
          <h1 className="font-serif text-3xl text-soil-900 leading-tight">New pile</h1>
        </div>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        )}
      </header>

      {readOnly && (
        <Card variant="inset">
          <CardTitle>Membership required</CardTitle>
          <CardSubtitle>
            You can preview the wizard but only Powder Keg members can publish a pile.
          </CardSubtitle>
          <div className="mt-3">
            <Button
              variant="primary"
              onClick={() => onRequestInvite?.()}
              disabled={!onRequestInvite}
            >
              Request invite
            </Button>
          </div>
        </Card>
      )}

      {blocked && !readOnly && (
        <Card variant="inset">
          <CardTitle>Relay rejected the publish</CardTitle>
          <CardSubtitle>Likely a membership change. Try again later.</CardSubtitle>
        </Card>
      )}

      <nav
        className="flex flex-wrap items-center gap-2 text-xs font-mono uppercase tracking-eyebrow text-soil-500"
        aria-label="Wizard progress"
      >
        {visibleSteps.map((s, i, arr) => (
          <span key={s} className="flex items-center gap-2">
            <span
              className={s === step ? 'text-soil-900 font-semibold' : 'text-soil-500'}
              aria-current={s === step ? 'step' : undefined}
            >
              {i + 1}. {s}
            </span>
            {i < arr.length - 1 && <span aria-hidden>·</span>}
          </span>
        ))}
      </nav>

      {step === 'preset' && (
        <PresetStep presetId={presetId} onChange={setPresetId} dim={dim} />
      )}
      {step === 'size' && presetId === 'custom' && (
        <SizeStep dim={dim} onChange={setDim} errors={minDimErrors} />
      )}
      {step === 'location' && (
        <LocationStep
          locationText={locationText}
          onLocationText={setLocationText}
          geoPrecision={geoPrecision}
          onGeoPrecision={setGeoPrecision}
          geohash={loc.geohash}
          dim={dim}
        />
      )}
      {step === 'schedule' && (
        <ScheduleStep
          name={name}
          onName={setName}
          plannedDate={plannedDate}
          onPlannedDate={setPlannedDate}
          timezone={timezone}
          onTimezone={setTimezone}
          tzOptions={tzOptions}
          dim={dim}
        />
      )}
      {step === 'preview' && (
        <PreviewStep
          events={turnEventsPreview.map(asCalendarEvent)}
          statuses={statuses}
          dim={dim}
        />
      )}

      <div className="flex justify-between gap-2 pt-2">
        <Button variant="ghost" onClick={() => go(-1)} disabled={step === 'preset' || busy}>
          Back
        </Button>
        {step !== 'preview' ? (
          <Button
            variant="primary"
            onClick={() => go(1)}
            disabled={!canAdvanceFrom[step] || busy}
          >
            Next
          </Button>
        ) : remainingFailed > 0 ? (
          <Button
            variant="primary"
            loading={busy}
            disabled={busy}
            onClick={() => void publishRemaining()}
          >
            Publish remaining ({remainingFailed})
          </Button>
        ) : (
          <Button
            variant="primary"
            loading={busy}
            disabled={!draftPile || busy || readOnly}
            onClick={() => void publishAll()}
          >
            Create pile + publish turn schedule
          </Button>
        )}
      </div>
    </main>
  );
}

export default NewPile;
