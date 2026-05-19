import { describe, expect, it } from 'vitest';

import {
  MULCH,
  PILE_CURE_DAYS,
  PILE_DEFAULT_TURN_HOUR_LOCAL,
  PILE_INGREDIENT_RATIOS,
  PILE_LAYER_RECIPE,
  PILE_MIN_DIMENSIONS,
  PILE_MOISTURE_TARGET,
  PILE_PRESETS,
  PILE_REFERENCE_DIMENSIONS,
  PILE_REFERENCE_LAYER_COUNT,
  PILE_TEMP_RANGE_C,
  PILE_TURN_SCHEDULE_DAYS,
  PLANTING_STATION,
} from './fgw';
import { GEO_PRECISION_LABELS, truncateGeohash } from './geoPrecision';
import {
  MATERIAL_KINDS,
  materialCategory,
  materialLabel,
} from './materials';
import {
  layersForHeight,
  scaledIngredients,
  staffingEstimate,
  volumeM3,
} from './pileMath';
import {
  QUANTITY_UNITS,
  canonicalToM3,
  quantityLabel,
} from './quantity';

describe('fgw constants — Field Guide invariants', () => {
  it('reference pile dimensions match Field Guide p. 31 (2 m × 2 m × 2 m)', () => {
    expect(PILE_REFERENCE_DIMENSIONS).toEqual({
      length: 2,
      width: 2,
      height: 2,
    });
  });

  it('minimum pile dimensions match Field Guide p. 31 (1.5 × 1.5 × 2 m)', () => {
    expect(PILE_MIN_DIMENSIONS).toEqual({
      length: 1.5,
      width: 1.5,
      height: 2,
    });
  });

  it('pile presets match Field Guide p. 31 (standard / large / commercial)', () => {
    expect(PILE_PRESETS).toEqual([
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
    ]);
  });

  it('ingredient ratios match Field Guide p. 31 (10 / 45 / 22.5 / 22.5 %)', () => {
    expect(PILE_INGREDIENT_RATIOS).toEqual({
      manure: 0.1,
      green: 0.45,
      woody: 0.225,
      dry: 0.225,
    });
    const sum =
      PILE_INGREDIENT_RATIOS.manure +
      PILE_INGREDIENT_RATIOS.green +
      PILE_INGREDIENT_RATIOS.woody +
      PILE_INGREDIENT_RATIOS.dry;
    expect(sum).toBeCloseTo(1, 5);
  });

  it('layer recipe matches Field Guide p. 31–32 (10/10/20 cm + 2 × 50 kg + 50–60 L)', () => {
    expect(PILE_LAYER_RECIPE).toEqual({
      woody_cm: 10,
      dry_cm: 10,
      green_cm: 20,
      manure_bags_50kg: 2,
      water_litres: { min: 50, max: 60 },
      layer_total_cm: 40,
    });
  });

  it('reference layer count matches Field Guide p. 31 (8–9 for 2 m height)', () => {
    expect(PILE_REFERENCE_LAYER_COUNT).toEqual({ min: 8, max: 9 });
  });

  it('turn schedule matches Field Guide p. 32 ([3, 6, 9, 19, 29, 39] days)', () => {
    expect(PILE_TURN_SCHEDULE_DAYS).toEqual([3, 6, 9, 19, 29, 39]);
  });

  it('default turn hour is 9 (Field Guide p. 32, 9 AM local)', () => {
    expect(PILE_DEFAULT_TURN_HOUR_LOCAL).toBe(9);
  });

  it('cure days match Field Guide p. 33 (120 days)', () => {
    expect(PILE_CURE_DAYS).toBe(120);
  });

  it('temperature range matches Field Guide p. 32 (55–68 °C)', () => {
    expect(PILE_TEMP_RANGE_C).toEqual({ min: 55, max: 68 });
  });

  it('moisture target matches Field Guide p. 32 (~50%, squeeze test)', () => {
    expect(PILE_MOISTURE_TARGET).toBe(0.5);
  });

  it('planting station matches Field Guide p. 33 (60 in-row / 75 row / 15 organic / 8 inorganic)', () => {
    // Field Guide p. 33: "Spacing: 60cm in rows and 75cm rows", "Organic Input Depth: 15cm".
    expect(PLANTING_STATION).toEqual({
      in_row_cm: 60,
      row_cm: 75,
      organic_input_depth_cm: 15,
      inorganic_input_depth_cm: 8,
    });
  });

  it("mulch matches Field Guide p. 30 (God's Blanket, 2.5 cm, 100% coverage)", () => {
    expect(MULCH).toEqual({ thickness_cm: 2.5, coverage: 1.0 });
  });
});

