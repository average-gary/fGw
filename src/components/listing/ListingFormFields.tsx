/**
 * SPEC-019 — form-fields subcomponent for the New Listing route.
 *
 * Pure controlled UI: all state lives in the parent. Kept here to keep
 * `NewListing.tsx` under the 350-LOC budget.
 */
import { useMemo } from 'react';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { PhotoThumbs } from '@/components/listing/PhotoThumbs';
import {
  MATERIAL_KINDS,
  materialCategory,
  materialLabel,
  type MaterialKind,
  type MaterialCategory,
} from '@/domain/materials';
import { QUANTITY_UNITS, type QuantityUnit } from '@/domain/quantity';
import { GEO_PRECISION_LABELS } from '@/domain/geoPrecision';
import type { PhotoRef } from '@/lib/listings/types';
import type { Pile } from '@/lib/pile/types';
import { cn } from '@/lib/cn';

const CATEGORY_LABELS: Record<MaterialCategory, string> = {
  'compost-input': 'Compost inputs',
  output: 'Outputs / soil',
  other: 'Other',
};

function MaterialOptions() {
  const groups = useMemo(() => {
    const out: Record<MaterialCategory, MaterialKind[]> = {
      'compost-input': [],
      output: [],
      other: [],
    };
    for (const m of MATERIAL_KINDS) out[materialCategory(m)].push(m);
    return out;
  }, []);
  return (
    <>
      {(Object.keys(groups) as MaterialCategory[]).map((cat) => (
        <optgroup key={cat} label={CATEGORY_LABELS[cat]}>
          {groups[cat].map((m) => (
            <option key={m} value={m}>
              {materialLabel(m)}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}

export interface ListingFormFieldsState {
  kind: 'need' | 'offer';
  material: MaterialKind | '';
  title: string;
  description: string;
  quantityValue: string;
  quantityUnit: QuantityUnit;
  locationText: string;
  geoPrecision: number;
  expiresAt: string;
  pileD: string;
  photos: PhotoRef[];
}

export interface ListingFormFieldsProps {
  form: ListingFormFieldsState;
  errors: Record<string, string>;
  readOnly?: boolean;
  photoBusy?: boolean;
  hasGeohash: boolean;
  piles: Pile[];
  onPatch: <K extends keyof ListingFormFieldsState>(
    k: K,
    v: ListingFormFieldsState[K],
  ) => void;
  onPhotoFiles: (files: FileList | null) => void;
  onRemovePhoto: (sha256: string) => void;
}

export function ListingFormFields({
  form,
  errors,
  readOnly = false,
  photoBusy = false,
  hasGeohash,
  piles,
  onPatch,
  onPhotoFiles,
  onRemovePhoto,
}: ListingFormFieldsProps) {
  return (
    <fieldset disabled={readOnly} className="flex flex-col gap-4">
      <div role="radiogroup" aria-label="Listing kind" className="flex gap-2">
        {(['need', 'offer'] as const).map((k) => {
          const active = form.kind === k;
          return (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onPatch('kind', k)}
              disabled={readOnly}
              className={cn(
                'flex-1 rounded-pill border px-4 py-2 font-medium capitalize transition-colors duration-100',
                active
                  ? 'bg-moss-600 text-bloom-50 border-moss-700'
                  : 'bg-bloom-50 text-soil-700 border-soil-200 hover:bg-soil-100',
              )}
            >
              {k}
            </button>
          );
        })}
      </div>

      <Select
        label="Material"
        required
        value={form.material}
        onChange={(e) => onPatch('material', e.target.value as MaterialKind)}
        placeholder="Pick a material…"
        error={errors.material}
      >
        <MaterialOptions />
      </Select>

      <Input
        label="Title"
        required
        value={form.title}
        onChange={(e) => onPatch('title', e.target.value)}
        placeholder="e.g. Aged manure — pickup Saturday"
        error={errors.title}
        helperText="3–80 characters."
      />

      <Textarea
        label="Description"
        required
        rows={4}
        value={form.description}
        onChange={(e) => onPatch('description', e.target.value)}
        placeholder="What is it, how much, who's it for?"
        error={errors.description}
        helperText="10–800 characters."
      />

      <div className="flex gap-2">
        <Input
          label="Quantity"
          type="number"
          inputMode="decimal"
          min="0"
          step="any"
          value={form.quantityValue}
          onChange={(e) => onPatch('quantityValue', e.target.value)}
          placeholder="0"
          className="flex-1"
          error={errors.quantity}
        />
        <Select
          label="Unit"
          value={form.quantityUnit}
          onChange={(e) => onPatch('quantityUnit', e.target.value as QuantityUnit)}
          className="flex-1"
        >
          {QUANTITY_UNITS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Input
          label="Location (free text)"
          value={form.locationText}
          onChange={(e) => onPatch('locationText', e.target.value)}
          placeholder="High View, WV"
        />
        <Select
          label="Location precision"
          value={String(form.geoPrecision)}
          onChange={(e) => onPatch('geoPrecision', Number(e.target.value))}
          disabled={!hasGeohash}
          helperText={
            hasGeohash
              ? 'How precisely to share your geohash on this listing.'
              : 'No location stored — share location in onboarding to enable this.'
          }
        >
          {GEO_PRECISION_LABELS.map((p) => (
            <option key={p.chars} value={p.chars}>
              {p.label} ({p.chars} chars, {p.accuracy})
            </option>
          ))}
        </Select>
      </div>

      <Input
        label="Expires at"
        type="date"
        value={form.expiresAt}
        onChange={(e) => onPatch('expiresAt', e.target.value)}
        helperText="Optional. We'll remind you 24 h before."
      />

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="newlisting-photos"
          className="text-sm font-medium text-soil-800 leading-tight"
        >
          Photos
        </label>
        <input
          id="newlisting-photos"
          type="file"
          accept="image/*"
          multiple
          disabled={readOnly || photoBusy}
          onChange={(e) => onPhotoFiles(e.target.files)}
          className="text-sm"
        />
        {photoBusy && <p className="text-xs text-soil-500">Uploading…</p>}
        <PhotoThumbs photos={form.photos} onRemove={onRemovePhoto} disabled={readOnly} />
      </div>

      <Select
        label="Pile reference"
        value={form.pileD}
        onChange={(e) => onPatch('pileD', e.target.value)}
        helperText={
          piles.length
            ? 'Optionally link this listing to one of your piles.'
            : 'You have no piles yet — listings can stand alone.'
        }
      >
        <option value="">No pile reference</option>
        {piles.map((p) => (
          <option key={p.d} value={p.d}>
            {p.name}
          </option>
        ))}
      </Select>
    </fieldset>
  );
}

export default ListingFormFields;
