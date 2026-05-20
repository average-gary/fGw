/**
 * SPEC-021 — Computed-totals readout for the New Pile wizard.
 *
 * Pure presentation: given a `Dimensions` it surfaces the volume, scaled
 * ingredient totals, layer-count range, and build staffing so the operator
 * can sanity-check the recipe before publishing. Numbers come straight from
 * `src/domain/pileMath.ts` so there's exactly one source of truth.
 */
import { Card, CardSubtitle, CardTitle } from '@/components/ui/Card';
import {
  layersForHeight,
  scaledIngredients,
  staffingEstimate,
  volumeM3,
} from '@/domain/pileMath';
import type { Dimensions } from '@/domain/fgw';

export interface PileWizardSummaryProps {
  dim: Dimensions;
}

function fmt(n: number): string {
  if (n >= 100) return n.toFixed(0);
  if (n >= 10) return n.toFixed(1);
  return n.toFixed(2);
}

export function PileWizardSummary({ dim }: PileWizardSummaryProps) {
  const v = volumeM3(dim);
  const layers = layersForHeight(dim.height);
  const ing = scaledIngredients(dim);
  const build = staffingEstimate(dim, 'build');
  const turn = staffingEstimate(dim, 'turn');

  return (
    <Card variant="inset" data-testid="pile-wizard-summary">
      <CardTitle>Recipe preview</CardTitle>
      <CardSubtitle>
        {dim.length} m × {dim.width} m × {dim.height} m ={' '}
        <span className="font-mono">{fmt(v)} m³</span>
      </CardSubtitle>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div className="flex flex-col">
          <dt className="text-xs uppercase tracking-eyebrow text-soil-500 font-mono">
            Layers
          </dt>
          <dd className="text-soil-900">
            {layers.min === layers.max
              ? `${layers.min} layers`
              : `${layers.min}–${layers.max} layers`}
          </dd>
        </div>
        <div className="flex flex-col">
          <dt className="text-xs uppercase tracking-eyebrow text-soil-500 font-mono">
            Build crew
          </dt>
          <dd
            className="text-soil-900"
            data-testid="staffing-build"
          >
            ~{build.min_volunteers} volunteers · {build.est_hours}h
          </dd>
        </div>
        <div className="flex flex-col">
          <dt className="text-xs uppercase tracking-eyebrow text-soil-500 font-mono">
            Per-turn crew
          </dt>
          <dd className="text-soil-900" data-testid="staffing-turn">
            ~{turn.min_volunteers} volunteers · {turn.est_hours}h
          </dd>
        </div>
        <div className="flex flex-col">
          <dt className="text-xs uppercase tracking-eyebrow text-soil-500 font-mono">
            Manure
          </dt>
          <dd className="text-soil-900">{fmt(ing.manure_50kg_bags)} × 50kg</dd>
        </div>
        <div className="flex flex-col">
          <dt className="text-xs uppercase tracking-eyebrow text-soil-500 font-mono">
            Green
          </dt>
          <dd className="text-soil-900">{fmt(ing.green_m3)} m³</dd>
        </div>
        <div className="flex flex-col">
          <dt className="text-xs uppercase tracking-eyebrow text-soil-500 font-mono">
            Woody
          </dt>
          <dd className="text-soil-900">{fmt(ing.woody_m3)} m³</dd>
        </div>
        <div className="flex flex-col">
          <dt className="text-xs uppercase tracking-eyebrow text-soil-500 font-mono">
            Dry
          </dt>
          <dd className="text-soil-900">{fmt(ing.dry_m3)} m³</dd>
        </div>
        <div className="flex flex-col">
          <dt className="text-xs uppercase tracking-eyebrow text-soil-500 font-mono">
            Water
          </dt>
          <dd className="text-soil-900">{fmt(ing.water_litres)} L</dd>
        </div>
      </dl>
    </Card>
  );
}

export default PileWizardSummary;
