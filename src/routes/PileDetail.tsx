/**
 * SPEC-021 — Pile detail.
 *
 * Subscribes to the addressable kind-30078 pile event and renders:
 *   - layer build checklist sized to `layersForHeight(height).max`,
 *   - 6-step turn timeline with the next-due turn highlighted,
 *   - temp/moisture log entry for the next-due turn,
 *   - photo gallery with Blossom upload,
 *   - state controls: Advance / Abandon (confirms first).
 *
 * SPEC-031 — every meaningful mutation (toggle layer, save turn record,
 * add photo, advance/abandon) round-trips back to the relay as a fresh
 * kind-30078 publish via `republishPile`. We optimistically update local
 * state, show an inline "Saving…" spinner, and roll back on failure.
 *
 * Cross-device sync rule (last-writer-wins):
 *   We track `publishedAt` — the `created_at` of the freshest kind-30078
 *   we've observed for this `(pubkey, d)` pair. Incoming events with a
 *   `created_at >= publishedAt` overwrite the working copy; older events
 *   are dropped. We use `>=` (not `>`) so a relay-echoed copy of our own
 *   just-published event is treated as a no-op (the working copy is
 *   already structurally identical to what we encoded).
 *
 * The prop is named `pileRef` (not `ref`) because React reserves the bare
 * `ref` prop for `forwardRef` — same workaround pattern as ListingDetail.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { NDKEvent, NostrEvent } from '@nostr-dev-kit/ndk';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardSubtitle, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import { LayerChecklist } from '@/components/pile/LayerChecklist';
import { TurnTimeline } from '@/components/pile/TurnTimeline';
import { PhotoThumbs } from '@/components/listing/PhotoThumbs';
import type { PhotoRef as ListingPhotoRef } from '@/lib/listings/types';

import { layersForHeight } from '@/domain/pileMath';
import { PILE_TURN_SCHEDULE_DAYS } from '@/domain/fgw';
import { getNdk } from '@/lib/ndk';
import { uploadPhoto } from '@/lib/blossom';
import { parsePile, PILE_EVENT_KIND } from '@/lib/pile/events';
import { nextState } from '@/lib/pile/state';
import { PilePublishError, republishPile } from '@/lib/pile/publish';
import type { LayerRecord, Pile, TurnRecord } from '@/lib/pile/types';
import type { AddressableRef } from '@/lib/listings/types';
import { usePublishGuard } from '@/lib/pyramid';
import { PILE_STATE_BADGES } from '@/components/pile/wizardUtils';

type SubHandle = {
  stop?: () => void;
  close?: () => void;
  on?: (evt: 'event', cb: (e: NostrEvent | NDKEvent) => void) => void;
};

interface SubscribeShape {
  subscribe: (
    filter: Record<string, unknown>,
    handlers?: { onEvent?: (e: NostrEvent | NDKEvent) => void },
  ) => SubHandle;
}

interface PileLoadState {
  pile: Pile | null;
  /** `created_at` of the freshest event we've seen, or 0 if none. */
  publishedAt: number;
  loaded: boolean;
}

function rawFrom(e: NostrEvent | NDKEvent): NostrEvent {
  return (e as NDKEvent).rawEvent
    ? ((e as NDKEvent).rawEvent() as unknown as NostrEvent)
    : (e as NostrEvent);
}

/**
 * Subscribe to kind-30078 events for `(pubkey, d)`. Last-writer-wins on
 * `created_at`: an incoming event whose `created_at >= publishedAt`
 * replaces the cached pile and bumps `publishedAt`. Stale events are
 * dropped silently.
 */
