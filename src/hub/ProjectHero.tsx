import type { ReactNode } from "react";
import type { MediaSet } from "../services/media";
import { useProjectArtwork } from "./artwork";
import { t } from "./i18n";

/** Artwork already passed origin, immutable hash and decode validation. */
export function ProjectHero({
  media,
  title,
  children,
  className = "",
  label = title,
}: {
  media: MediaSet;
  title: string;
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  const art = useProjectArtwork(media);
  return (
    <section
      className={`universal-hero ${className}`}
      data-artwork={art.kind}
      aria-label={label}
    >
      <div className="universal-hero-art" aria-hidden="true">
        {art.frame ? (
          <img
            className="universal-frame"
            src={art.frame}
            alt=""
            onError={() => art.fail(art.frame)}
          />
        ) : art.cover ? (
          <>
            <img className="universal-cover-glow" src={art.cover} alt="" />
            <img
              className="universal-cover"
              src={art.cover}
              alt=""
              onError={() => art.fail(art.cover)}
            />
          </>
        ) : (
          <span className="universal-brand">
            PORT<span>//</span>
          </span>
        )}
      </div>
      <div className="universal-shade" />
      <div className="universal-content">{children}</div>
      {art.kind === "brand" && (
        <span className="universal-art-note">
          {t("Изображение недоступно")}
        </span>
      )}
    </section>
  );
}
