/**
 * SPEC-020 — Listing detail + claim flow.
 *
 * Wires the listing read-side (NDK subscription on `<kind>:<pubkey>:<d>`)
 * together with the claim/DM/review primitives from earlier specs:
 *   - parseListing → display
 *   - claim() → publish a kind-1 claim
 *   - subscribeClaimsFor() → render incoming claims
 *   - sendDm()/subscribeDms() → inline DM sheet per claim (subcomponent)
 *   - postReview() → +1/-1/no-show review form (subcomponent)
 *
 * Fulfillment is local-only on first ship: the author taps "Mark fulfilled"
 * and the route flips a local React state flag, which unlocks the review
 * form. We do NOT yet publish a fulfillment marker event so the claimer's
 * review form will only appear once they tap their own "Mark fulfilled"
 * (TODO(SPEC-020.next): publish a kind-1 `t:fulfilled` reply or a NIP-25
 * reaction so participants on other clients see the same state).
 */
import { useEffect, useMemo, useState } from 'react';
import type { NDKEvent, NostrEvent } from '@nostr-dev-kit/ndk';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardSubtitle, CardTitle } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import { ClaimRow } from '@/components/listing/ClaimRow';
import { DmThreadSheet } from '@/components/listing/DmThreadSheet';
import { PubkeyChip } from '@/components/listing/PubkeyChip';
import { ReviewForm } from '@/components/listing/ReviewForm';
import { useAuthStore } from '@/lib/auth';
import {
  claim,
  subscribeClaimsFor,
  type Claim,
} from '@/lib/listings/claim';
import { parseListing } from '@/lib/listings/parse';
import {
  LISTING_EVENT_KIND,
  type AddressableRef,
  type Listing,
} from '@/lib/listings/types';
import { getNdk } from '@/lib/ndk';
import { materialLabel } from '@/domain/materials';

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

export interface ListingDetailProps {
  /**
   * Pointer at the addressable listing event we're rendering. Named
   * `listingRef` (not `ref`) because React reserves the bare `ref`
   * prop name for `forwardRef`. The SPEC-020 contract called for `ref`
   * but using it directly trips React's special-prop guard and breaks
   * rendering; we keep the same shape, just spelled out.
   */
  listingRef: AddressableRef;
  onBack?: () => void;
}

function geoPrecisionLabel(precision: number): string {
  if (precision <= 3) return 'region';
  if (precision <= 5) return 'town';
  if (precision <= 7) return 'street';
  return 'precise';
}

interface ListingState {
  listing: Listing | null;
  loaded: boolean;
}

