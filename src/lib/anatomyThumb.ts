const OBJECT_PATH = '/storage/v1/object/public/';
const RENDER_PATH = '/storage/v1/render/image/public/';

// Anatomy source images are 1024x1024 (see content/README.md), but every
// place that shows one is a small thumbnail (grid tile, review-exercise
// prompt, admin picker) — downloading the full file for a ~200px box is what
// made the anatomy tab feel slow/flickery to load. This asks Supabase
// Storage's image-transform endpoint for a rendition sized for the actual
// display. Only rewrites URLs that actually look like a Supabase object
// public URL, so it's a safe no-op for anything else (e.g. test fixtures).
// Callers should still fall back to the original `url` on <img onError>,
// since image transformations require an add-on enabled on the project.
export function anatomyThumbUrl(url: string, size: number): string {
  const i = url.indexOf(OBJECT_PATH);
  if (i === -1) return url;
  const rewritten = url.slice(0, i) + RENDER_PATH + url.slice(i + OBJECT_PATH.length);
  const sep = rewritten.includes('?') ? '&' : '?';
  return `${rewritten}${sep}width=${size}&height=${size}&resize=cover&quality=70`;
}
