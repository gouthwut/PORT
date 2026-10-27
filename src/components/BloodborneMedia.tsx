import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowLeft, ArrowRight, ImageOff, X } from "lucide-react";
import { Button } from "./ui";

export function GameArt({
  src,
  label = "Обложка",
}: {
  src?: string;
  label?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return src && !failed ? (
    <img
      className="game-art"
      src={src}
      alt={label}
      onError={() => setFailed(true)}
    />
  ) : (
    <div className="art-empty">
      <ImageOff size={28} strokeWidth={1} />
      <span>{label}</span>
    </div>
  );
}
export function Gallery({
  images,
  title = "Bloodborne",
}: {
  images: string[];
  title?: string;
}) {
  const [index, setIndex] = useState<number | null>(null);
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const change = (n: number) =>
    setIndex((i) =>
      i === null ? null : (i + n + images.length) % images.length,
    );
  return (
    <section className="gallery-section">
      <h2>Скриншоты</h2>
      <div className="screenshot-grid">
        {images.length ? (
          images.map((src, i) => (
            <button
              key={i}
              onClick={(e) => {
                returnFocus.current = e.currentTarget;
                setIndex(i);
              }}
              aria-label={`Открыть скриншот ${i + 1}`}
            >
              <img
                src={src}
                alt={`${title} — скриншот ${i + 1}`}
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.alt = "Не удалось загрузить изображение";
                }}
              />
            </button>
          ))
        ) : (
          <p className="gallery-empty">Скриншоты недоступны.</p>
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
              {title} · скриншот {(index ?? 0) + 1} / {images.length}
            </Dialog.Title>
            <Dialog.Description>
              Стрелки переключают изображения. Escape закрывает просмотр.
            </Dialog.Description>
            <Dialog.Close className="icon-button" aria-label="Закрыть просмотр">
              <X />
            </Dialog.Close>
            <Button
              variant="secondary"
              aria-label="Предыдущий скриншот"
              onClick={() => change(-1)}
            >
              <ArrowLeft />
            </Button>
            {index !== null && (
              <img
                src={images[index]}
                alt={`${title} — скриншот ${index + 1}`}
              />
            )}
            <Button
              variant="secondary"
              aria-label="Следующий скриншот"
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