function usePileByRef(ref: AddressableRef): PileLoadState {
  const [state, setState] = useState<PileLoadState>({
    pile: null,
    publishedAt: 0,
    loaded: false,
  });

  useEffect(() => {
    setState({ pile: null, publishedAt: 0, loaded: false });
    const ndk = getNdk() as unknown as SubscribeShape;
    let active = true;
    if (typeof ndk.subscribe !== 'function') {
      setState({ pile: null, publishedAt: 0, loaded: true });
      return undefined;
    }

    const onEvent = (e: NostrEvent | NDKEvent): void => {
      if (!active) return;
      const raw = rawFrom(e);
      if (raw.kind !== PILE_EVENT_KIND) return;
      if (raw.pubkey !== ref.pubkey) return;
      const dTag = raw.tags.find((t) => t[0] === 'd');
      if (dTag?.[1] !== ref.d) return;
      const parsed = parsePile({
        kind: raw.kind,
        content: raw.content ?? '',
        tags: raw.tags ?? [],
        ...(raw.created_at !== undefined ? { created_at: raw.created_at } : {}),
        ...(raw.pubkey !== undefined ? { pubkey: raw.pubkey } : {}),
      });
      if (!parsed) return;
      const ts = raw.created_at ?? 0;
      setState((prev) => {
        // LWW: only accept events at least as fresh as what we have.
        if (prev.publishedAt && ts < prev.publishedAt) return prev;
        return { pile: parsed, publishedAt: ts, loaded: true };
      });
    };

    const sub = ndk.subscribe(
      { kinds: [PILE_EVENT_KIND], authors: [ref.pubkey], '#d': [ref.d] },
      { onEvent },
    );
    if (sub && typeof sub.on === 'function') sub.on('event', onEvent);
    const timer = setTimeout(() => {
      if (active) setState((s) => (s.pile ? s : { ...s, loaded: true }));
    }, 1500);

    return () => {
      active = false;
      clearTimeout(timer);
      if (sub && typeof sub.stop === 'function') sub.stop();
      else if (sub && typeof sub.close === 'function') sub.close();
    };
  }, [ref.kind, ref.pubkey, ref.d]);

  return state;
}

export interface PileDetailProps {
  pileRef: AddressableRef;
  onBack?: () => void;
}

