import type { MediaSet } from "./media";

// Optional private build inputs. Vite embeds these files in the executable.
// The public checkout intentionally has no redistribution-restricted artwork.
const files = import.meta.glob<string>("../assets/bloodborne-local/*.webp", {
  eager: true,
  query: "?url",
  import: "default",
});
const asset = (name: string) =>
  files[`../assets/bloodborne-local/${name}.webp`] || "";
export const bundledMedia: MediaSet = {
  hero: asset("hero"),
  cover: asset("cover"),
  banner: asset("banner"),
  gallery: Array.from({ length: 10 }, (_, i) =>
    asset(`gallery${i + 1}`),
  ).filter(Boolean),
};
export function resolveMedia(overrides: MediaSet): MediaSet {
  return {
    hero: overrides.hero || bundledMedia.hero,
    cover: overrides.cover || bundledMedia.cover,
    banner: overrides.banner || bundledMedia.banner,
    gallery: overrides.gallery.length
      ? overrides.gallery
      : bundledMedia.gallery,
  };
}