function useListingByRef(ref: AddressableRef): ListingState {
  const [state, setState] = useState<ListingState>({
    listing: null,
    loaded: false,
  });

  useEffect(() => {
    setState({ listing: null, loaded: false });
    const ndk = getNdk() as unknown as SubscribeShape;
    let active = true;
    const filter: Record<string, unknown> = {
      kinds: [ref.kind],
      authors: [ref.pubkey],
      '#d': [ref.d],
    };

    const onEvent = (e: NostrEvent | NDKEvent): void => {
      if (!active) return;
      const raw = (e as NDKEvent).rawEvent
        ? ((e as NDKEvent).rawEvent() as unknown as NostrEvent)
        : (e as NostrEvent);
      if (raw.kind !== LISTING_EVENT_KIND) return;
      if (raw.pubkey !== ref.pubkey) return;
      const dTag = raw.tags.find((t) => t[0] === 'd');
      if (dTag?.[1] !== ref.d) return;
      const parsed = parseListing({
        kind: raw.kind,
        content: raw.content,
        tags: raw.tags,
        created_at: raw.created_at,
        pubkey: raw.pubkey,
      });
      if (!parsed) return;
      setState({ listing: parsed, loaded: true });
    };

    const sub = ndk.subscribe(filter, { onEvent });
    if (typeof sub?.on === 'function') sub.on('event', onEvent);
    // Mark loaded after a short window even if nothing arrives so the UI
    // can show a not-found state instead of an indefinite spinner.
    const timer = setTimeout(() => {
      if (active) setState((s) => (s.listing ? s : { ...s, loaded: true }));
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

export function ListingDetail({ listingRef: ref, onBack }: ListingDetailProps) {
  const { listing, loaded } = useListingByRef(ref);
  const signer = useAuthStore((s) => s.signer);
  const [mePubkey, setMePubkey] = useState<string | null>(null);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [showClaimMsg, setShowClaimMsg] = useState(false);
  const [claimDraft, setClaimDraft] = useState('');
  const [claiming, setClaiming] = useState(false);
  // Local-only fulfillment flag. Persistence is intentionally out-of-scope
  // for this first cut; see header comment.
  const [fulfilled, setFulfilled] = useState(false);
  const [dmTarget, setDmTarget] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    if (!signer) {
      setMePubkey(null);
      return;
    }
    let active = true;
    void signer.user().then((u) => {
      if (active) setMePubkey(u.pubkey);
    });
    return () => {
      active = false;
    };
  }, [signer]);

  useEffect(() => {
    setClaims([]);
    const sub = subscribeClaimsFor(ref).subscribe((next) => {
      // Sort newest-first for UX (newest claim shows on top of the list).
      // The lib emits ascending; we reverse here so the freshest claim
      // lands above older ones. See report for rationale.
      setClaims([...next].sort((a, b) => b.createdAt - a.createdAt));
    });
    return sub;
  }, [ref.kind, ref.pubkey, ref.d]);

  const isAuthor = !!mePubkey && mePubkey === ref.pubkey;
  const isClaimer =
    !!mePubkey && claims.some((c) => c.authorPubkey === mePubkey);
  const isParticipant = isAuthor || isClaimer;

  const claimLabel =
    listing?.kind === 'need' ? "I'll do it" : "I'll take it";

  const handleClaim = async (): Promise<void> => {
    if (claiming) return;
    setClaiming(true);
    try {
      await claim(ref, claimDraft.trim() ? claimDraft.trim() : undefined);
      setShowClaimMsg(false);
      setClaimDraft('');
      toast.success('Claim sent');
    } catch (err) {
      toast.danger(
        'Could not claim',
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setClaiming(false);
    }
  };

  // Decide who the current user reviews. Author reviews the first
  // (oldest) claimer; a claimer reviews the listing author.
  const reviewTarget = useMemo(() => {
    if (!mePubkey) return null;
    if (isAuthor) {
      const oldest = [...claims].sort((a, b) => a.createdAt - b.createdAt)[0];
      return oldest?.authorPubkey ?? null;
    }
    if (isClaimer) return ref.pubkey;
    return null;
  }, [mePubkey, isAuthor, isClaimer, claims, ref.pubkey]);

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-16" role="status">
        <Spinner />
      </div>
    );
  }

  if (!listing) {
    return (
      <Card>
        <CardTitle>Listing not found</CardTitle>
        <CardSubtitle>
          The listing may have been removed or the relay hasn&apos;t replayed
          it yet.
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

  return (
    <div className="flex flex-col gap-4 pb-12">
      {onBack && (
        <Button variant="ghost" size="sm" onClick={onBack} className="self-start">
          ← Back
        </Button>
      )}

      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={listing.kind === 'offer' ? 'success' : 'warning'}>
            {listing.kind === 'offer' ? 'Offer' : 'Need'}
          </Badge>
          <Badge variant="muted">{materialLabel(listing.material)}</Badge>
          {fulfilled && <Badge variant="default">Fulfilled</Badge>}
        </div>
        <h1 className="font-serif text-3xl text-soil-900 leading-tight">
          {listing.title}
        </h1>
        {listing.description && (
          <p className="text-soil-700 whitespace-pre-wrap">
            {listing.description}
          </p>
        )}
      </header>

      {listing.photos.length > 0 && (
        <div
          className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-2"
          role="list"
          aria-label="Photos"
        >
          {listing.photos.map((p) => (
            <img
              key={p.sha256}
              src={p.url}
              alt=""
              role="listitem"
              className="h-32 w-44 object-cover rounded-card border border-soil-200 shrink-0"
              loading="lazy"
            />
          ))}
        </div>
      )}

      {(listing.locationText || listing.geohash) && (
        <p className="text-sm text-soil-600">
          {listing.locationText ?? listing.geohash}
          {listing.geoPrecision !== undefined && (
            <span className="ml-2 font-mono text-xs text-soil-500 uppercase tracking-wide">
              {geoPrecisionLabel(listing.geoPrecision)} (~
              {listing.geoPrecision} chars)
            </span>
          )}
        </p>
      )}

      <div className="flex items-center justify-between gap-3 border-y border-soil-100 py-3">
        <PubkeyChip pubkey={ref.pubkey} />
      </div>

      {!isAuthor && !fulfilled && mePubkey && (
        <section className="flex flex-col gap-2">
          {!showClaimMsg ? (
            <Button onClick={() => setShowClaimMsg(true)}>{claimLabel}</Button>
          ) : (
            <Card variant="inset">
              <Textarea
                aria-label="Claim message"
                placeholder="Optional message to the poster…"
                value={claimDraft}
                onChange={(e) => setClaimDraft(e.target.value)}
                rows={3}
              />
              <div className="mt-3 flex justify-end gap-2">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setShowClaimMsg(false);
                    setClaimDraft('');
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={handleClaim} loading={claiming}>
                  Send
                </Button>
              </div>
            </Card>
          )}
        </section>
      )}

      {isAuthor && (
        <section>
          {!fulfilled ? (
            <Button variant="secondary" onClick={() => setFulfilled(true)}>
              Mark fulfilled
            </Button>
          ) : (
            <p className="text-sm text-soil-600 italic">
              Marked fulfilled. The review form is now open.
            </p>
          )}
        </section>
      )}

      <section>
        <h2 className="font-serif text-xl text-soil-900 mb-2">
          Claims ({claims.length})
        </h2>
        {claims.length === 0 ? (
          <p className="text-sm text-soil-500 italic">No claims yet.</p>
        ) : (
          <Card variant="flat" bodyless>
            <div className="px-4">
              {claims.map((c) => (
                <ClaimRow
                  key={c.id || `${c.authorPubkey}-${c.createdAt}`}
                  claim={c}
                  onOpenDm={(pk) => setDmTarget(pk)}
                />
              ))}
            </div>
          </Card>
        )}
      </section>

      {fulfilled && isParticipant && reviewTarget && (
        <section>
          <ReviewForm target={reviewTarget} reference={ref} />
        </section>
      )}

      {dmTarget && mePubkey && (
        <DmThreadSheet
          open={!!dmTarget}
          onClose={() => setDmTarget(null)}
          me={mePubkey}
          other={dmTarget}
        />
      )}
    </div>
  );
}

export default ListingDetail;
