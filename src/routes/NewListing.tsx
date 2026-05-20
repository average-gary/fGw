/**
 * SPEC-019 — New listing route. Builds a `Listing`, encodes via `encodeListing`
 * (NIP-99 / kind-30402), signs + publishes through the chapter-bound NDK.
 * Membership-gated; non-members see the form read-only behind a sheet.
 */
import { useEffect, useState } from 'react';
import { NDKEvent, type NDKSigner } from '@nostr-dev-kit/ndk';
import type { NostrEvent } from '@nostr-dev-kit/ndk';

import { Button } from '@/components/ui/Button';
import { Card, CardTitle, CardSubtitle } from '@/components/ui/Card';
import { Sheet } from '@/components/ui/Sheet';
import { useToast } from '@/components/ui/Toast';
import {
  ListingFormFields,
  type ListingFormFieldsState,
} from '@/components/listing/ListingFormFields';

import { useAuth, useAuthStore } from '@/lib/auth';
import { getNdk } from '@/lib/ndk';
import { useLocation } from '@/lib/location';
import { useMembershipStatus, usePublishGuard } from '@/lib/pyramid';
import { uploadPhoto } from '@/lib/blossom';
import { encodeListing } from '@/lib/listings/encode';
import type { AddressableRef, Listing } from '@/lib/listings/types';
import { parsePile, PILE_EVENT_KIND } from '@/lib/pile/events';
import { listMyPiles } from '@/lib/pile/queries';
import type { Pile } from '@/lib/pile/types';
import { scheduleNotificationsForListing } from '@/lib/notifications';
import type { MaterialKind } from '@/domain/materials';
import type { Quantity } from '@/domain/quantity';
import { cn } from '@/lib/cn';

// Pile fetching (kind-30078, authors:[me]) via NDK subscription.

interface NdkSubscriber {
  subscribe: (
    filter: Record<string, unknown>,
    handlers?: { onEvent?: (e: NostrEvent | NDKEvent) => void },
  ) => {
    stop?: () => void;
    close?: () => void;
    on?: (evt: 'event', cb: (e: NostrEvent | NDKEvent) => void) => void;
  };
}

function useMyPiles(myPubkey: string | null): Pile[] {
  const [piles, setPiles] = useState<Pile[]>([]);
  useEffect(() => {
    if (!myPubkey) return undefined;
    const ndk = getNdk() as unknown as NdkSubscriber;
    if (typeof ndk.subscribe !== 'function') return undefined;
    const seen = new Map<string, Pile>();
    const onEvent = (e: NostrEvent | NDKEvent): void => {
      const raw = (e as NDKEvent).rawEvent
        ? ((e as NDKEvent).rawEvent() as unknown as NostrEvent)
        : (e as NostrEvent);
      const pile = parsePile({
        kind: raw.kind ?? -1,
        content: raw.content ?? '',
        tags: raw.tags ?? [],
        ...(raw.created_at !== undefined ? { created_at: raw.created_at } : {}),
        ...(raw.pubkey !== undefined ? { pubkey: raw.pubkey } : {}),
      });
      if (!pile) return;
      seen.set(pile.d, pile);
      setPiles(listMyPiles(myPubkey, Array.from(seen.values())));
    };
    const sub = ndk.subscribe(
      { kinds: [PILE_EVENT_KIND], authors: [myPubkey] },
      { onEvent },
    );
    if (sub && typeof sub.on === 'function') sub.on('event', onEvent);
    return () => {
      if (sub && typeof sub.stop === 'function') sub.stop();
      else if (sub && typeof sub.close === 'function') sub.close();
    };
  }, [myPubkey]);
  return piles;
}

// Validation + listing builder.

function validate(form: ListingFormFieldsState): {
  ok: boolean;
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};
  if (!form.material) errors.material = 'Pick a material.';
  const t = form.title.trim();
  if (t.length < 3 || t.length > 80) errors.title = 'Title must be 3–80 characters.';
  const d = form.description.trim();
  if (d.length < 10 || d.length > 800)
    errors.description = 'Description must be 10–800 characters.';
  if (form.quantityValue) {
    const n = Number(form.quantityValue);
    if (!Number.isFinite(n) || n <= 0)
      errors.quantity = 'Quantity must be a positive number.';
  }
  return { ok: Object.keys(errors).length === 0, errors };
}

function buildListing(
  form: ListingFormFieldsState,
  geohash: string | undefined,
  myPubkey: string | null,
): Listing {
  const listing: Listing = {
    kind: form.kind,
    material: form.material as MaterialKind,
    title: form.title.trim(),
    description: form.description.trim(),
    photos: form.photos,
    version: 1,
  };
  if (form.quantityValue) {
    const q: Quantity = { value: Number(form.quantityValue), unit: form.quantityUnit };
    listing.quantity = q;
  }
  if (geohash) {
    listing.geohash = geohash;
    listing.geoPrecision = form.geoPrecision;
  }
  if (form.locationText.trim()) listing.locationText = form.locationText.trim();
  if (form.expiresAt) {
    const ts = Math.floor(new Date(form.expiresAt).getTime() / 1000);
    if (Number.isFinite(ts)) listing.expiresAt = ts;
  }
  if (form.pileD && myPubkey) {
    const ref: AddressableRef = { kind: PILE_EVENT_KIND, pubkey: myPubkey, d: form.pileD };
    listing.pileRef = ref;
  }
  return listing;
}

// Route.

export interface NewListingProps {
  onPublished?: (refId: string) => void;
  onCancel?: () => void;
  onRequestInvite?: () => void;
}

