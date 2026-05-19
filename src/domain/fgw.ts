// FGW (Freedom Garden Way) field-guide invariants.
//
// Source: FGW Field Guide PDF, sections referenced inline. These constants
// must match § 2.2 of /SPEC.md verbatim. Do not edit values without a
// corresponding update to the Field Guide and SPEC.md.

export type Dimensions = {
  length: number;
  width: number;
  height: number;
};

// Field Guide p. 31 — reference pile is 2 m × 2 m × 2 m.
export const PILE_REFERENCE_DIMENSIONS = {
  length: 2,
  width: 2,
  height: 2,
} as const; // metres

// Field Guide p. 31 — minimum workable pile dimensions.
export const PILE_MIN_DIMENSIONS = {
  length: 1.5,
  width: 1.5,
  height: 2,
} as const;

// Field Guide p. 31 — common pile sizes offered as presets.
export const PILE_PRESETS = [
  {
    id: 'standard',
    label: 'Standard',
    dimensions: { length: 2, width: 2, height: 2 },
  },
  {
    id: 'large',
    label: 'Large',
    dimensions: { length: 4, width: 4, height: 3 },
  },
  {
    id: 'commercial',
    label: 'Commercial',
    dimensions: { length: 6, width: 6, height: 6 },
  },
] as const;

export type PilePresetId = (typeof PILE_PRESETS)[number]['id'] | 'custom';

// Field Guide p. 31 — ingredient ratios (10% manure, 45% green, 22.5% woody, 22.5% dry).
export const PILE_INGREDIENT_RATIOS = {
  manure: 0.1,
  green: 0.45,
  woody: 0.225,
  dry: 0.225,
} as const;

// Field Guide p. 31–32 — one complete layer for the 2×2×2 reference pile.
// Larger piles scale ingredient totals and layer counts; per-layer
// thicknesses and water-per-layer remain constant.
export const PILE_LAYER_RECIPE = {
  woody_cm: 10,
  dry_cm: 10,
  green_cm: 20,
  manure_bags_50kg: 2,
  water_litres: { min: 50, max: 60 },
  layer_total_cm: 40,
} as const;

// Field Guide p. 31 — 8–9 layers for a 2 m tall reference pile.
export const PILE_REFERENCE_LAYER_COUNT = { min: 8, max: 9 } as const;

// Field Guide p. 32 — turn schedule in days from build day; same for all sizes.
export const PILE_TURN_SCHEDULE_DAYS = [3, 6, 9, 19, 29, 39] as const;

// Field Guide p. 32 — default turn time of 9 AM in builder's local timezone.
export const PILE_DEFAULT_TURN_HOUR_LOCAL = 9;

// Field Guide p. 33 — cure period of 120 days after the active turn cycle.
export const PILE_CURE_DAYS = 120 as const;

// Field Guide p. 32 — target thermophilic temperature range.
export const PILE_TEMP_RANGE_C = { min: 55, max: 68 } as const;

// Field Guide p. 32 — target moisture (squeeze test, ~50%).
export const PILE_MOISTURE_TARGET = 0.5 as const;

// Field Guide p. 33 — planting station spacing and input depths.
// "Spacing: 60cm in rows and 75cm rows", "Organic Input Depth: 15cm".
export const PLANTING_STATION = {
  in_row_cm: 60,
  row_cm: 75,
  organic_input_depth_cm: 15,
  inorganic_input_depth_cm: 8,
} as const;

// Field Guide p. 30 — "100% coverage with God's Blanket (2.5cm thick)".
export const MULCH = { thickness_cm: 2.5, coverage: 1.0 } as const;