export function PileDetail({ pileRef: ref, onBack }: PileDetailProps) {
  const toast = useToast();
  const { guard } = usePublishGuard();
  const { pile: loadedPile, publishedAt, loaded } = usePileByRef(ref);

  // Local working copy. Initializes from the subscribed pile and re-syncs
  // whenever a fresher kind-30078 (LWW on `publishedAt`) lands. We track
  // the last `publishedAt` we synced from so a stale or equal-time
  // re-render doesn't clobber the user's mid-edit working copy.
  const [working, setWorking] = useState<Pile | null>(null);
  const lastSyncedAtRef = useRef<number>(0);
  useEffect(() => {
    if (!loadedPile) return;
    if (publishedAt < lastSyncedAtRef.current) return;
    setWorking(loadedPile);
    lastSyncedAtRef.current = publishedAt;
  }, [loadedPile, publishedAt]);

  const [tempC, setTempC] = useState('');
  const [moisture, setMoisture] = useState('');
  const [notes, setNotes] = useState('');
  const [confirmAbandon, setConfirmAbandon] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  // Photos uploaded via Blossom carry the listing-shape `PhotoRef` (sha256
  // + dim + mime + sizeBytes). The pile schema only persists `{url, hash}`.
  // We keep both: the rich list drives the gallery, the pile-shape list is
  // what we round-trip on republish.
  const [photoUploads, setPhotoUploads] = useState<ListingPhotoRef[]>([]);

  const layerCount = useMemo(
    () => (working ? layersForHeight(working.dimensions.height).max : 0),
    [working],
  );

  const nextTurnIndex = useMemo(() => {
    if (!working) return 1;
    for (let i = 1; i <= 6; i += 1) {
      const rec = working.turnRecords.find((r) => r.index === i);
      if (!rec?.completedAt) return i;
    }
    return 6;
  }, [working]);

  /**
   * Optimistically update local state, then publish. On failure, roll
   * back via the snapshot we captured before the mutation. `guard`
   * intercepts pyramid `restricted`/`auth-required` rejections and
   * raises the not-a-member sheet (SPEC-025).
   */
  async function persist(
    next: Pile,
    rollback: Pile,
    label: string,
  ): Promise<void> {
    setSaving(true);
    try {
      const result = await guard(() =>
        republishPile(next, { previousState: rollback.state }),
      );
      // `guard` returns `null` when blocked by pyramid; the sheet shows.
      if (result === null) {
        setWorking(rollback);
      }
    } catch (err) {
      setWorking(rollback);
      if (err instanceof PilePublishError) {
        if (err.kind === 'no-signer') {
          toast.warning('Sign in required', 'Connect a key to save changes.');
        } else if (err.kind === 'invalid-state') {
          toast.danger(`Could not ${label}`, err.message);
        } else if (err.kind === 'forbidden') {
          toast.danger(`Could not ${label}`, 'Relay rejected the publish.');
        } else {
          toast.danger(`Could not ${label}`, err.message);
        }
      } else {
        toast.danger(
          `Could not ${label}`,
          err instanceof Error ? err.message : 'Try again.',
        );
      }
    } finally {
      setSaving(false);
    }
  }

  function toggleLayer(index: number): void {
    if (!working) return;
    const rollback = working;
    const idx = working.layers.findIndex((l) => l.index === index);
    const now = Math.floor(Date.now() / 1000);
    let nextWorking: Pile;
    if (idx >= 0) {
      const layer = working.layers[idx] as LayerRecord;
      const updated: LayerRecord = layer.completed
        ? { ...layer, completed: false, completedAt: undefined }
        : { ...layer, completed: true, completedAt: now };
      const layers = working.layers.slice();
      layers[idx] = updated;
      nextWorking = advanceFromLayerToggle({ ...working, layers });
    } else {
      const layer: LayerRecord = { index, completed: true, completedAt: now };
      nextWorking = advanceFromLayerToggle({
        ...working,
        layers: [...working.layers, layer].sort((a, b) => a.index - b.index),
      });
    }
    setWorking(nextWorking);
    void persist(nextWorking, rollback, 'save layer');
  }

  /**
   * If we just checked off the first layer and the pile is still in DRAFT or
   * COLLECTING, advance to BUILDING — that satisfies SPEC-021's acceptance
   * line "check off layer 1 → state advances `BUILDING`".
   */
  function advanceFromLayerToggle(p: Pile): Pile {
    const anyDone = p.layers.some((l) => l.completed);
    if (!anyDone) return p;
    if (p.state === 'DRAFT' || p.state === 'COLLECTING') {
      return { ...p, state: 'BUILDING' };
    }
    return p;
  }

  function recordTurn(): void {
    if (!working) return;
    const rollback = working;
    const t = Number(tempC);
    const m = Number(moisture);
    const rec: TurnRecord = { index: nextTurnIndex };
    if (Number.isFinite(t) && tempC.trim()) rec.temperatureC = t;
    if (Number.isFinite(m) && moisture.trim()) rec.moisture = m;
    if (notes.trim()) rec.notes = notes.trim();
    rec.completedAt = Math.floor(Date.now() / 1000);

    const others = working.turnRecords.filter((r) => r.index !== nextTurnIndex);
    const nextWorking: Pile = {
      ...working,
      turnRecords: [...others, rec].sort((a, b) => a.index - b.index),
      state: working.state === 'BUILDING' ? 'ACTIVE_TURNS' : working.state,
    };
    setWorking(nextWorking);
    setTempC('');
    setMoisture('');
    setNotes('');
    void persist(nextWorking, rollback, 'log turn');
  }

  function advanceState(): void {
    if (!working) return;
    const rollback = working;
    const next = nextState(working.state, 'advance');
    if (!next) {
      toast.warning('No further state', `Cannot advance from ${working.state}.`);
      return;
    }
    const nextWorking: Pile = { ...working, state: next };
    setWorking(nextWorking);
    void persist(nextWorking, rollback, 'advance state');
  }

  function abandonPile(): void {
    if (!working) return;
    if (!confirmAbandon) {
      setConfirmAbandon(true);
      return;
    }
    const rollback = working;
    const next = nextState(working.state, 'abandon');
    setConfirmAbandon(false);
    if (!next) return;
    const nextWorking: Pile = { ...working, state: next };
    setWorking(nextWorking);
    void persist(nextWorking, rollback, 'abandon pile');
  }

  async function handlePhotoFiles(files: FileList | null): Promise<void> {
    if (!files || files.length === 0) return;
    setPhotoBusy(true);
    try {
      for (const f of Array.from(files)) {
        try {
          const upload = await uploadPhoto(f);
          setPhotoUploads((prev) =>
            prev.some((p) => p.sha256 === upload.sha256) ? prev : [...prev, upload],
          );
          // Capture rollback BEFORE applying the optimistic update so a
          // failed republish restores the pre-add state.
          const rollback = working;
          if (!rollback) continue;
          if (rollback.photos.some((p) => p.hash === upload.sha256)) continue;
          const nextWorking: Pile = {
            ...rollback,
            photos: [...rollback.photos, { url: upload.url, hash: upload.sha256 }],
          };
          setWorking(nextWorking);
          await persist(nextWorking, rollback, 'add photo');
        } catch (err) {
          toast.danger(
            'Photo upload failed',
            err instanceof Error ? err.message : 'Try a smaller image.',
          );
        }
      }
    } finally {
      setPhotoBusy(false);
    }
  }

  function removePhoto(sha256: string): void {
    if (!working) return;
    const rollback = working;
    setPhotoUploads((prev) => prev.filter((p) => p.sha256 !== sha256));
    const nextWorking: Pile = {
      ...working,
      photos: working.photos.filter((p) => p.hash !== sha256),
    };
    setWorking(nextWorking);
    void persist(nextWorking, rollback, 'remove photo');
  }

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-16" role="status">
        <Spinner />
      </div>
    );
  }

  if (!working) {
    return (
      <Card>
        <CardTitle>Pile not found</CardTitle>
        <CardSubtitle>
          The pile event hasn&rsquo;t replayed yet, or it was deleted.
        </CardSubtitle>
        {onBack && (
          <div className="mt-3">
            <Button variant="secondary" onClick={onBack}>
              Back
            </Button>
          </div>
        )}
      </Card>
    );
  }

  const badge = PILE_STATE_BADGES[working.state];

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-screen-sm flex-col px-5 pb-12 pt-6 gap-4">
      {onBack && (
        <Button variant="ghost" size="sm" onClick={onBack} className="self-start">
          ← Back
        </Button>
      )}

      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Badge variant={badge.variant}>{badge.label}</Badge>
          <span className="font-mono text-xs text-soil-500">
            {working.dimensions.length}×{working.dimensions.width}×{working.dimensions.height} m
          </span>
          {saving && (
            <span
              className="ml-auto inline-flex items-center gap-1 text-xs text-soil-500"
              role="status"
              aria-label="Saving"
            >
              <Spinner size="sm" />
              Saving…
            </span>
          )}
        </div>
        <h1 className="font-serif text-3xl text-soil-900 leading-tight">{working.name}</h1>
        {working.locationText && (
          <p className="text-sm text-soil-600">{working.locationText}</p>
        )}
      </header>

      <Card>
        <CardTitle>Build layers</CardTitle>
        <CardSubtitle>
          {layerCount} layers expected for a {working.dimensions.height} m pile.
        </CardSubtitle>
        <div className="mt-3">
          <LayerChecklist
            layers={working.layers}
            total={layerCount}
            onToggle={toggleLayer}
          />
        </div>
      </Card>

      <Card>
        <CardTitle>Turn schedule</CardTitle>
        <CardSubtitle>
          Days {PILE_TURN_SCHEDULE_DAYS.join(', ')} from build day.
        </CardSubtitle>
        <div className="mt-3">
          <TurnTimeline pile={working} />
        </div>
      </Card>

      <Card>
        <CardTitle>Log turn {nextTurnIndex}</CardTitle>
        <CardSubtitle>Record the temperature + moisture each turn.</CardSubtitle>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Input
            label="Temperature (°C)"
            type="number"
            step={1}
            value={tempC}
            onChange={(e) => setTempC(e.target.value)}
          />
          <Input
            label="Moisture (0–1)"
            type="number"
            step={0.05}
            min={0}
            max={1}
            value={moisture}
            onChange={(e) => setMoisture(e.target.value)}
          />
        </div>
        <div className="mt-3">
          <label className="text-sm font-medium text-soil-800">Notes</label>
          <Textarea
            aria-label="Turn notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />
        </div>
        <div className="mt-3 flex justify-end">
          <Button variant="primary" onClick={recordTurn}>
            Log turn
          </Button>
        </div>
      </Card>

      <Card>
        <CardTitle>Photos</CardTitle>
        <CardSubtitle>Optional progress shots.</CardSubtitle>
        <div className="mt-3">
          <label className="inline-flex items-center gap-2 text-sm font-medium text-soil-800">
            <input
              type="file"
              accept="image/jpeg,image/png"
              multiple
              disabled={photoBusy}
              onChange={(e) => void handlePhotoFiles(e.target.files)}
              aria-label="Add photos"
            />
            {photoBusy && <Spinner size="sm" />}
          </label>
          <PhotoThumbs photos={photoUploads} onRemove={removePhoto} />
        </div>
      </Card>

      <Card>
        <CardTitle>Lifecycle</CardTitle>
        <CardSubtitle>Move the pile through its FGW states.</CardSubtitle>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="primary"
            onClick={advanceState}
            disabled={
              working.state === 'CONSUMED' || working.state === 'ABANDONED'
            }
          >
            Advance
          </Button>
          <Button
            variant={confirmAbandon ? 'destructive' : 'secondary'}
            onClick={abandonPile}
            disabled={working.state === 'ABANDONED'}
          >
            {confirmAbandon ? 'Confirm abandon' : 'Abandon'}
          </Button>
          {confirmAbandon && (
            <Button variant="ghost" onClick={() => setConfirmAbandon(false)}>
              Cancel
            </Button>
          )}
        </div>
      </Card>
    </main>
  );
}

export default PileDetail;
