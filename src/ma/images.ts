/**
 * MA's image proxy resizes to a FIXED allowlist only; any other size is rejected.
 * Source: music_assistant/controllers/metadata/constants.py
 */
export const IMAGE_SIZES = [0, 80, 160, 256, 512, 1024] as const;
export type ImageSize = (typeof IMAGE_SIZES)[number];

/** Smallest allowed size that still covers `cssPx` at the device's pixel ratio. */
export function pickSize(cssPx: number, dpr = 1): ImageSize {
  const want = cssPx * dpr;
  for (const s of IMAGE_SIZES) if (s !== 0 && s >= want) return s;
  return 1024; // largest real size; 0 means "no resize" and is not what we want here
}

export function coverUrl(baseUrl: string, imageId: string, cssPx: number, dpr = 1): string {
  const u = new URL(`/imageproxy/${encodeURIComponent(imageId)}`, baseUrl);
  u.searchParams.set("size", String(pickSize(cssPx, dpr)));
  return u.toString();
}
