import { useEffect, useState } from "react";
import type { MediaSet } from "../services/media";

/** Geometry is a conservative quality gate, not a claim about the frame's subject.
 * Keep CMS order for equal-quality frames; never magnify a portrait into scenery. */
export function useWideArtwork(
  gallery: string[],
  hero = "",
  banner = "",
): string {
  const [selection, setSelection] = useState<{
    gallery: string[];
    hero: string;
    banner: string;
    src: string;
  }>();
  useEffect(() => {
    let active = true;
    void Promise.all(
      [banner, hero, ...gallery].filter(Boolean).map(
        (src) =>
          new Promise<{ src: string; score: number }>((resolve) => {
            const image = new Image();
            image.onload = () => {
              const ratio = image.naturalWidth / image.naturalHeight;
              const suitable =
                image.naturalWidth >= 960 &&
                image.naturalHeight >= 540 &&
                ratio >= 1.5 &&
                ratio <= 2.4;
              resolve({
                src,
                score:
                  src === banner
                    ? 1
                    : suitable
                      ? Math.min(image.naturalWidth, 1920) /
                        (1 + Math.abs(ratio - 16 / 9))
                      : 0,
              });
            };
            image.onerror = () => resolve({ src, score: 0 });
            image.src = src;
          }),
      ),
    ).then((frames) => {
      const dedicated = frames.find(
        (frame) =>
          (frame.src === hero || frame.src === banner) && frame.score > 0,
      );
      const best = frames
        .filter((frame) => frame.score > 0)
        .sort((a, b) => b.score - a.score)[0];
      if (active)
        setSelection({
          gallery,
          hero,
          banner,
          src: dedicated?.src ?? best?.src ?? "",
        });
    });
    return () => {
      active = false;
    };
  }, [gallery, hero, banner]);
  return selection?.gallery === gallery &&
    selection.hero === hero &&
    selection.banner === banner
    ? selection.src
    : "";
}

/** All callers pass media through their existing trust/hash boundary first. */
export function useProjectArtwork(media: MediaSet) {
  const wide = useWideArtwork(media.gallery, media.hero, media.banner);
  const [failed, setFailed] = useState<string[]>([]);
  const frame = failed.includes(wide) ? "" : wide;
  const cover = failed.includes(media.cover) ? "" : media.cover;
  return {
    frame,
    cover,
    isBanner: !!frame && frame === media.banner,
    kind: frame ? "wide" : cover ? "portrait" : "brand",
    fail: (src: string) =>
      setFailed((old) => (old.includes(src) ? old : [...old, src])),
  };
}
