import { t } from "../hub/i18n";
import { useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowLeft, ArrowRight, ImageOff, X } from "lucide-react";
import { Button } from "./ui";

export function GameArt({
  src,
  label = t("Обложка"),
  fallbackLabel = t("Изображение недоступно"),
  className = "game-art",
  loading,
}: {
  src?: string;
  label?: string;
  fallbackLabel?: string;
  className?: string;
  loading?: "lazy";
}) {
  const [failed, setFailed] = useState<string>();
  return src && failed !== src ? (
    <img
      className={className}
      loading={loading}
      src={src}
      alt={label}
      onError={() => setFailed(src)}
    />
  ) : (
    <div
      className="art-empty"
      style={
        className === "game-art"
          ? undefined
          : { position: "relative", height: "100%", minHeight: 160 }
      }
    >
      <ImageOff size={28} strokeWidth={1} />
      <span>{src ? fallbackLabel : label}</span>
    </div>
  );
}
export function Gallery({
  images,
  title = "Bloodborne",
  horizontal = false,
}: {
  images: string[];
  title?: string;
  horizontal?: boolean;
}) {
  const [index, setIndex] = useState<number | null>(null);
  const strip = useRef<HTMLDivElement | null>(null);
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const change = (n: number) =>
    setIndex((i) =>
      i === null ? null : (i + n + images.length) % images.length,
    );
  return (
    <section
      className={`gallery-section${horizontal ? " project-gallery" : ""}`}
    >
      <div className="project-gallery-heading">
        <h2>{t("Скриншоты")}</h2>
        {horizontal && (
          <div>
            <button
              className="icon-button"
              aria-label={t("Прокрутить скриншоты назад")}
              onClick={() =>
                strip.current?.scrollBy({
                  left: -strip.current.clientWidth * 0.8,
                  behavior: window.matchMedia(
                    "(prefers-reduced-motion: reduce)",
                  ).matches
                    ? "instant"
                    : "smooth",
                })
              }
            >
              <ArrowLeft size={18} />
            </button>
            <button
              className="icon-button"
              aria-label={t("Прокрутить скриншоты вперёд")}
              onClick={() =>
                strip.current?.scrollBy({
                  left: strip.current.clientWidth * 0.8,
                  behavior: window.matchMedia(
                    "(prefers-reduced-motion: reduce)",
                  ).matches
                    ? "instant"
                    : "smooth",
                })
              }
            >
              <ArrowRight size={18} />
            </button>
          </div>
        )}
      </div>
      <div className="screenshot-grid" ref={strip}>
        {images.length ? (
          images.map((src, i) => (
            <button
              key={i}
              onClick={(e) => {
                returnFocus.current = e.currentTarget;
                setIndex(i);
              }}
              aria-label={`${t("Открыть скриншот")} ${i + 1}`}
            >
              <GameArt
                className=""
                loading="lazy"
                src={src}
                label={`${title} — ${t("Скриншот")} ${i + 1}`}
              />
            </button>
          ))
        ) : (
          <p className="gallery-empty">{t("Скриншоты недоступны.")}</p>
        )}
      </div>
      <Dialog.Root
        open={index !== null}
        onOpenChange={(open) => {
          if (!open) setIndex(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content
            className="lightbox"
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              returnFocus.current?.focus();
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") {
                e.preventDefault();
                change(-1);
              }
              if (e.key === "ArrowRight") {
                e.preventDefault();
                change(1);
              }
            }}
          >
            <Dialog.Title>
              {title}
              {t("· скриншот")} {(index ?? 0) + 1} / {images.length}
            </Dialog.Title>
            <Dialog.Description>
              {t(
                "Стрелки переключают изображения. Escape закрывает просмотр.",
              )}{" "}
            </Dialog.Description>
            <Dialog.Close
              className="icon-button"
              aria-label={t("Закрыть просмотр")}
            >
              <X />
            </Dialog.Close>
            <Button
              variant="secondary"
              aria-label={t("Предыдущий скриншот")}
              onClick={() => change(-1)}
            >
              <ArrowLeft />
            </Button>
            {index !== null && (
              <GameArt
                className=""
                src={images[index]}
                label={`${title} — ${t("Скриншот")} ${index + 1}`}
              />
            )}
            <Button
              variant="secondary"
              aria-label={t("Следующий скриншот")}
              onClick={() => change(1)}
            >
              <ArrowRight />
            </Button>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}
