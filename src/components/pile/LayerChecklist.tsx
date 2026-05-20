/**
 * SPEC-021 — Layer-build checklist.
 *
 * Renders a button per expected layer (max from `layersForHeight(height)`).
 * Toggling a row flips `LayerRecord.completed`. Persistence is local to the
 * route until SPEC-021.next wires a 30078 round-trip.
 */
import { Button } from '@/components/ui/Button';
import { PILE_LAYER_RECIPE } from '@/domain/fgw';
import type { LayerRecord } from '@/lib/pile/types';

export interface LayerChecklistProps {
  layers: LayerRecord[];
  total: number;
  onToggle: (index: number) => void;
}

export function LayerChecklist({ layers, total, onToggle }: LayerChecklistProps) {
  const rows = Array.from({ length: total }, (_, i) => {
    const idx = i + 1;
    const rec = layers.find((l) => l.index === idx);
    return { idx, completed: !!rec?.completed };
  });
  return (
    <ul className="flex flex-col gap-1.5" aria-label="Build layers">
      {rows.map((row) => (
        <li key={row.idx} className="flex items-center gap-3">
          <Button
            variant={row.completed ? 'primary' : 'secondary'}
            size="sm"
            role="checkbox"
            aria-checked={row.completed}
            aria-label={`Layer ${row.idx}`}
            onClick={() => onToggle(row.idx)}
          >
            {row.completed ? '✓' : ' '}
          </Button>
          <span className="text-sm text-soil-800">
            <span className="font-medium">Layer {row.idx}</span>
            <span className="ml-2 text-xs text-soil-500 font-mono">
              {PILE_LAYER_RECIPE.woody_cm}cm woody · {PILE_LAYER_RECIPE.dry_cm}cm dry ·{' '}
              {PILE_LAYER_RECIPE.green_cm}cm green ·{' '}
              {PILE_LAYER_RECIPE.manure_bags_50kg} × 50kg manure
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export default LayerChecklist;
