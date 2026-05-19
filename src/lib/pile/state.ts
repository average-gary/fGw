/**
 * SPEC-013 — State machine + structural validation.
 *
 * Enforces the linear pile lifecycle (no skipping forward) and the FGW
 * Field Guide's dimension/layer/ingredient invariants.
 */
import { PILE_MIN_DIMENSIONS } from '../../domain/fgw';
import { layersForHeight, scaledIngredients } from '../../domain/pileMath';
import type { Pile, PileState, ValidationResult } from './types';

const ADVANCE_ORDER: PileState[] = [
  'DRAFT',
  'COLLECTING',
  'BUILDING',
  'ACTIVE_TURNS',
  'CURING',
  'READY',
  'CONSUMED',
];

/**
 * Returns the next state for the supplied action, or `null` for illegal
 * transitions. `advance` walks the linear order one step at a time;
 * `abandon` is legal from every non-terminal state and routes to
 * `'ABANDONED'`. From `ABANDONED` both actions are `null`.
 */
export function nextState(
  current: PileState,
  action: 'advance' | 'abandon',
): PileState | null {
  if (current === 'ABANDONED') return null;
  if (action === 'abandon') return 'ABANDONED';
  // action === 'advance'
  const idx = ADVANCE_ORDER.indexOf(current);
  if (idx < 0) return null; // unknown state
  if (idx >= ADVANCE_ORDER.length - 1) return null; // CONSUMED is terminal
  return ADVANCE_ORDER[idx + 1] ?? null;
}

const RATIO_TOLERANCE = 0.1;

/**
 * Structural validation per the Field Guide:
 *   - `dimensions` ≥ `PILE_MIN_DIMENSIONS` on every axis;
 *   - `layers.length` falls within `layersForHeight(height)` ± tolerance;
 *   - if any layer has `componentsLogged`, the summed totals approximate
 *     `scaledIngredients(dimensions)` within ±10%.
 */
export function validatePile(p: Pile): ValidationResult {
  const errors: string[] = [];

  if (p.dimensions.length < PILE_MIN_DIMENSIONS.length) {
    errors.push(
      `length ${p.dimensions.length} m below minimum ${PILE_MIN_DIMENSIONS.length} m`,
    );
  }
  if (p.dimensions.width < PILE_MIN_DIMENSIONS.width) {
    errors.push(
      `width ${p.dimensions.width} m below minimum ${PILE_MIN_DIMENSIONS.width} m`,
    );
  }
  if (p.dimensions.height < PILE_MIN_DIMENSIONS.height) {
    errors.push(
      `height ${p.dimensions.height} m below minimum ${PILE_MIN_DIMENSIONS.height} m`,
    );
  }

  const layerRange = layersForHeight(p.dimensions.height);
  if (p.layers.length > 0) {
    if (
      p.layers.length < layerRange.min - 1 ||
      p.layers.length > layerRange.max + 1
    ) {
      errors.push(
        `layers count ${p.layers.length} outside expected ${layerRange.min}–${layerRange.max} for height ${p.dimensions.height} m`,
      );
    }
  }

  // Ingredient totals — only checked when at least one layer logs components.
  const anyLogged = p.layers.some(
    (l) => l.componentsLogged && Object.keys(l.componentsLogged).length > 0,
  );
  if (anyLogged) {
    const sums = { woody: 0, dry: 0, green: 0, manure: 0, water: 0 };
    for (const layer of p.layers) {
      const cl = layer.componentsLogged;
      if (!cl) continue;
      for (const k of Object.keys(sums) as (keyof typeof sums)[]) {
        const v = cl[k];
        if (typeof v === 'number') sums[k] += v;
      }
    }
    const expected = scaledIngredients(p.dimensions);
    const checks: Array<[string, number, number]> = [
      ['woody_m3', sums.woody, expected.woody_m3],
      ['dry_m3', sums.dry, expected.dry_m3],
      ['green_m3', sums.green, expected.green_m3],
      ['manure_50kg_bags', sums.manure, expected.manure_50kg_bags],
      ['water_litres', sums.water, expected.water_litres],
    ];
    for (const [label, actual, exp] of checks) {
      if (exp <= 0) continue;
      const diff = Math.abs(actual - exp) / exp;
      if (diff > RATIO_TOLERANCE) {
        errors.push(
          `${label} total ${actual.toFixed(2)} differs from expected ${exp.toFixed(2)} by ${(diff * 100).toFixed(0)}% (>${RATIO_TOLERANCE * 100}%)`,
        );
      }
    }
  }

  return { ok: errors.length === 0, errors };
}
