/**
 * SPEC-022 — Chapter labor calendar.
 *
 * Lists kind-31923 labor events tagged for the current chapter community
 * over the next 30 days. Filters by labor kind + "only RSVPed". Each card
 * exposes a 3-button RSVP control (Going / Maybe / No) that publishes a
 * kind-31925 RSVP via `encodeRsvp` and aggregates per-event response counts
 * from a single combined NDK subscription.
 */
import { useEffect, useMemo, useState } from 'react';
import { NDKEvent, type NDKSigner } from '@nostr-dev-kit/ndk';
import type { NostrEvent } from '@nostr-dev-kit/ndk';

import { Button } from '@/components/ui/Button';
import { Card, CardSubtitle, CardTitle } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';
import {
  EventCard,
  type RsvpAggregate,
} from '@/components/calendar/EventCard';

import { useAuthStore } from '@/lib/auth';
import { getNdk } from '@/lib/ndk';
import { parseLaborEvent } from '@/lib/events/calendar';
import { encodeRsvp } from '@/lib/events/rsvp';
import type { LaborEvent, LaborEventKind, RsvpStatus } from '@/lib/events/types';
import { CHAPTER_A_TAG_DEFAULTS, type AddressableRef } from '@/lib/listings/types';
import { scheduleNotificationsForRsvp } from '@/lib/notifications';
import { usePublishGuard } from '@/lib/pyramid';
import { cn } from '@/lib/cn';

const LABOR_EVENT_KIND = 31923;
const RSVP_KIND = 31925;
const THIRTY_DAYS_SECS = 30 * 24 * 60 * 60;

export type KindFilter = 'all' | LaborEventKind;

const KIND_FILTERS: Array<{ value: KindFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'pile-build', label: 'Pile build' },
  { value: 'pile-turn', label: 'Pile turn' },
  { value: 'mulch-drive', label: 'Mulch drive' },
  { value: 'planting-day', label: 'Planting day' },
  { value: 'harvest-day', label: 'Harvest day' },
  { value: 'other', label: 'Other' },
];

interface NdkSubscriber {
  subscribe: (
    filter: Record<string, unknown>,
    handlers?: { onEvent?: (e: NostrEvent | NDKEvent) => void },
  ) => {
    stop?: () => void;
    close?: () => void;
    on?: (evt: 'event', cb: (e: NostrEvent | NDKEvent) => void) => void;
  };
  publish?: (e: NostrEvent) => Promise<unknown> | unknown;
}

/** A LaborEvent enriched with the source identifiers we need for RSVPs. */
interface EnrichedLaborEvent {
  ev: LaborEvent;
  /** Author of the labor event (kind-31923 `pubkey`). */
  authorPubkey: string;
  /** `d` tag of the labor event. */
  dSlug: string;
  /** `31923:<author>:<d>` — the a-tag target other parties use to RSVP. */
  aTagTarget: string;
}

function rawFrom(e: NostrEvent | NDKEvent): NostrEvent {
  return (e as NDKEvent).rawEvent
    ? ((e as NDKEvent).rawEvent() as unknown as NostrEvent)
    : (e as NostrEvent);
}

function findTag(tags: string[][] | undefined, name: string): string | undefined {
  if (!tags) return undefined;
  for (const t of tags) if (t[0] === name) return t[1];
  return undefined;
}

export interface CalendarProps {
  onBack?: () => void;
  /** Override the chapter-community a-tag target (pubkey + d). */
  chapter?: { pubkey: string; d: string };
}

