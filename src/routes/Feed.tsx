/**
 * SPEC-018 — Feed.
 *
 * One subscription, two parsers. We open a single NDK subscription on the
 * chapter `#a`-tag, asking the relay for both NIP-99 listings (kind 30402)
 * and NIP-52 labor calendar events (kind 31923). Each incoming event is
 * funnelled through `parseListing` / `parseLaborEvent`; whichever parser
 * accepts it determines the rendered card. Anything that fails both is
 * silently dropped — feed reads stay tolerant of unknown shapes.
 *
 * The filter pipeline is a `useMemo` over the raw FeedItem array:
 *   - `kind` chip (`all|need|offer|event`) trims by kind first;
 *   - `material` Select trims to a specific MaterialKind. Setting a
 *     material implicitly hides labor events (events have no material),
 *     which is the documented design choice; the Select is *disabled*
 *     when kind === 'event' so users can't enter that contradictory state;
 *   - `radius` trims by haversine distance from the user's geohash. The
 *     Select is disabled when no location is set.
 *
 * Render: up to 50 cards (newest first by `created_at`). Each card
 * carries title, summary (140-char trim), kind badge, material badge
 * (listings only), `<PubkeyChip>`, `<ReputationBadge>`, locationText with
 * a precision label, and distance from user (when location is set).
 *
 * Loading vs empty: while we have no events AND <500 ms have passed since
 * mount, render a `<Spinner/>`. After the grace window, an empty feed
 * shows a friendly message instead of an indefinite spinner.
 */
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { NDKEvent, NostrEvent } from '@nostr-dev-kit/ndk';
import { Badge } from '@/components/ui/Badge';
import { Card, CardSubtitle, CardTitle } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { PubkeyChip } from '@/components/feed/PubkeyChip';
import { ReputationBadge } from '@/components/feed/ReputationBadge';
import {
  MATERIAL_KINDS,
  materialCategory,
  materialLabel,
  type MaterialKind,
} from '@/domain/materials';
import { useCurrentRelay } from '@/lib/chapter';
import { parseLaborEvent } from '@/lib/events/calendar';
import type { LaborEvent } from '@/lib/events/types';
import { distanceMiles, prefixesForRadiusMiles } from '@/lib/geohash';
import { parseListing } from '@/lib/listings/parse';
import {
  CHAPTER_A_TAG_DEFAULTS,
  LISTING_EVENT_KIND,
  type Listing,
} from '@/lib/listings/types';
import { useLocation } from '@/lib/location';
import { getNdk } from '@/lib/ndk';

const LABOR_EVENT_KIND = 31923 as const;
const RENDER_LIMIT = 50;
const SUMMARY_MAX = 140;
const EMPTY_GRACE_MS = 500;

type KindFilter = 'all' | 'need' | 'offer' | 'event';
type RadiusFilter = '5' | '15' | '50' | 'unlimited';

interface FeedItem {
  id: string;
  createdAt: number;
  kind: 'need' | 'offer' | 'event';
  authorPubkey: string;
  geohash?: string;
  locationText?: string;
  geoPrecision?: number;
  listing?: Listing;
  event?: LaborEvent;
}

interface SubHandle {
  stop?: () => void;
  close?: () => void;
  on?: (evt: 'event', cb: (e: NostrEvent | NDKEvent) => void) => void;
}

interface SubscribeShape {
  subscribe: (
    filter: Record<string, unknown>,
    handlers?: { onEvent?: (e: NostrEvent | NDKEvent) => void },
  ) => SubHandle;
}

function geoPrecisionLabel(p: number): string {
  if (p <= 3) return 'region';
  if (p <= 5) return 'town';
  if (p <= 7) return 'street';
  return 'precise';
}

function trimSummary(s: string): string {
  const flat = s.replace(/\s+/g, ' ').trim();
  return flat.length > SUMMARY_MAX ? flat.slice(0, SUMMARY_MAX - 1) + '…' : flat;
}

function rawOf(e: NostrEvent | NDKEvent): NostrEvent {
  return (e as NDKEvent).rawEvent
    ? ((e as NDKEvent).rawEvent() as unknown as NostrEvent)
    : (e as NostrEvent);
}

function toFeedItem(raw: NostrEvent): FeedItem | null {
  if (!raw.id || !raw.pubkey) return null;
  if (raw.kind === LISTING_EVENT_KIND) {
    const listing = parseListing({
      kind: raw.kind,
      content: raw.content,
      tags: raw.tags,
      created_at: raw.created_at,
      pubkey: raw.pubkey,
    });
    if (!listing) return null;
    const item: FeedItem = {
      id: raw.id,
      createdAt: raw.created_at,
      kind: listing.kind,
      authorPubkey: raw.pubkey,
      listing,
    };
    if (listing.geohash) item.geohash = listing.geohash;
    if (listing.locationText) item.locationText = listing.locationText;
    if (listing.geoPrecision !== undefined) item.geoPrecision = listing.geoPrecision;
    return item;
  }
  if (raw.kind === LABOR_EVENT_KIND) {
    const ev = parseLaborEvent({
      kind: raw.kind,
      content: raw.content,
      tags: raw.tags,
      created_at: raw.created_at,
    });
    if (!ev) return null;
    const item: FeedItem = {
      id: raw.id,
      createdAt: raw.created_at,
      kind: 'event',
      authorPubkey: raw.pubkey,
      event: ev,
    };
    if (ev.geohash) item.geohash = ev.geohash;
    if (ev.locationText) item.locationText = ev.locationText;
    if (ev.geoPrecision !== undefined) item.geoPrecision = ev.geoPrecision;
    return item;
  }
  return null;
}

