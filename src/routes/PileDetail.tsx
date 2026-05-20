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
 * Layer/turn-record/photo edits are kept in local React state for now;
 * SPEC-021.next will round-trip them back as a fresh kind-30078 publish.
 *
 * The prop is named `pileRef` (not `ref`) because React reserves the bare
 * `ref` prop for `forwardRef` — same workaround pattern as ListingDetail.
 */
import { useEffect, useMemo, useState } from 'react';
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
import type { LayerRecord, Pile, TurnRecord } from '@/lib/pile/types';
import type { AddressableRef } from '@/lib/listings/types';
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
  loaded: boolean;
}

function rawFrom(e: NostrEvent | NDKEvent): NostrEvent {
  return (e as NDKEvent).rawEvent
    ? ((e as NDKEvent).rawEvent() as unknown as NostrEvent)
    : (e as NostrEvent);
}

function usePileByRef(ref: AddressableRef): PileLoadState {
  const [state, setState] = useState<PileLoadState>({ pile: null, loaded: false });

  useEffect(() => {
    setState({ pile: null, loaded: false });
    const ndk = getNdk() as unknown as SubscribeShape;
    let active = true;
    if (typeof ndk.subscribe !== 'function') {
      setState({ pile: null, loaded: true });
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
      setState({ pile: parsed, loaded: true });
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
  const { pile: loadedPile, loaded } = usePileByRef(ref);

  // Local working copy — edits are kept here until SPEC-021.next.
  const [working, setWorking] = useState<Pile | null>(null);
  useEffect(() => {
    if (loadedPile) setWorking(loadedPile);
  }, [loadedPile]);

  const [tempC, setTempC] = useState('');
  const [moisture, setMoisture] = useState('');
  const [notes, setNotes] = useState('');
  const [confirmAbandon, setConfirmAbandon] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  // Photos uploaded via Blossom carry the listing-shape `PhotoRef` (sha256
  // + dim + mime + sizeBytes). The pile schema only persists `{url, hash}`.
  // We keep both: the rich list drives the gallery, the pile-shape list is
  // what we'll round-trip when persistence lands (SPEC-021.next).
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

  function toggleLayer(index: number): void {
    setWorking((prev) => {
      if (!prev) return prev;
      const idx = prev.layers.findIndex((l) => l.index === index);
      const now = Math.floor(Date.now() / 1000);
      if (idx >= 0) {
        const layer = prev.layers[idx] as LayerRecord;
        const updated: LayerRecord = layer.completed
          ? { ...layer, completed: false, completedAt: undefined }
          : { ...layer, completed: true, completedAt: now };
        const layers = prev.layers.slice();
        layers[idx] = updated;
        return advanceFromLayerToggle({ ...prev, layers });
      }
      const layer: LayerRecord = { index, completed: true, completedAt: now };
      return advanceFromLayerToggle({
        ...prev,
        layers: [...prev.layers, layer].sort((a, b) => a.index - b.index),
      });
    });
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
    const t = Number(tempC);
    const m = Number(moisture);
    const rec: TurnRecord = { index: nextTurnIndex };
    if (Number.isFinite(t) && tempC.trim()) rec.temperatureC = t;
    if (Number.isFinite(m) && moisture.trim()) rec.moisture = m;
    if (notes.trim()) rec.notes = notes.trim();
    rec.completedAt = Math.floor(Date.now() / 1000);

    setWorking((prev) => {
      if (!prev) return prev;
      const others = prev.turnRecords.filter((r) => r.index !== nextTurnIndex);
      return {
        ...prev,
        turnRecords: [...others, rec].sort((a, b) => a.index - b.index),
        state: prev.state === 'BUILDING' ? 'ACTIVE_TURNS' : prev.state,
      };
    });
    setTempC('');
    setMoisture('');
    setNotes('');
  }

  function advanceState(): void {
    setWorking((prev) => {
      if (!prev) return prev;
      const next = nextState(prev.state, 'advance');
      if (!next) {
        toast.warning('No further state', `Cannot advance from ${prev.state}.`);
        return prev;
      }
      return { ...prev, state: next };
    });
  }

  function abandonPile(): void {
    if (!confirmAbandon) {
      setConfirmAbandon(true);
      return;
    }
    setWorking((prev) => {
      if (!prev) return prev;
      const next = nextState(prev.state, 'abandon');
      if (!next) return prev;
      return { ...prev, state: next };
    });
    setConfirmAbandon(false);
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
          setWorking((prev) =>
            prev
              ? {
                  ...prev,
                  photos: [...prev.photos, { url: upload.url, hash: upload.sha256 }],
                }
              : prev,
          );
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
    setPhotoUploads((prev) => prev.filter((p) => p.sha256 !== sha256));
    setWorking((prev) =>
      prev ? { ...prev, photos: prev.photos.filter((p) => p.hash !== sha256) } : prev,
    );
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