describe('pileMath — scaling helpers', () => {
  it('volumeM3 returns length × width × height', () => {
    expect(volumeM3({ length: 2, width: 2, height: 2 })).toBe(8);
    expect(volumeM3({ length: 6, width: 6, height: 6 })).toBe(216);
  });

  it('layersForHeight floors at 8–9 for the reference 2 m height', () => {
    expect(layersForHeight(2)).toEqual({ min: 8, max: 9 });
  });

  it('layersForHeight scales above the reference (3 m → ≥ 8 layers)', () => {
    // 3 / 0.40 = 7.5 → raw min/max 7/8 — but reference floor pulls min to 8.
    const r = layersForHeight(3);
    expect(r.min).toBeGreaterThanOrEqual(8);
    expect(r.max).toBeGreaterThanOrEqual(9);
  });

  it('layersForHeight handles a tall pile (6 m → 15 layers)', () => {
    expect(layersForHeight(6)).toEqual({ min: 15, max: 15 });
  });

  it('scaledIngredients for 2×2×2 returns the reference totals', () => {
    const r = scaledIngredients({ length: 2, width: 2, height: 2 });
    expect(r.manure_50kg_bags).toBeCloseTo(15, 5);
    expect(r.green_m3).toBeCloseTo(8, 5);
    expect(r.woody_m3).toBeCloseTo(4, 5);
    expect(r.dry_m3).toBeCloseTo(4, 5);
    expect(r.water_litres).toBeCloseTo(400, 5);
  });

  it('scaledIngredients for 6×6×6 returns ~27× the 2×2×2 totals', () => {
    // 216 m³ / 8 m³ = 27.
    const ref = scaledIngredients({ length: 2, width: 2, height: 2 });
    const big = scaledIngredients({ length: 6, width: 6, height: 6 });
    expect(big.manure_50kg_bags).toBeCloseTo(ref.manure_50kg_bags * 27, 5);
    expect(big.green_m3).toBeCloseTo(ref.green_m3 * 27, 5);
    expect(big.woody_m3).toBeCloseTo(ref.woody_m3 * 27, 5);
    expect(big.dry_m3).toBeCloseTo(ref.dry_m3 * 27, 5);
    expect(big.water_litres).toBeCloseTo(ref.water_litres * 27, 5);
  });

  it('staffingEstimate(build) is ≥ 2 hr and ~1 person per 2 m³', () => {
    const small = staffingEstimate({ length: 2, width: 2, height: 2 }, 'build');
    expect(small.est_hours).toBeGreaterThanOrEqual(2);
    expect(small.min_volunteers).toBe(4); // 8 m³ / 2 = 4

    const large = staffingEstimate(
      { length: 6, width: 6, height: 6 },
      'build',
    );
    expect(large.min_volunteers).toBe(108); // 216 / 2
  });

  it('staffingEstimate(turn) is ≥ 1.5 hr and ~1 person per 4 m³', () => {
    const r = staffingEstimate({ length: 2, width: 2, height: 2 }, 'turn');
    expect(r.est_hours).toBeGreaterThanOrEqual(1.5);
    expect(r.min_volunteers).toBe(2); // 8 / 4
  });
});