const KIND_CHIPS: { value: KindFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'need', label: 'Needs' },
  { value: 'offer', label: 'Offers' },
  { value: 'event', label: 'Events' },
];

const RADIUS_OPTIONS: { value: RadiusFilter; label: string }[] = [
  { value: '5', label: 'Within 5 mi' },
  { value: '15', label: 'Within 15 mi' },
  { value: '50', label: 'Within 50 mi' },
  { value: 'unlimited', label: 'Any distance' },
];

function radiusToMiles(r: RadiusFilter): number | null {
  if (r === 'unlimited') return null;
  return Number(r);
}

function useFeedSubscription(): { items: FeedItem[]; receivedAny: boolean } {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [receivedAny, setReceivedAny] = useState(false);
  // Re-open the subscription whenever the chapter relay changes.
  const relay = useCurrentRelay();

  useEffect(() => {
    setItems([]);
    setReceivedAny(false);
    const ndk = getNdk() as unknown as SubscribeShape;
    if (typeof ndk?.subscribe !== 'function') return;
    let active = true;
    const seen = new Set<string>();
    const filter = {
      kinds: [LISTING_EVENT_KIND, LABOR_EVENT_KIND],
      '#a': [`34550:${CHAPTER_A_TAG_DEFAULTS.pubkey}:${CHAPTER_A_TAG_DEFAULTS.d}`],
      limit: 200,
    };
    const onEvent = (e: NostrEvent | NDKEvent): void => {
      if (!active) return;
      const raw = rawOf(e);
      const item = toFeedItem(raw);
      if (!item) return;
      if (seen.has(item.id)) return;
      seen.add(item.id);
      setItems((prev) => [...prev, item]);
      setReceivedAny(true);
    };
    const sub = ndk.subscribe(filter, { onEvent });
    if (typeof sub?.on === 'function') sub.on('event', onEvent);
    return () => {
      active = false;
      if (sub && typeof sub.stop === 'function') sub.stop();
      else if (sub && typeof sub.close === 'function') sub.close();
    };
  }, [relay]);

  return { items, receivedAny };
}

function ListingCard({
  item,
  distance,
}: {
  item: FeedItem;
  distance: number | null;
}): ReactNode {
  const listing = item.listing!;
  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <PubkeyChip pubkey={item.authorPubkey} />
          <ReputationBadge pubkey={item.authorPubkey} />
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Badge variant={listing.kind === 'offer' ? 'success' : 'warning'}>
            {listing.kind === 'offer' ? 'Offer' : 'Need'}
          </Badge>
          <Badge variant="muted">{materialLabel(listing.material)}</Badge>
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-1">
        <CardTitle className="text-lg">{listing.title}</CardTitle>
        {listing.description && (
          <p className="text-sm text-soil-700">{trimSummary(listing.description)}</p>
        )}
      </div>
      <LocationLine
        locationText={item.locationText}
        precision={item.geoPrecision}
        distance={distance}
      />
    </Card>
  );
}

function EventCard({
  item,
  distance,
}: {
  item: FeedItem;
  distance: number | null;
}): ReactNode {
  const ev = item.event!;
  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <PubkeyChip pubkey={item.authorPubkey} />
          <ReputationBadge pubkey={item.authorPubkey} />
        </div>
        <Badge variant="default" className="shrink-0">
          {ev.kind.replace(/-/g, ' ')}
        </Badge>
      </div>
      <div className="mt-3 flex flex-col gap-1">
        <CardTitle className="text-lg">{ev.title}</CardTitle>
        {ev.description && (
          <p className="text-sm text-soil-700">{trimSummary(ev.description)}</p>
        )}
      </div>
      <LocationLine
        locationText={item.locationText}
        precision={item.geoPrecision}
        distance={distance}
      />
    </Card>
  );
}

function LocationLine({
  locationText,
  precision,
  distance,
}: {
  locationText: string | undefined;
  precision: number | undefined;
  distance: number | null;
}): ReactNode {
  if (!locationText && precision === undefined && distance === null) return null;
  return (
    <p className="mt-2 text-xs text-soil-500 flex items-center gap-2 flex-wrap">
      {locationText && <span>{locationText}</span>}
      {precision !== undefined && (
        <span className="font-mono uppercase tracking-wide">
          {geoPrecisionLabel(precision)}
        </span>
      )}
      {distance !== null && (
        <span className="font-mono">{distance.toFixed(1)} mi</span>
      )}
    </p>
  );
}

