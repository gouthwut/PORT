import { useEffect, useState } from "react";
import { loadCatalogImage, publicHttps } from "../services/catalog";
import { emptyMedia, type MediaSet } from "../services/media";
import endpoint from "../catalog-endpoint.json";
import { isLocalCms } from "./local-cms-qa";

function asset(raw: unknown) {
  if (typeof raw !== "string") throw Error("Invalid media URL");
  const u = isLocalCms(raw) ? new URL(raw) : publicHttps(raw);
  const match = /^\/media\/([a-f0-9]{64})\.webp$/.exec(u.pathname);
  if (
    (!isLocalCms(raw) && u.origin !== new URL(endpoint).origin) ||
    u.search ||
    !match
  )
    throw Error("Untrusted media URL");
  return { url: u.href, sha256: match[1] };
}

/** Invalid optional images become placeholders, never external requests. */
export function parseV2Media(value: unknown): MediaSet {
  const m =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const safe = (v: unknown) => {
    try {
      return asset(v).url;
    } catch {
      return "";
    }
  };
  return {
    ...emptyMedia,
    // Optional forward compatibility; the current v2 API does not promise these.
    hero: safe(m.hero),
    banner: safe(m.banner),
    cover: safe(m.cover),
    gallery: Array.isArray(m.screenshots)
      ? m.screenshots.slice(0, 12).map(safe).filter(Boolean)
      : [],
  };
}

// At most 24 one-MiB images, including in-flight requests. No persistent v1 writes.
const cache = new Map<string, Promise<string>>();
function image(url: string): Promise<string> {
  const descriptor = asset(url);
  const old = cache.get(url);
  if (old) return old;
  const pending = loadCatalogImage(descriptor).catch(() => {
    if (cache.get(url) === pending) cache.delete(url);
    return "";
  });
  if (cache.size >= 24) cache.delete(cache.keys().next().value!);
  cache.set(url, pending);
  return pending;
}

export function useV2Media(media?: MediaSet): MediaSet {
  const [loaded, setLoaded] = useState<{ source: MediaSet; media: MediaSet }>();
  useEffect(() => {
    if (!media) return;
    let active = true;
    const load = (url: string) => (url ? image(url) : Promise.resolve(""));
    void Promise.all([
      load(media.cover),
      load(media.hero),
      load(media.banner),
      ...media.gallery.map(load),
    ]).then(([cover, hero, banner, ...gallery]) => {
      if (active)
        setLoaded({
          source: media,
          media: { cover, hero, banner, gallery: gallery.filter(Boolean) },
        });
    });
    return () => {
      active = false;
    };
  }, [media]);
  return loaded && loaded.source === media ? loaded.media : emptyMedia;
}
