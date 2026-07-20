// Controlled vocabulary for anatomy_terms.system. Keep in sync with the DB
// CHECK (0013_anatomy.sql) and the systems.* label maps in every locale file.
export const SYSTEMS = [
  'cardiovascular', 'respiratory', 'gastrointestinal', 'musculoskeletal',
  'nervous', 'genitourinary', 'endocrine', 'integumentary', 'lymphatic',
] as const;

export type BodySystem = typeof SYSTEMS[number];

export function isSystem(x: string): x is BodySystem {
  return (SYSTEMS as readonly string[]).includes(x);
}
