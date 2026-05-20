/**
 * SPEC-023 — Map route.
 *
 * One NDK subscription, two parsers (mirrors `Feed.tsx`): a single combined
 * `{ kinds: [30402, 31923], '#a': [chapter] }` filter funnels through
 * `parseListing` / `parseLaborEvent`. Items without a geohash are dropped —
 * the map is geo-only by definition. Geo-tagged items decode to (lat, lon)
 * and render as `<Marker>`s with a custom `divIcon` (soil-leaf for listings,
 * moss-dot for events). Default center: Powder Keg WV; user-located if
 * `useLocation().enabled`. Tiles via OpenStreetMap (no API key). Render is
 * capped at 200 markers; the overflow surfaces an "zoom in" hint.
 */
import 'leaflet/dist/leaflet.css';

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import type { NDKEvent, NostrEvent } from '@nostr-dev-kit/ndk';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardSubtitle, CardTitle } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';

import { useCurrentRelay } from '@/lib/chapter';
import { parseLaborEvent } from '@/lib/events/calendar';
import type { LaborEvent } from '@/lib/events/types';
import { decode } from '@/lib/geohash';
import { parseListing } from '@/lib/listings/parse';
import {
  CHAPTER_A_TAG_DEFAULTS,
  LISTING_EVENT_KIND,
  type AddressableRef,
  type Listing,
} from '@/lib/listings/types';
import { useLocation } from '@/lib/location';
import { materialLabel } from '@/domain/materials';
import { getNdk } from '@/lib/ndk';

const LABOR_EVENT_KIND = 31923 as const;
const RENDER_LIMIT = 200;
const EMPTY_GRACE_MS = 500;
const POWDER_KEG_CENTER: [number, number] = [39.118, -78.66];
const DEFAULT_ZOOM = 9;

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

interface PinBase {
  id: string;
  createdAt: number;
  authorPubkey: string;
  geohash: string;
  position: [number, number];
  ref: AddressableRef;
}
interface ListingPin extends PinBase {
  kind: 'listing';
  listing: Listing;
}
interface EventPin extends PinBase {
  kind: 'event';
  event: LaborEvent;
}
type MapPin = ListingPin | EventPin;

function rawOf(e: NostrEvent | NDKEvent): NostrEvent {
  return (e as NDKEvent).rawEvent
    ? ((e as NDKEvent).rawEvent() as unknown as NostrEvent)
    : (e as NostrEvent);
}

function findTag(tags: string[][] | undefined, name: string): string | undefined {
  if (!tags) return undefined;
  for (const t of tags) if (t[0] === name) return t[1];
  return undefined;
}

function toPin(raw: NostrEvent): MapPin | null {
  if (!raw.id || !raw.pubkey) return null;
  const dSlug = findTag(raw.tags, 'd');
  if (!dSlug) return null;
  if (raw.kind === LISTING_EVENT_KIND) {
    const listing = parseListing({
      kind: raw.kind,
      content: raw.content,
      tags: raw.tags,
      created_at: raw.created_at,
      pubkey: raw.pubkey,
    });
    if (!listing || !listing.geohash) return null;
    const { lat, lon } = decode(listing.geohash);
    return {
      kind: 'listing',
      id: raw.id,
      createdAt: raw.created_at,
      authorPubkey: raw.pubkey,
      geohash: listing.geohash,
      position: [lat, lon],
      listing,
      ref: { kind: LISTING_EVENT_KIND, pubkey: raw.pubkey, d: dSlug },
    };
  }
  if (raw.kind === LABOR_EVENT_KIND) {
    const ev = parseLaborEvent({
      kind: raw.kind,
      content: raw.content,
      tags: raw.tags,
      created_at: raw.created_at,
    });
    if (!ev || !ev.geohash) return null;
    const { lat, lon } = decode(ev.geohash);
    return {
      kind: 'event',
      id: raw.id,
      createdAt: raw.created_at,
      authorPubkey: raw.pubkey,
      geohash: ev.geohash,
      position: [lat, lon],
      event: ev,
      ref: { kind: LABOR_EVENT_KIND, pubkey: raw.pubkey, d: dSlug },
    };
  }
  return null;
}

// divIcon factories — inline SVG, no network fetches. Tailwind doesn't
// reach inside divIcon HTML, so colors are hard-coded soil/moss tokens.
const LISTING_SVG =
  '<span style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:9999px;background:#8b5e34;color:#fefaf3;box-shadow:0 1px 2px rgba(0,0,0,0.25);border:2px solid #fefaf3"><svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M3 13c0-4 3-8 10-10-1 6-4 10-8 10H3zm0 0l4-4"/></svg></span>';
const EVENT_SVG =
  '<span style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:9999px;background:#3f6f3a;color:#fefaf3;box-shadow:0 1px 2px rgba(0,0,0,0.25);border:2px solid #fefaf3"><svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true"><rect x="2" y="3" width="12" height="11" rx="1.5"/><rect x="4" y="1" width="2" height="3" fill="#fefaf3"/><rect x="10" y="1" width="2" height="3" fill="#fefaf3"/></svg></span>';

