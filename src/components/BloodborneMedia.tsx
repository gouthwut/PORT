import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowLeft, ArrowRight, ImageOff, X } from "lucide-react";
import { Button } from "./ui";
import { importPhoto, type MediaSet } from "../services/media";

export function GameArt({
  src,
  label = "Bloodborne",
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
      <small>ЛОКАЛЬНЫЕ ИЗОБРАЖЕНИЯ</small>
    </div>
  );
}
export function MediaEditor({
  media,
  onSave,
}: {
  media: MediaSet;
  onSave: (next: MediaSet) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const slot = useRef<keyof MediaSet>("hero");
  async function selected(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError("");
    try {
      const target = slot.current;
      if (target === "gallery" && files.length > 10)
        throw new Error("Выберите не более 10 скриншотов.");
      const photos = [];
      for (const file of Array.from(files).slice(
        0,
        target === "gallery" ? 10 : 1,
      ))
        photos.push(await importPhoto(file, target === "cover"));
      await onSave({
        ...media,
        [target]: target === "gallery" ? photos : photos[0],
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  return (
    <section className="media-editor">
      <h3>Ваше оформление Bloodborne</h3>
      <p className="muted small">
        Импортируйте материалы, которыми вправе пользоваться. Файлы
        обрабатываются локально и не отправляются в интернет. Галерея: до 10
        изображений. В браузерном preview лимит хранения зависит от
        localStorage.
      </p>
      <input
        ref={input}
        type="file"
        hidden
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => void selected(e.target.files)}
      />
      <div className="media-actions">
        {(
          [
            ["hero", "Главный hero"],
            ["cover", "Обложка 2:3"],
            ["banner", "Баннер страницы"],
            ["gallery", "Скриншоты"],
          ] as const
        ).map(([id, name]) => (
          <Button
            key={id}
            variant="secondary"
            disabled={busy}
            onClick={() => {
              slot.current = id;
              input.current!.multiple = id === "gallery";
              input.current!.click();
            }}
          >
            {name}
            {id === "gallery"
              ? ` (${media.gallery.length}/10)`
              : media[id]
                ? " ✓"
                : ""}
          </Button>
        ))}
      </div>
      {busy && <p role="status">Обработка и сохранение…</p>}
      {error && (
        <p role="alert">
          {error.includes("quota")
            ? "Недостаточно места в localStorage. Используйте Windows-приложение."
            : error}
        </p>
      )}
    </section>
  );
}
export function Gallery({ images }: { images: string[] }) {
  const [index, setIndex] = useState<number | null>(null);
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const change = (n: number) =>
    setIndex((i) =>
      i === null ? null : (i + n + images.length) % images.length,
    );
  return (
    <section className="gallery-section">
      <h2>Ночь в Ярнаме</h2>
      <p className="muted small">
        Галерея · {images.length} / 10 · изображения доступны без интернета
      </p>
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
                alt={`Bloodborne — скриншот ${i + 1}`}
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.alt = "Не удалось загрузить изображение";
                }}
              />
            </button>
          ))
        ) : (
          <p className="gallery-empty">
            Скриншоты ещё не добавлены. Выберите изображения в разделе
            оформления ниже.
          </p>
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
              Bloodborne · скриншот {(index ?? 0) + 1} / {images.length}
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
                alt={`Bloodborne — скриншот ${index + 1}`}
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
