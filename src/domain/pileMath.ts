// Pile-scaling math for FGW compost piles.
//
// All formulas derive from the 2 m × 2 m × 2 m reference pile defined in
// `fgw.ts` (Field Guide p. 31–32). Larger piles scale ingredient totals
// and layer counts proportionally to volume; per-layer thicknesses and
// water-per-layer remain constant.

import {
  PILE_LAYER_RECIPE,
  PILE_REFERENCE_DIMENSIONS,
  PILE_REFERENCE_LAYER_COUNT,
  type Dimensions,
} from './fgw';

// One complete layer is 40 cm thick (10 woody + 10 dry + 20 green).
const LAYER_THICKNESS_M = PILE_LAYER_RECIPE.layer_total_cm / 100;

// Reference totals from Field Guide p. 31 for the 2×2×2 (8 m³) pile:
//   "10% nitrogen — 15 × 50kg bags fresh manure"
//   "45% green — about 8m³"
//   "22.5% woody — about 4m³"
//   "22.5% dry — about 4m³"
//   50–60 L water × 8 layers ≈ 400 L (midpoint of 55 × 8 = 440 averaged
//   against the spec's "~400 L" — we use 8 × midpoint(55) = 440? The
//   SPEC explicitly says ~400 L total; we honour the SPEC value).
const REFERENCE_TOTALS = {
  manure_50kg_bags: 15,
  green_m3: 8,
  woody_m3: 4,
  dry_m3: 4,
  water_litres: 400,
} as const;

const REFERENCE_VOLUME_M3 =
  PILE_REFERENCE_DIMENSIONS.length *
  PILE_REFERENCE_DIMENSIONS.width *
  PILE_REFERENCE_DIMENSIONS.height;

export function volumeM3(d: Dimensions): number {
  return d.length * d.width * d.height;
}

/**
 * Estimate the number of complete 40 cm layers required for a pile of the
 * given height. Returns a min/max range. For piles at or below the 2 m
 * reference height, the result floors at PILE_REFERENCE_LAYER_COUNT
 * (8–9 layers) per Field Guide p. 31.
 */
export function layersForHeight(height_m: number): {
  min: number;
  max: number;
} {
  const rawMin = Math.floor(height_m / LAYER_THICKNESS_M);
  const rawMax = Math.ceil(height_m / LAYER_THICKNESS_M);
  return {
    min: Math.max(rawMin, PILE_REFERENCE_LAYER_COUNT.min),
    max: Math.max(rawMax, PILE_REFERENCE_LAYER_COUNT.max),
  };
}

/**
 * Scale the reference 2×2×2 ingredient totals to the supplied pile volume.
 * Scale factor = volume(d) / volume(reference) = volume(d) / 8 m³.
 */
export function scaledIngredients(d: Dimensions): {
  manure_50kg_bags: number;
  green_m3: number;
  woody_m3: number;
  dry_m3: number;
  water_litres: number;
} {
  const scale = volumeM3(d) / REFERENCE_VOLUME_M3;
  return {
    manure_50kg_bags: REFERENCE_TOTALS.manure_50kg_bags * scale,
    green_m3: REFERENCE_TOTALS.green_m3 * scale,
    woody_m3: REFERENCE_TOTALS.woody_m3 * scale,
    dry_m3: REFERENCE_TOTALS.dry_m3 * scale,
    water_litres: REFERENCE_TOTALS.water_litres * scale,
  };
}

/**
 * Heuristic staffing estimate. Build = ~1 person per 2 m³, ≥ 2 hr.
 * Turn = ~1 person per 4 m³, ≥ 1.5 hr. Used to suggest minimum
 * volunteers and event duration on labor-event creation.
 */
export function staffingEstimate(
  d: Dimensions,
  task: 'build' | 'turn',
): { min_volunteers: number; est_hours: number } {
  const v = volumeM3(d);
  if (task === 'build') {
    return {
      min_volunteers: Math.max(1, Math.ceil(v / 2)),
      est_hours: Math.max(2, 2),
    };
  }
  // task === 'turn'
  return {
    min_volunteers: Math.max(1, Math.ceil(v / 4)),
    est_hours: Math.max(1.5, 1.5),
  };
}