export function NewListing({ onPublished, onCancel, onRequestInvite }: NewListingProps = {}) {
  const auth = useAuth();
  const toast = useToast();
  const loc = useLocation();
  const { guard, blocked } = usePublishGuard();

  const [myPubkey, setMyPubkey] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const signer = auth.signer as NDKSigner | null;
    if (!signer) { setMyPubkey(null); return; }
    void signer.user().then((u) => { if (!cancelled) setMyPubkey(u.pubkey); });
    return () => { cancelled = true; };
  }, [auth.signer]);

  const membership = useMembershipStatus(myPubkey ?? '');
  const readOnly = !!myPubkey && membership !== 'allowed';
  const piles = useMyPiles(myPubkey);

  const [form, setForm] = useState<ListingFormFieldsState>({
    kind: 'need',
    material: '',
    title: '',
    description: '',
    quantityValue: '',
    quantityUnit: 'wheelbarrow',
    locationText: '',
    geoPrecision: loc.precision ?? 5,
    expiresAt: '',
    pileD: '',
    photos: [],
  });
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  const { ok: isValid, errors } = validate(form);

  function patch<K extends keyof ListingFormFieldsState>(
    k: K,
    v: ListingFormFieldsState[K],
  ): void {
    setForm((s) => ({ ...s, [k]: v }));
  }

  async function handlePhotoFiles(files: FileList | null): Promise<void> {
    if (!files || files.length === 0) return;
    setPhotoBusy(true);
    try {
      for (const f of Array.from(files)) {
        try {
          const ref = await uploadPhoto(f);
          setForm((s) =>
            s.photos.some((p) => p.sha256 === ref.sha256)
              ? s
              : { ...s, photos: [...s.photos, ref] },
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
    setForm((s) => ({ ...s, photos: s.photos.filter((p) => p.sha256 !== sha256) }));
  }

  async function submit(): Promise<void> {
    if (!isValid || busy || readOnly) return;
    const signer = useAuthStore.getState().signer;
    if (!signer) {
      toast.danger('Not signed in', 'Sign in before publishing.');
      return;
    }
    setBusy(true);
    try {
      const listing = buildListing(form, loc.geohash, myPubkey);
      const encoded = encodeListing(listing);
      const refId = `listing:${encoded.dSlug}`;

      const result = await guard(async () => {
        const ndk = getNdk();
        const ev = new NDKEvent(ndk, {
          kind: encoded.kind,
          content: encoded.content,
          tags: encoded.tags,
          created_at: encoded.created_at,
          pubkey: (await signer.user()).pubkey,
        } as unknown as NostrEvent);
        await ev.sign(signer);
        const maybe = ndk as unknown as { publish?: (e: NostrEvent) => Promise<unknown> | unknown };
        if (typeof maybe.publish === 'function') await maybe.publish(ev.rawEvent() as unknown as NostrEvent);
        else await ev.publish();
        return ev;
      });

      if (!result) return; // guard flipped `blocked = true`.

      if (listing.expiresAt !== undefined) {
        await scheduleNotificationsForListing(listing, refId);
      }

      toast.success('Listing published', listing.title);
      onPublished?.(refId);
    } catch (err) {
      toast.danger(
        'Publish failed',
        err instanceof Error ? err.message : 'Try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  function handleRequestInvite(): void {
    if (onRequestInvite) { onRequestInvite(); return; }
    // TODO(SPEC-026): navigate to /admin/request-invite when that route lands.
    // eslint-disable-next-line no-console
    console.log('[NewListing] TODO: navigate to /admin/request-invite (SPEC-026).');
  }

  const showBlockedSheet = readOnly || blocked;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-screen-sm flex-col px-5 pb-28 pt-6">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-eyebrow text-soil-500">Post a listing</p>
          <h1 className="font-serif text-3xl text-soil-900 leading-tight">New listing</h1>
        </div>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
        )}
      </header>

      <Card>
        <ListingFormFields
          form={form}
          errors={errors}
          readOnly={readOnly}
          photoBusy={photoBusy}
          hasGeohash={!!loc.geohash}
          piles={piles}
          onPatch={patch}
          onPhotoFiles={(files) => void handlePhotoFiles(files)}
          onRemovePhoto={removePhoto}
        />
      </Card>

      <div
        className={cn(
          'fixed inset-x-0 bottom-0 z-30 border-t border-soil-200 bg-bloom-50/95',
          'px-5 py-3 backdrop-blur',
          'pb-[max(env(safe-area-inset-bottom,0),0.75rem)]',
        )}
      >
        <div className="mx-auto w-full max-w-screen-sm">
          <Button
            variant="primary"
            fullWidth
            size="lg"
            loading={busy}
            disabled={!isValid || busy || readOnly || photoBusy}
            onClick={() => void submit()}
          >
            Publish listing
          </Button>
        </div>
      </div>

      <Sheet
        open={showBlockedSheet}
        onClose={() => { if (!readOnly) onCancel?.(); }}
        title="Membership required"
        description="Powder Keg WV is invite-only."
        hideCloseButton={readOnly}
        footer={
          <div className="flex gap-2">
            {!readOnly && onCancel && (
              <Button variant="ghost" fullWidth onClick={onCancel}>Close</Button>
            )}
            <Button variant="primary" fullWidth onClick={handleRequestInvite}>
              Request invite
            </Button>
          </div>
        }
      >
        <Card variant="inset">
          <CardTitle>You&rsquo;re not a member yet</CardTitle>
          <CardSubtitle>
            You&rsquo;re not a member of Powder Keg WV yet. Request an invite to start posting.
          </CardSubtitle>
        </Card>
      </Sheet>
    </main>
  );
}

export default NewListing;
