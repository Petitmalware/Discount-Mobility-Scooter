export const MIN_PRODUCT_IMAGES = 5;
export const TARGET_PRODUCT_IMAGES = 8;
export const MAX_PRODUCT_IMAGES = 16;

export function isSafeImageSource(src: string): boolean {
  if (/^\/(?:assets|images)\/[a-zA-Z0-9/_.-]+$/.test(src) && !src.includes("..")) return true;
  try { const value=new URL(src); return value.protocol==="https:"&&!value.username&&!value.password; }
  catch { return false; }
}

// CDN size/quality variants of the same file count as one image.
export function imageIdentity(src: string): string {
  try {
    const value = new URL(src, "https://store.local");
    for (const key of ["w", "h", "width", "height", "q", "quality", "fit", "crop", "v"]) value.searchParams.delete(key);
    value.hash = "";
    value.searchParams.sort();
    return value.href;
  } catch { return src.trim(); }
}

export function uniqueGallery(main: string, images: readonly string[] = []): string[] {
  const seen = new Set<string>();
  return [main, ...images].map(src => src.trim()).filter(src => {
    if (!src) return false;
    const identity = imageIdentity(src);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}
