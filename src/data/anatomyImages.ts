import { supabase } from '../lib/supabase';

// Single place that turns an anatomy_images.storage_path into a public URL —
// used by the learner tab, the admin tab, and the review-queue join.
export function anatomyImageUrl(storagePath: string): string {
  return supabase.storage.from('anatomy').getPublicUrl(storagePath).data.publicUrl;
}