describe('materials', () => {
  it('exposes the full kind list from SPEC § 2.4', () => {
    // Spot-check that representative kinds are present.
    expect(MATERIAL_KINDS).toContain('manure-fresh');
    expect(MATERIAL_KINDS).toContain('mulch');
    expect(MATERIAL_KINDS).toContain('seeds');
    expect(MATERIAL_KINDS).toContain('labor');
    expect(MATERIAL_KINDS.length).toBe(24);
  });

  it('materialCategory routes inputs / outputs / other correctly', () => {
    expect(materialCategory('manure-fresh')).toBe('compost-input');
    expect(materialCategory('mulch')).toBe('output');
    expect(materialCategory('seeds')).toBe('other');
    expect(materialCategory('labor')).toBe('other');
    expect(materialCategory('compost-finished')).toBe('output');
    expect(materialCategory('green-grass')).toBe('compost-input');
  });

  it('materialLabel returns a non-empty human label for every kind', () => {
    for (const k of MATERIAL_KINDS) {
      const label = materialLabel(k);
      expect(typeof label).toBe('string');
      expect(label.length).toBeGreaterThan(0);
    }
  });
});

describe('quantity', () => {
  it('exposes the full unit list from SPEC § 2.5', () => {
    expect(QUANTITY_UNITS).toEqual([
      'bag-50kg',
      'bag-25lb',
      'bucket-5gal',
      'wheelbarrow',
      'pickup-load',
      'cubic-yard',
      'cubic-meter',
      'kilogram',
      'pound',
      'ton',
      'hour',
      'count',
    ]);
  });

  it('canonicalToM3 converts cubic-yard to ~0.7646 m³', () => {
    const m3 = canonicalToM3({ value: 1, unit: 'cubic-yard' });
    expect(m3).not.toBeNull();
    expect(m3 as number).toBeCloseTo(0.7646, 3);
  });

  it('canonicalToM3 returns the value as-is for cubic-meter', () => {
    expect(canonicalToM3({ value: 3, unit: 'cubic-meter' })).toBe(3);
  });

  it('canonicalToM3 returns null for hour and count', () => {
    expect(canonicalToM3({ value: 5, unit: 'hour' })).toBeNull();
    expect(canonicalToM3({ value: 5, unit: 'count' })).toBeNull();
  });

  it('canonicalToM3 returns null for mass units (density-dependent)', () => {
    expect(canonicalToM3({ value: 50, unit: 'kilogram' })).toBeNull();
    expect(canonicalToM3({ value: 1, unit: 'ton' })).toBeNull();
  });

  it("quantityLabel('bag-50kg', 1) yields a 50 kg bag label", () => {
    const label = quantityLabel('bag-50kg', 1);
    // The test accepts singular or plural phrasing.
    expect(['50 kg bag', '50 kg bags']).toContain(label);
  });

  it("quantityLabel('bag-50kg', 5) yields a plural form", () => {
    expect(quantityLabel('bag-50kg', 5)).toBe('50 kg bags');
  });
});

describe('geoPrecision', () => {
  it('GEO_PRECISION_LABELS matches the SPEC § 3.4 table', () => {
    expect(GEO_PRECISION_LABELS).toHaveLength(5);
    expect(GEO_PRECISION_LABELS.map((r) => r.chars)).toEqual([4, 5, 6, 7, 8]);
    const town = GEO_PRECISION_LABELS.find((r) => r.chars === 5);
    expect(town?.label).toBe('Town');
    expect(town?.defaultFor).toContain('listings');
    expect(town?.defaultFor).toContain('piles');
    const street = GEO_PRECISION_LABELS.find((r) => r.chars === 7);
    expect(street?.defaultFor).toContain('labor-events');
  });

  it("truncateGeohash('dnv5xyz', 5) returns 'dnv5x'", () => {
    expect(truncateGeohash('dnv5xyz', 5)).toBe('dnv5x');
  });

  it('truncateGeohash throws when chars exceeds input length', () => {
    expect(() => truncateGeohash('abc', 5)).toThrow();
  });
});
