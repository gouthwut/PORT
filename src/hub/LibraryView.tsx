import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FolderOpen, Gamepad2, Play, ShieldCheck, Trash2 } from "lucide-react";
import { Button, Modal } from "../components/ui";
import type { Installation } from "../domain";
import type { GameState } from "../services/game-state";
import { native } from "../services/settings";
import { t } from "./i18n";
import { emptyMedia, type MediaSet } from "../services/media";
import type { CatalogProject } from "./catalog-model";
import { useV2Media } from "./v2-media";
import { useProjectArtwork } from "./artwork";
import "./library.css";

const title = (item: Installation) =>
  ({ bloodborne: "Bloodborne", skate3: "Skate 3" })[
    item.collectionId as "bloodborne" | "skate3"
  ] || item.collectionId;

export function LibraryView({
  state,
  onCatalog,
  projects,
}: {
  state: GameState;
  onCatalog: () => void;
  projects: CatalogProject[];
}) {
  const [remove, setRemove] = useState<Installation | null>(null);
  const [message, setMessage] = useState("");
  const [openingFolder, setOpeningFolder] = useState(false);
  const blocked = state.busy || !!state.loadError || !!state.operation?.active;
  async function reveal(item: Installation) {
    setOpeningFolder(true);
    setMessage("");
    try {
      await invoke("open_installation_folder", { id: item.id });
    } catch {
      setMessage(t("Не удалось открыть папку. Проверьте, что она доступна."));
    } finally {
      setOpeningFolder(false);
    }
  }
  async function verify(item: Installation) {
    setMessage("");
    if (await state.action("verify_installation", item))
      setMessage(t("Целостность файлов подтверждена"));
  }
  return (
    <section className="port-library">
      <header className="page-heading">
        <h1>
          {t("Библиотека")}
          <span className="accent">.</span>
        </h1>
        <Button variant="secondary" onClick={onCatalog}>
          {t("Открыть каталог")}
        </Button>
      </header>
      {!native && (
        <p className="muted">
          {t("Библиотека доступна в приложении PORT для Windows.")}
        </p>
      )}
      {native && !state.ready && !state.loadError && (
        <p role="status">{t("Загрузка библиотеки…")}</p>
      )}
      {state.error && (
        <div role="alert" className="inspection">
          <p>
            {t(
              state.loadError
                ? "Не удалось загрузить библиотеку. Повторите попытку."
                : "Не удалось выполнить действие. Повторите попытку.",
            )}
          </p>
          {state.loadError && (
            <Button
              variant="secondary"
              onClick={() => void state.refresh().catch(() => {})}
            >
              {t("Повторить")}
            </Button>
          )}
        </div>
      )}
      {message && (
        <p role="status" className="inspection">
          {message}
        </p>
      )}
      {native && state.ready && !state.loadError && !state.items.length && (
        <div className="empty-state">
          <Gamepad2 size={32} aria-hidden="true" />
          <h2>{t("Установленных игр пока нет")}</h2>
          <p className="muted">
            {t("Здесь появятся игры, установленные через PORT.")}
          </p>
        </div>
      )}
      <div className="port-library-grid">
        {state.items.map((item) => {
          const running = state.running.includes(item.id);
          const healthy = !item.health || item.health === "installed";
          return (
            <article className="port-library-card" key={item.id}>
              <LibraryArtwork
                media={
                  projects.find(
                    (p) =>
                      p.id === item.collectionId ||
                      p.games.some((g) => g.id === item.collectionId),
                  )?.media ?? emptyMedia
                }
              />
              <div className="port-library-copy">
                <h2>{title(item)}</h2>
                <p className="muted">
                  {t("Версия")}: {item.version || t("Не указана")}
                </p>
                <p>
                  {t(
                    running
                      ? "Уже запущена"
                      : !healthy
                        ? "Папка установки недоступна"
                        : "Готова к игре",
                  )}
                </p>
                <div className="port-library-actions">
                  <Button
                    disabled={blocked || running || !healthy}
                    onClick={() =>
                      void state.action("launch_installation", item)
                    }
                  >
                    <Play size={16} aria-hidden="true" />
                    {t("Играть")}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={openingFolder}
                    onClick={() => void reveal(item)}
                  >
                    <FolderOpen size={16} aria-hidden="true" />
                    {t("Открыть папку")}
                  </Button>
                </div>
                <details className="port-library-manage">
                  <summary>{t("Управление игрой")}</summary>
                  <p className="port-library-path">{item.root}</p>
                  <div className="port-library-actions">
                    <Button
                      variant="secondary"
                      disabled={blocked || running || !healthy}
                      onClick={() => void verify(item)}
                    >
                      <ShieldCheck size={16} aria-hidden="true" />
                      {t("Проверить целостность")}
                    </Button>
                    <Button
                      variant="danger"
                      disabled={blocked || running}
                      onClick={() => setRemove(item)}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                      {t("Удалить")}
                    </Button>
                  </div>
                </details>
              </div>
            </article>
          );
        })}
      </div>
      {state.operation?.active && (
        <div role="status" className="inspection">
          <p>
            {t(
              state.operation.phase === "verifying"
                ? "Проверка файлов…"
                : "Операция выполняется…",
            )}
          </p>
          <progress
            aria-label={t("Прогресс операции")}
            max={state.operation.total || undefined}
            value={
              state.operation.total
                ? Math.min(state.operation.completed, state.operation.total)
                : undefined
            }
          />
        </div>
      )}
      <Modal
        open={!!remove}
        onOpenChange={(open) => {
          if (!open) setRemove(null);
        }}
        title={t("Удалить игру?")}
        description={t(
          "Игровые файлы будут удалены. Сохранения и настройки останутся.",
        )}
      >
        {remove && <p>{title(remove)}</p>}
        <div className="port-library-actions">
          <Button variant="secondary" onClick={() => setRemove(null)}>
            {t("Отмена")}
          </Button>
          <Button
            variant="danger"
            disabled={
              blocked || (!!remove && state.running.includes(remove.id))
            }
            onClick={async () => {
              if (remove && (await state.action("remove_installation", remove)))
                setRemove(null);
            }}
          >
            {t("Удалить")}
          </Button>
        </div>
      </Modal>
    </section>
  );
}

function LibraryArtwork({ media }: { media: MediaSet }) {
  const validated = useV2Media(media);
  const artwork = useProjectArtwork(validated);
  const image = artwork.frame || artwork.cover;
  return (
    <div className="port-library-art" aria-hidden="true">
      {image ? (
        <img
          src={image}
          alt=""
          data-cover={!artwork.frame}
          onError={() => artwork.fail(image)}
        />
      ) : (
        <>
          <Gamepad2 size={42} strokeWidth={1.2} />
          <span>PORT//</span>
        </>
      )}
    </div>
  );
}
