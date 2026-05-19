// Material taxonomy. Single source for all listing/pile material kinds.
// Mirrors SPEC.md § 2.4 verbatim.

export const MATERIAL_KINDS = [
  // Compost inputs
  'manure-fresh',
  'manure-aged',
  'manure-poultry',
  'manure-rabbit',
  'green-grass',
  'green-weeds',
  'green-veg-scraps',
  'green-legumes',
  'woody-stalks',
  'woody-branches',
  'woody-cardboard',
  'woody-shavings',
  'dry-leaves',
  'dry-thatch',
  'dry-straw',
  // Outputs / soil
  'compost-finished',
  'compost-curing',
  'mulch',
  'biochar',
  'wood-ash',
  'lime',
  // Other
  'seeds',
  'tools',
  'labor',
] as const;

export type MaterialKind = (typeof MATERIAL_KINDS)[number];

export type MaterialCategory = 'compost-input' | 'output' | 'other';

const CATEGORY_BY_KIND: Record<MaterialKind, MaterialCategory> = {
  // Compost inputs
  'manure-fresh': 'compost-input',
  'manure-aged': 'compost-input',
  'manure-poultry': 'compost-input',
  'manure-rabbit': 'compost-input',
  'green-grass': 'compost-input',
  'green-weeds': 'compost-input',
  'green-veg-scraps': 'compost-input',
  'green-legumes': 'compost-input',
  'woody-stalks': 'compost-input',
  'woody-branches': 'compost-input',
  'woody-cardboard': 'compost-input',
  'woody-shavings': 'compost-input',
  'dry-leaves': 'compost-input',
  'dry-thatch': 'compost-input',
  'dry-straw': 'compost-input',
  // Outputs / soil
  'compost-finished': 'output',
  'compost-curing': 'output',
  mulch: 'output',
  biochar: 'output',
  'wood-ash': 'output',
  lime: 'output',
  // Other
  seeds: 'other',
  tools: 'other',
  labor: 'other',
};

const LABEL_BY_KIND: Record<MaterialKind, string> = {
  'manure-fresh': 'Fresh manure',
  'manure-aged': 'Aged manure',
  'manure-poultry': 'Poultry manure',
  'manure-rabbit': 'Rabbit manure',
  'green-grass': 'Grass clippings',
  'green-weeds': 'Weeds',
  'green-veg-scraps': 'Vegetable scraps',
  'green-legumes': 'Legumes',
  'woody-stalks': 'Woody stalks',
  'woody-branches': 'Branches',
  'woody-cardboard': 'Cardboard',
  'woody-shavings': 'Wood shavings',
  'dry-leaves': 'Dry leaves',
  'dry-thatch': 'Thatch',
  'dry-straw': 'Straw',
  'compost-finished': 'Finished compost',
  'compost-curing': 'Curing compost',
  mulch: "Mulch (God's Blanket)",
  biochar: 'Biochar',
  'wood-ash': 'Wood ash',
  lime: 'Lime',
  seeds: 'Seeds',
  tools: 'Tools',
  labor: 'Labor',
};

export function materialLabel(kind: MaterialKind): string {
  return LABEL_BY_KIND[kind];
}

export function materialCategory(kind: MaterialKind): MaterialCategory {
  return CATEGORY_BY_KIND[kind];
}
