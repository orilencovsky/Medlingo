// Controlled vocabulary for dictionary_entries.topic. Keep in sync with the DB CHECK
// (0012_dictionary_topic.sql) and the topics.* label maps in every locale file.
export const TOPICS = [
  'anatomy', 'symptoms', 'cardiology', 'respiratory', 'gastro', 'neuro', 'msk',
  'genitourinary', 'endocrine', 'dermatology', 'medications', 'procedures',
  'lab_imaging', 'emergency', 'mental_health', 'obgyn', 'pediatrics', 'infectious', 'general',
] as const;

export type Topic = typeof TOPICS[number];

export function isTopic(x: string): x is Topic {
  return (TOPICS as readonly string[]).includes(x);
}
