/**
 * SPEC-022 — Calendar event card.
 *
 * Renders a single labor event with kind badge, formatted local datetime,
 * title, trimmed description, location + geohash precision label, optional
 * pile slug badge, optional staffing line, and a 3-button RSVP control with
 * aggregated counts.
 */
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardTitle } from '@/components/ui/Card';
import { GEO_PRECISION_LABELS } from '@/domain/geoPrecision';
import type { LaborEvent, LaborEventKind, RsvpStatus } from '@/lib/events/types';

export interface RsvpAggregate {
  going: number;
  maybe: number;
  declined: number;
  /** Most-recent RSVP status published by the current user, if any. */
  myStatus?: RsvpStatus;
}

export interface EventCardProps {
  ev: LaborEvent;
  agg: RsvpAggregate;
  /** Optimistic per-tap status applied locally before publish settles. */
  pendingStatus: RsvpStatus | null;
  onRsvp: (status: RsvpStatus) => void;
  busy: boolean;
}

const KIND_BADGE: Record<
  LaborEventKind,
  { label: string; variant: 'success' | 'warning' | 'default' | 'muted' }
> = {
  'pile-build': { label: 'Build', variant: 'success' },
  'pile-turn': { label: 'Turn', variant: 'warning' },
  'mulch-drive': { label: 'Mulch', variant: 'default' },
  'planting-day': { label: 'Planting', variant: 'success' },
  'harvest-day': { label: 'Harvest', variant: 'warning' },
  other: { label: 'Other', variant: 'muted' },
};

const RSVP_BUTTONS: Array<{ status: RsvpStatus; label: string }> = [
  { status: 'accepted', label: 'Going' },
  { status: 'tentative', label: 'Maybe' },
  { status: 'declined', label: 'No' },
];

function trimDescription(s: string, max = 140): string {
  const collapsed = s.replace(/\s+/g, ' ').trim();
  return collapsed.length > max ? collapsed.slice(0, max - 1) + '…' : collapsed;
}

function formatDateTime(unixSecs: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(unixSecs * 1000));
  } catch {
    return new Date(unixSecs * 1000).toISOString();
  }
}

function geoLabel(precision: number | undefined): string | null {
  if (!precision) return null;
  const entry = GEO_PRECISION_LABELS.find((p) => p.chars === precision);
  return entry ? entry.label : null;
}

export function EventCard({ ev, agg, pendingStatus, onRsvp, busy }: EventCardProps) {
  const meta = KIND_BADGE[ev.kind];
  const description = trimDescription(ev.description);
  const geo = geoLabel(ev.geoPrecision);
  const effective = pendingStatus ?? agg.myStatus;

  return (
    <Card>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Badge variant={meta.variant} size="sm">
            {meta.label}
          </Badge>
          <span className="font-mono text-[11px] uppercase tracking-eyebrow text-soil-500">
            {formatDateTime(ev.start)}
          </span>
        </div>
        <CardTitle className="mt-2 truncate">{ev.title}</CardTitle>
        {description && (
          <p className="mt-1 text-sm text-soil-700">{description}</p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {ev.locationText && (
          <span className="text-xs text-soil-600">{ev.locationText}</span>
        )}
        {geo && (
          <Badge variant="muted" size="sm">
            {geo}
          </Badge>
        )}
        {ev.pileRef && (
          <Badge variant="default" size="sm">
            pile:{ev.pileRef.d}
          </Badge>
        )}
      </div>

      {(ev.minVolunteers !== undefined || ev.estHours !== undefined) && (
        <p className="mt-2 text-xs text-soil-600">
          {ev.minVolunteers !== undefined && (
            <>
              <span className="font-mono uppercase tracking-eyebrow">Needs</span>{' '}
              {ev.minVolunteers}
            </>
          )}
          {ev.minVolunteers !== undefined && ev.estHours !== undefined && (
            <span className="mx-1">·</span>
          )}
          {ev.estHours !== undefined && <>~{ev.estHours} hr</>}
        </p>
      )}

      <div className="mt-3 flex items-center gap-2">
        {RSVP_BUTTONS.map((b) => {
          const active = effective === b.status;
          return (
            <Button
              key={b.status}
              size="sm"
              variant={active ? 'primary' : 'secondary'}
              onClick={() => onRsvp(b.status)}
              disabled={busy}
              aria-pressed={active}
            >
              {b.label}
            </Button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-soil-500">
        {agg.going} going · {agg.maybe} maybe
      </p>
    </Card>
  );
}

export default EventCard;
