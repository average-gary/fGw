// Quantity units for listings. Mirrors SPEC.md § 2.5 verbatim.
// Listings emit a tag `quantity:<value>:<unit>`; UI displays the
// locale-friendly label via `quantityLabel`.

export const QUANTITY_UNITS = [
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
  'hour', // for `labor` material
  'count', // generic for tools/seeds
] as const;

export type QuantityUnit = (typeof QUANTITY_UNITS)[number];
export type Quantity = { value: number; unit: QuantityUnit };

// Unit-conversion constants.
const M3_PER_CUBIC_YARD = 0.764554857984;
const M3_PER_GALLON = 0.00378541;
// "Bulk density" estimates for compost inputs. These let us normalise
// container-style units into m³ for rough volume comparison.
// Approximate; intentionally conservative for sorting/filtering only.
const M3_PER_50KG_BAG = 0.05; // ~50 kg of fresh manure ≈ 50 L ≈ 0.05 m³
const M3_PER_25LB_BAG = 0.012; // ~25 lb dry input ≈ 12 L
const M3_PER_BUCKET_5GAL = 5 * M3_PER_GALLON; // ≈ 0.0189 m³
const M3_PER_WHEELBARROW = 0.085; // ~85 L typical contractor wheelbarrow
const M3_PER_PICKUP_LOAD = 1.5; // ~2 cubic-yard pickup, derated to level fill

/**
 * Convert a `Quantity` to cubic metres when the unit is volume-bearing.
 * Returns `null` for units that have no meaningful m³ equivalent
 * (`hour`, `count`). Mass units are NOT converted because conversion
 * depends on material density; we return `null` there too.
 */
export function canonicalToM3(q: Quantity): number | null {
  switch (q.unit) {
    case 'cubic-meter':
      return q.value;
    case 'cubic-yard':
      return q.value * M3_PER_CUBIC_YARD;
    case 'bag-50kg':
      return q.value * M3_PER_50KG_BAG;
    case 'bag-25lb':
      return q.value * M3_PER_25LB_BAG;
    case 'bucket-5gal':
      return q.value * M3_PER_BUCKET_5GAL;
    case 'wheelbarrow':
      return q.value * M3_PER_WHEELBARROW;
    case 'pickup-load':
      return q.value * M3_PER_PICKUP_LOAD;
    case 'kilogram':
    case 'pound':
    case 'ton':
    case 'hour':
    case 'count':
      return null;
  }
}

const SINGULAR_LABELS: Record<QuantityUnit, string> = {
  'bag-50kg': '50 kg bag',
  'bag-25lb': '25 lb bag',
  'bucket-5gal': '5 gal bucket',
  wheelbarrow: 'wheelbarrow',
  'pickup-load': 'pickup load',
  'cubic-yard': 'cubic yard',
  'cubic-meter': 'cubic meter',
  kilogram: 'kg',
  pound: 'lb',
  ton: 'ton',
  hour: 'hour',
  count: 'count',
};

const PLURAL_LABELS: Record<QuantityUnit, string> = {
  'bag-50kg': '50 kg bags',
  'bag-25lb': '25 lb bags',
  'bucket-5gal': '5 gal buckets',
  wheelbarrow: 'wheelbarrows',
  'pickup-load': 'pickup loads',
  'cubic-yard': 'cubic yards',
  'cubic-meter': 'cubic meters',
  kilogram: 'kg',
  pound: 'lb',
  ton: 'tons',
  hour: 'hours',
  count: 'count',
};

/**
 * Locale-friendly label for a quantity unit. Singular when |value| === 1,
 * plural otherwise. Mass units (kg, lb) stay as their abbreviation.
 */
export function quantityLabel(unit: QuantityUnit, value: number): string {
  const isSingular = Math.abs(value) === 1;
  return isSingular ? SINGULAR_LABELS[unit] : PLURAL_LABELS[unit];
}

