import { useEffect, useState } from "react";

/** Geometry is a conservative quality gate, not a claim about the frame's subject.
 * Keep CMS order for equal-quality frames; never magnify a portrait into scenery. */
export function useWideArtwork(gallery: string[]): string {
  const [selection, setSelection] = useState<{
    gallery: string[];
    src: string;
  }>();
  useEffect(() => {
    let active = true;
    void Promise.all(
      gallery.map(
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
                score: suitable
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
      const best = frames
        .filter((frame) => frame.score > 0)
        .sort((a, b) => b.score - a.score)[0];
      if (active) setSelection({ gallery, src: best?.src ?? "" });
    });
    return () => {
      active = false;
    };
  }, [gallery]);
  return selection?.gallery === gallery ? selection.src : "";
}