const makeListingIcon = (): L.DivIcon =>
  L.divIcon({
    className: 'fGw-map-pin fGw-map-pin--listing',
    html: LISTING_SVG,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  });
const makeEventIcon = (): L.DivIcon =>
  L.divIcon({
    className: 'fGw-map-pin fGw-map-pin--event',
    html: EVENT_SVG,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
  });

function useMapSubscription(): { pins: MapPin[]; receivedAny: boolean } {
  const [pins, setPins] = useState<MapPin[]>([]);
  const [receivedAny, setReceivedAny] = useState(false);
  const relay = useCurrentRelay();

  useEffect(() => {
    setPins([]);
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
      const pin = toPin(rawOf(e));
      if (!pin || seen.has(pin.id)) return;
      seen.add(pin.id);
      setPins((prev) => [...prev, pin]);
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

  return { pins, receivedAny };
}

export interface MapRouteProps {
  onOpenListing?: (listingRef: AddressableRef) => void;
  onOpenEvent?: (eventRef: AddressableRef) => void;
}

export function Map({ onOpenListing, onOpenEvent }: MapRouteProps = {}): ReactNode {
  const { pins, receivedAny } = useMapSubscription();
  const location = useLocation();
  const [graceElapsed, setGraceElapsed] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setGraceElapsed(true), EMPTY_GRACE_MS);
    return () => clearTimeout(t);
  }, []);

  const center: [number, number] =
    location.enabled && location.lat !== undefined && location.lon !== undefined
      ? [location.lat, location.lon]
      : POWDER_KEG_CENTER;

  const renderedPins = useMemo<MapPin[]>(
    () => pins.slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, RENDER_LIMIT),
    [pins],
  );
  const listingIcon = useMemo(() => makeListingIcon(), []);
  const eventIcon = useMemo(() => makeEventIcon(), []);

  const showSpinner = !receivedAny && !graceElapsed;
  const showEmpty = receivedAny ? renderedPins.length === 0 : graceElapsed;
  const overflow = pins.length > RENDER_LIMIT ? pins.length : 0;

  return (
    <main
      className="mx-auto flex min-h-dvh w-full max-w-screen-md flex-col gap-3 px-4 py-4"
      aria-label="Map"
    >
      <header className="flex items-center justify-between">
        <h1 className="font-serif text-xl text-soil-900">Map</h1>
        {overflow > 0 && (
          <span
            className="text-xs font-mono uppercase tracking-wide text-soil-500"
            role="status"
          >
            showing {RENDER_LIMIT} of {overflow} — zoom in
          </span>
        )}
      </header>

      <Card bodyless className="overflow-hidden">
        <div className="relative h-[70dvh] w-full">
          <MapContainer
            center={center}
            zoom={DEFAULT_ZOOM}
            scrollWheelZoom
            className="h-full w-full"
            aria-label="Listings and events map"
          >
            <TileLayer
              attribution="&copy; OpenStreetMap"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {renderedPins.map((pin) => (
              <Marker
                key={pin.id}
                position={pin.position}
                icon={pin.kind === 'listing' ? listingIcon : eventIcon}
              >
                <Popup>
                  <PinPopup
                    pin={pin}
                    onOpenListing={onOpenListing}
                    onOpenEvent={onOpenEvent}
                  />
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      </Card>

      {showSpinner && (
        <div className="flex items-center justify-center py-4" role="status">
          <Spinner />
        </div>
      )}

      {showEmpty && (
        <Card>
          <CardTitle>Nothing here yet</CardTitle>
          <CardSubtitle>
            {receivedAny
              ? 'No listings or events with a location were posted to this chapter.'
              : 'Listening on the chapter relay…'}
          </CardSubtitle>
        </Card>
      )}
    </main>
  );
}

function PinPopup({
  pin,
  onOpenListing,
  onOpenEvent,
}: {
  pin: MapPin;
  onOpenListing?: (ref: AddressableRef) => void;
  onOpenEvent?: (ref: AddressableRef) => void;
}): ReactNode {
  const title =
    pin.kind === 'listing' ? pin.listing.title : pin.event.title;
  const onOpen = () =>
    pin.kind === 'listing' ? onOpenListing?.(pin.ref) : onOpenEvent?.(pin.ref);
  return (
    <div className="flex min-w-[180px] flex-col gap-2">
      <div className="font-serif text-base text-soil-900 leading-tight">{title}</div>
      <div className="flex flex-wrap items-center gap-1.5">
        {pin.kind === 'listing' ? (
          <>
            <Badge variant={pin.listing.kind === 'offer' ? 'success' : 'warning'}>
              {pin.listing.kind === 'offer' ? 'Offer' : 'Need'}
            </Badge>
            <Badge variant="muted">{materialLabel(pin.listing.material)}</Badge>
          </>
        ) : (
          <Badge variant="default">{pin.event.kind.replace(/-/g, ' ')}</Badge>
        )}
      </div>
      <Button size="sm" onClick={onOpen}>
        Open
      </Button>
    </div>
  );
}

export default Map;
