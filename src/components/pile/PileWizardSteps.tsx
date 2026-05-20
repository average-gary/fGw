/**
 * SPEC-021 — Step body components for the New Pile wizard.
 *
 * Each named export renders the body of one wizard step (preset, size,
 * location, schedule, preview). Stateless: parents own the values + setters.
 * Pulled out of `routes/NewPile.tsx` to keep that file under the 500-LOC
 * cap mandated by the spec.
 */
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardSubtitle, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { PileWizardSummary } from './PileWizardSummary';

import {
  PILE_MIN_DIMENSIONS,
  PILE_PRESETS,
  type Dimensions,
  type PilePresetId,
} from '@/domain/fgw';
import { GEO_PRECISION_LABELS, truncateGeohash } from '@/domain/geoPrecision';
import type { LaborEvent } from '@/lib/events/types';

// ---------------------------------------------------------------------------
// Preset
// ---------------------------------------------------------------------------

export interface PresetStepProps {
  presetId: PilePresetId;
  onChange: (id: PilePresetId) => void;
  dim: Dimensions;
}

export function PresetStep({ presetId, onChange, dim }: PresetStepProps) {
  return (
    <Card>
      <CardTitle>Pick a size</CardTitle>
      <CardSubtitle>Standard 2×2×2 fits most home gardens.</CardSubtitle>
      <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Preset">
        {PILE_PRESETS.map((p) => (
          <Button
            key={p.id}
            variant={presetId === p.id ? 'primary' : 'secondary'}
            size="sm"
            role="radio"
            aria-checked={presetId === p.id}
            onClick={() => onChange(p.id)}
          >
            {p.label} · {p.dimensions.length}×{p.dimensions.width}×{p.dimensions.height} m
          </Button>
        ))}
        <Button
          variant={presetId === 'custom' ? 'primary' : 'secondary'}
          size="sm"
          role="radio"
          aria-checked={presetId === 'custom'}
          onClick={() => onChange('custom')}
        >
          Custom…
        </Button>
      </div>
      <div className="mt-4">
        <PileWizardSummary dim={dim} />
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Size (custom only)
// ---------------------------------------------------------------------------

export interface SizeStepProps {
  dim: Dimensions;
  onChange: (next: Dimensions) => void;
  errors: string[];
}

export function SizeStep({ dim, onChange, errors }: SizeStepProps) {
  return (
    <Card>
      <CardTitle>Custom dimensions</CardTitle>
      <CardSubtitle>All values in metres. Floors at the FGW minimum.</CardSubtitle>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <Input
          label="Length"
          type="number"
          min={PILE_MIN_DIMENSIONS.length}
          step={0.1}
          value={String(dim.length)}
          onChange={(e) => onChange({ ...dim, length: Number(e.target.value) || 0 })}
        />
        <Input
          label="Width"
          type="number"
          min={PILE_MIN_DIMENSIONS.width}
          step={0.1}
          value={String(dim.width)}
          onChange={(e) => onChange({ ...dim, width: Number(e.target.value) || 0 })}
        />
        <Input
          label="Height"
          type="number"
          min={PILE_MIN_DIMENSIONS.height}
          step={0.1}
          value={String(dim.height)}
          onChange={(e) => onChange({ ...dim, height: Number(e.target.value) || 0 })}
        />
      </div>
      {errors.length > 0 && (
        <p className="mt-2 text-xs text-harvest-700">
          Below FGW minimum: {errors.join(', ')}
        </p>
      )}
      <div className="mt-4">
        <PileWizardSummary dim={dim} />
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Location
// ---------------------------------------------------------------------------

export interface LocationStepProps {
  locationText: string;
  onLocationText: (s: string) => void;
  geoPrecision: number;
  onGeoPrecision: (n: number) => void;
  geohash: string | undefined;
  dim: Dimensions;
}

export function LocationStep({
  locationText,
  onLocationText,
  geoPrecision,
  onGeoPrecision,
  geohash,
  dim,
}: LocationStepProps) {
  const helper = geohash
    ? `Sharing ${truncateGeohash(geohash, Math.min(geoPrecision, geohash.length))}`
    : 'No device geohash captured — only the text label will be shared.';
  return (
    <Card>
      <CardTitle>Location</CardTitle>
      <CardSubtitle>Optional — helps neighbours find the build.</CardSubtitle>
      <div className="mt-3 flex flex-col gap-3">
        <Input
          label="Where is the pile?"
          placeholder="Backyard near the cherry tree"
          value={locationText}
          onChange={(e) => onLocationText(e.target.value)}
        />
        <Select
          label="Geohash precision"
          value={String(geoPrecision)}
          onChange={(e) => onGeoPrecision(Number(e.target.value))}
          helperText={helper}
        >
          {GEO_PRECISION_LABELS.map((g) => (
            <option key={g.chars} value={g.chars}>
              {g.label} ({g.accuracy})
            </option>
          ))}
        </Select>
      </div>
      <div className="mt-4">
        <PileWizardSummary dim={dim} />
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------

export interface ScheduleStepProps {
  name: string;
  onName: (s: string) => void;
  plannedDate: string;
  onPlannedDate: (s: string) => void;
  timezone: string;
  onTimezone: (s: string) => void;
  tzOptions: Array<{ value: string; label: string }>;
  dim: Dimensions;
}

export function ScheduleStep({
  name,
  onName,
  plannedDate,
  onPlannedDate,
  timezone,
  onTimezone,
  tzOptions,
  dim,
}: ScheduleStepProps) {
  return (
    <Card>
      <CardTitle>Name + schedule</CardTitle>
      <CardSubtitle>Six turn events will be published in this timezone.</CardSubtitle>
      <div className="mt-3 flex flex-col gap-3">
        <Input
          label="Pile name"
          placeholder="Front-yard build"
          value={name}
          onChange={(e) => onName(e.target.value)}
          required
        />
        <Input
          label="Planned build date"
          type="date"
          value={plannedDate}
          onChange={(e) => onPlannedDate(e.target.value)}
          required
        />
        <Select
          label="Timezone"
          value={timezone}
          onChange={(e) => onTimezone(e.target.value)}
          options={tzOptions}
        />
      </div>
      <div className="mt-4">
        <PileWizardSummary dim={dim} />
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

export interface PublishStatusRow {
  kind: 'pile' | 'turn';
  index: number;
  state: 'pending' | 'sent' | 'failed';
}

export interface PreviewStepProps {
  events: LaborEvent[];
  statuses: PublishStatusRow[];
  dim: Dimensions;
}

export function PreviewStep({ events, statuses, dim }: PreviewStepProps) {
  return (
    <Card>
      <CardTitle>Preview</CardTitle>
      <CardSubtitle>
        {events.length === 6
          ? 'Six turn events will be published with the pile.'
          : 'Fill out the previous steps to generate a preview.'}
      </CardSubtitle>
      {events.length > 0 && (
        <ol className="mt-3 flex flex-col gap-2" aria-label="Turn events preview">
          {events.map((ev) => (
            <li
              key={ev.turnIndex}
              className="flex items-center justify-between gap-3 rounded-card border border-soil-200 bg-bloom-50 px-3 py-2"
            >
              <div className="flex flex-col">
                <span className="font-medium text-soil-900">Turn {ev.turnIndex}</span>
                <span className="font-mono text-xs text-soil-500">
                  {new Date(ev.start * 1000).toLocaleString(undefined, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              <Badge variant="muted">
                {ev.minVolunteers} vols · {ev.estHours}h
              </Badge>
            </li>
          ))}
        </ol>
      )}
      <div className="mt-4">
        <PileWizardSummary dim={dim} />
      </div>

      {statuses.length > 0 && (
        <ul className="mt-4 flex flex-col gap-1" aria-label="Publish status">
          {statuses.map((s) => (
            <li
              key={`${s.kind}-${s.index}`}
              className="flex items-center justify-between text-sm"
            >
              <span>{s.kind === 'pile' ? 'Pile event' : `Turn ${s.index}`}</span>
              <Badge
                variant={
                  s.state === 'sent'
                    ? 'success'
                    : s.state === 'failed'
                      ? 'danger'
                      : 'muted'
                }
              >
                {s.state}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