export function Calendar({ onBack, chapter }: CalendarProps = {}) {
  const toast = useToast();
  const signer = useAuthStore((s) => s.signer) as NDKSigner | null;
  const { guard } = usePublishGuard();

  const chapterRef = chapter ?? CHAPTER_A_TAG_DEFAULTS;
  const chapterATag = `34550:${chapterRef.pubkey}:${chapterRef.d}`;

  const [events, setEvents] = useState<EnrichedLaborEvent[]>([]);
  const [aggByA, setAggByA] = useState<Record<string, RsvpAggregate>>({});
  // Optimistic per-event pending status so UI flips instantly on tap.
  const [pending, setPending] = useState<Record<string, RsvpStatus>>({});
  const [busyByA, setBusyByA] = useState<Record<string, boolean>>({});
  const [filterKind, setFilterKind] = useState<KindFilter>('all');
  const [onlyRsvped, setOnlyRsvped] = useState(false);

  const [myPubkey, setMyPubkey] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
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
  }, [signer]);

  // Subscribe to kind-31923 events for the current chapter community.
  useEffect(() => {
    const ndk = getNdk() as unknown as NdkSubscriber;
    if (typeof ndk.subscribe !== 'function') return undefined;

    const onEvent = (e: NostrEvent | NDKEvent): void => {
      const raw = rawFrom(e);
      const parsed = parseLaborEvent({
        kind: raw.kind ?? -1,
        content: raw.content ?? '',
        tags: raw.tags ?? [],
        created_at: raw.created_at ?? 0,
      });
      if (!parsed) return;
      const dSlug = findTag(raw.tags, 'd');
      const author = raw.pubkey;
      if (!dSlug || !author) return;
      const aTagTarget = `${LABOR_EVENT_KIND}:${author}:${dSlug}`;
      setEvents((prev) => {
        const idx = prev.findIndex((x) => x.aTagTarget === aTagTarget);
        const next: EnrichedLaborEvent = { ev: parsed, authorPubkey: author, dSlug, aTagTarget };
        if (idx >= 0) {
          const arr = prev.slice();
          arr[idx] = next;
          return arr;
        }
        return [...prev, next];
      });
    };

    const sub = ndk.subscribe(
      { kinds: [LABOR_EVENT_KIND], '#a': [chapterATag], limit: 200 },
      { onEvent },
    );
    if (sub && typeof sub.on === 'function') sub.on('event', onEvent);
    return () => {
      if (sub && typeof sub.stop === 'function') sub.stop();
      else if (sub && typeof sub.close === 'function') sub.close();
    };
  }, [chapterATag]);

  // Filter to next 30 days and sort by start asc.
  const upcoming = useMemo<EnrichedLaborEvent[]>(() => {
    const now = Math.floor(Date.now() / 1000);
    const horizon = now + THIRTY_DAYS_SECS;
    return events
      .filter((x) => x.ev.start >= now && x.ev.start <= horizon)
      .sort((a, b) => a.ev.start - b.ev.start);
  }, [events]);

  // Single combined RSVP subscription keyed on every a-tag in view.
  const aTagsInView = useMemo(
    () => upcoming.map((x) => x.aTagTarget).sort(),
    [upcoming],
  );
  const aTagsKey = aTagsInView.join('|');

  useEffect(() => {
    if (aTagsInView.length === 0) {
      setAggByA({});
      return undefined;
    }
    const ndk = getNdk() as unknown as NdkSubscriber;
    if (typeof ndk.subscribe !== 'function') return undefined;

    // Track latest RSVP per (a-tag, author) so re-RSVPs replace rather than
    // double-count. Replays on subscribe land here too.
    const latest = new Map<string, Map<string, { status: RsvpStatus; createdAt: number }>>();

    const recompute = (): void => {
      const out: Record<string, RsvpAggregate> = {};
      for (const [aTag, byAuthor] of latest.entries()) {
        let going = 0;
        let maybe = 0;
        let declined = 0;
        let mine: RsvpStatus | undefined;
        for (const [author, rec] of byAuthor.entries()) {
          if (rec.status === 'accepted') going += 1;
          else if (rec.status === 'tentative') maybe += 1;
          else if (rec.status === 'declined') declined += 1;
          if (myPubkey && author === myPubkey) mine = rec.status;
        }
        const agg: RsvpAggregate = { going, maybe, declined };
        if (mine !== undefined) agg.myStatus = mine;
        out[aTag] = agg;
      }
      setAggByA(out);
    };

    const onEvent = (e: NostrEvent | NDKEvent): void => {
      const raw = rawFrom(e);
      if (raw.kind !== RSVP_KIND) return;
      const aTag = findTag(raw.tags, 'a');
      const status = findTag(raw.tags, 'status');
      const author = raw.pubkey;
      if (!aTag || !status || !author) return;
      if (status !== 'accepted' && status !== 'tentative' && status !== 'declined') return;
      if (!aTagsInView.includes(aTag)) return;
      const ts = raw.created_at ?? 0;
      let byAuthor = latest.get(aTag);
      if (!byAuthor) {
        byAuthor = new Map();
        latest.set(aTag, byAuthor);
      }
      const prev = byAuthor.get(author);
      if (prev && prev.createdAt >= ts) return;
      byAuthor.set(author, { status: status as RsvpStatus, createdAt: ts });
      recompute();
    };

    const sub = ndk.subscribe({ kinds: [RSVP_KIND], '#a': aTagsInView }, { onEvent });
    if (sub && typeof sub.on === 'function') sub.on('event', onEvent);
    return () => {
      if (sub && typeof sub.stop === 'function') sub.stop();
      else if (sub && typeof sub.close === 'function') sub.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aTagsKey, myPubkey]);

  const visible = useMemo(() => {
    return upcoming.filter((x) => {
      if (filterKind !== 'all' && x.ev.kind !== filterKind) return false;
      if (onlyRsvped) {
        const agg = aggByA[x.aTagTarget];
        const eff = pending[x.aTagTarget] ?? agg?.myStatus;
        if (!eff) return false;
      }
      return true;
    });
  }, [upcoming, filterKind, onlyRsvped, aggByA, pending]);

  async function handleRsvp(target: EnrichedLaborEvent, status: RsvpStatus): Promise<void> {
    const live = useAuthStore.getState().signer;
    if (!live) {
      toast.danger('Not signed in', 'Sign in to RSVP.');
      return;
    }
    const aTag = target.aTagTarget;
    const prevStatus = pending[aTag];
    setPending((p) => ({ ...p, [aTag]: status }));
    setBusyByA((b) => ({ ...b, [aTag]: true }));
    try {
      const eventRef: AddressableRef = {
        kind: LABOR_EVENT_KIND,
        pubkey: target.authorPubkey,
        d: target.dSlug,
      };
      const envelope = encodeRsvp({
        status,
        eventRef,
        authorPubkey: target.authorPubkey,
        version: 1,
      });

      const result = await guard(async () => {
        const ndk = getNdk();
        const ev = new NDKEvent(ndk, {
          kind: envelope.kind,
          content: envelope.content,
          tags: envelope.tags,
          created_at: envelope.created_at,
          pubkey: (await live.user()).pubkey,
        } as unknown as NostrEvent);
        await ev.sign(live);
        const maybe = ndk as unknown as NdkSubscriber;
        if (typeof maybe.publish === 'function') {
          await maybe.publish(ev.rawEvent() as unknown as NostrEvent);
        } else {
          await ev.publish();
        }
        return ev;
      });
      if (!result) {
        // Guarded path flipped `blocked = true`; roll back the optimistic flip.
        setPending((p) => {
          const next = { ...p };
          if (prevStatus === undefined) delete next[aTag];
          else next[aTag] = prevStatus;
          return next;
        });
        return;
      }

      if (status === 'accepted') {
        const refId = `rsvp:${aTag}`;
        await scheduleNotificationsForRsvp(target.ev, refId);
      }
    } catch (err) {
      setPending((p) => {
        const next = { ...p };
        if (prevStatus === undefined) delete next[aTag];
        else next[aTag] = prevStatus;
        return next;
      });
      toast.danger(
        'RSVP failed',
        err instanceof Error ? err.message : 'Try again.',
      );
    } finally {
      setBusyByA((b) => ({ ...b, [aTag]: false }));
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-screen-sm flex-col px-5 py-6 gap-4">
      <header className="flex items-center justify-between">
        {onBack ? (
          <Button variant="ghost" size="sm" onClick={onBack} aria-label="Back">
            {'←'} Back
          </Button>
        ) : (
          <span className="w-10" aria-hidden />
        )}
        <h1 className="font-serif text-xl text-soil-900">Calendar</h1>
        <span className="w-10" aria-hidden />
      </header>

      <div
        className={cn(
          'flex flex-wrap items-center gap-2',
          'pb-2 border-b border-soil-100',
        )}
        role="group"
        aria-label="Filter events by kind"
      >
        {KIND_FILTERS.map((f) => (
          <Button
            key={f.value}
            size="sm"
            variant={filterKind === f.value ? 'primary' : 'secondary'}
            onClick={() => setFilterKind(f.value)}
            aria-pressed={filterKind === f.value}
          >
            {f.label}
          </Button>
        ))}
        <span className="ml-auto">
          <Button
            size="sm"
            variant={onlyRsvped ? 'primary' : 'ghost'}
            onClick={() => setOnlyRsvped((v) => !v)}
            aria-pressed={onlyRsvped}
          >
            Only RSVPed
          </Button>
        </span>
      </div>

      {visible.length === 0 ? (
        <Card>
          <CardTitle>No events scheduled — create one.</CardTitle>
          <CardSubtitle>
            Pile builds and turns appear here automatically once a chapter
            member starts a pile.
          </CardSubtitle>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3" aria-label="Upcoming labor events">
          {visible.map((x) => {
            const agg = aggByA[x.aTagTarget] ?? { going: 0, maybe: 0, declined: 0 };
            const pendingStatus = pending[x.aTagTarget] ?? null;
            return (
              <li key={x.aTagTarget}>
                <EventCard
                  ev={x.ev}
                  agg={agg}
                  pendingStatus={pendingStatus}
                  onRsvp={(s) => void handleRsvp(x, s)}
                  busy={!!busyByA[x.aTagTarget]}
                />
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

export default Calendar;