export function Feed(): ReactNode {
  const { items, receivedAny } = useFeedSubscription();
  const location = useLocation();
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [materialFilter, setMaterialFilter] = useState<MaterialKind | 'all'>('all');
  const [radiusFilter, setRadiusFilter] = useState<RadiusFilter>('unlimited');
  const [graceElapsed, setGraceElapsed] = useState(false);

  // Empty-state grace window: don't show "nothing yet" until 500 ms after
  // mount, so a fresh subscription gets a chance to deliver its replay.
  useEffect(() => {
    const t = setTimeout(() => setGraceElapsed(true), EMPTY_GRACE_MS);
    return () => clearTimeout(t);
  }, []);

  // Geohash prefix set — used to do a cheap bbox prefilter before the
  // exact haversine distance check.
  const radiusMiles = radiusToMiles(radiusFilter);
  const radiusPrefixes = useMemo<string[] | null>(() => {
    if (
      !location.enabled ||
      location.lat === undefined ||
      location.lon === undefined ||
      radiusMiles === null
    ) {
      return null;
    }
    return prefixesForRadiusMiles(location.lat, location.lon, radiusMiles);
  }, [location.enabled, location.lat, location.lon, radiusMiles]);

  const filtered = useMemo<FeedItem[]>(() => {
    const out: FeedItem[] = [];
    for (const it of items) {
      if (kindFilter !== 'all' && it.kind !== kindFilter) continue;
      if (materialFilter !== 'all') {
        // Material filter excludes events (they have no material).
        if (!it.listing) continue;
        if (it.listing.material !== materialFilter) continue;
      }
      if (radiusPrefixes && location.geohash) {
        if (!it.geohash) continue;
        if (!radiusPrefixes.some((p) => it.geohash!.startsWith(p))) continue;
        const dist = distanceMiles(location.geohash, it.geohash);
        if (radiusMiles !== null && dist > radiusMiles) continue;
      }
      out.push(it);
    }
    out.sort((a, b) => b.createdAt - a.createdAt);
    return out.slice(0, RENDER_LIMIT);
  }, [items, kindFilter, materialFilter, radiusPrefixes, radiusMiles, location.geohash]);

  const distanceFor = (it: FeedItem): number | null => {
    if (!location.geohash || !it.geohash) return null;
    return distanceMiles(location.geohash, it.geohash);
  };

  const showSpinner = !receivedAny && !graceElapsed;
  const showEmpty = receivedAny ? filtered.length === 0 : graceElapsed;
  const materialDisabled = kindFilter === 'event';
  const radiusDisabled = !location.enabled;

  return (
    <main
      className="mx-auto flex min-h-dvh w-full max-w-screen-sm flex-col"
      aria-label="Feed"
    >
      <header
        className="sticky top-0 z-10 flex flex-col gap-2 border-b border-soil-100 bg-bloom-50/95 px-4 py-3 backdrop-blur"
        role="region"
        aria-label="Feed filters"
      >
        <div role="radiogroup" aria-label="Kind" className="flex flex-wrap gap-1.5">
          {KIND_CHIPS.map((c) => {
            const selected = kindFilter === c.value;
            return (
              <button
                key={c.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setKindFilter(c.value)}
                className={
                  'rounded-pill border px-3 py-1.5 text-xs font-mono uppercase tracking-wide transition-colors ' +
                  (selected
                    ? 'border-moss-600 bg-moss-100 text-moss-800'
                    : 'border-soil-200 bg-bloom-50 text-soil-700 hover:bg-soil-100')
                }
              >
                {c.label}
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Select
            aria-label="Material"
            value={materialFilter}
            disabled={materialDisabled}
            onChange={(e) =>
              setMaterialFilter(e.target.value as MaterialKind | 'all')
            }
          >
            <option value="all">All materials</option>
            {MATERIAL_KINDS.filter(
              (m) => materialCategory(m) === 'compost-input',
            ).map((m) => (
              <option key={m} value={m}>
                {materialLabel(m)}
              </option>
            ))}
            {MATERIAL_KINDS.filter(
              (m) => materialCategory(m) !== 'compost-input',
            ).map((m) => (
              <option key={m} value={m}>
                {materialLabel(m)}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Radius"
            value={radiusFilter}
            disabled={radiusDisabled}
            onChange={(e) => setRadiusFilter(e.target.value as RadiusFilter)}
            options={RADIUS_OPTIONS}
          />
        </div>
      </header>

      <section className="flex flex-col gap-3 px-4 py-4">
        {showSpinner && (
          <div className="flex items-center justify-center py-12" role="status">
            <Spinner />
          </div>
        )}

        {showEmpty && (
          <Card>
            <CardTitle>Nothing here yet</CardTitle>
            <CardSubtitle>
              {receivedAny
                ? 'No items match these filters. Try widening them.'
                : 'Listening on the chapter relay…'}
            </CardSubtitle>
          </Card>
        )}

        {filtered.map((it) =>
          it.listing ? (
            <ListingCard key={it.id} item={it} distance={distanceFor(it)} />
          ) : (
            <EventCard key={it.id} item={it} distance={distanceFor(it)} />
          ),
        )}
      </section>
    </main>
  );
}

export default Feed;
