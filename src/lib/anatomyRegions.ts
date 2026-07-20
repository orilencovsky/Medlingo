// Controlled vocabulary for anatomy_terms.region. Keep in sync with the DB
// CHECK (0013_anatomy.sql) and the regions.* label maps in every locale file.
export const REGIONS = ['head_neck', 'chest', 'abdomen', 'limbs', 'skeleton'] as const;

export type Region = typeof REGIONS[number];

export function isRegion(x: string): x is Region {
  return (REGIONS as readonly string[]).includes(x);
}
