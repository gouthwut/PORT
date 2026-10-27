import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { collection, type Installation } from "../domain";
import type { GameState } from "../services/game-state";
import { GameArt } from "./BloodborneMedia";
import { GameAction } from "./GameAction";
import { Button, Modal } from "./ui";

export function InstalledLibrary({
  media,
  state,
  onCatalog,
}: {
  media: Record<string, { cover?: string; banner?: string }>;
  state: GameState;
  onCatalog: () => void;
}) {
  const detailRef = useRef<HTMLElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [remove, setRemove] = useState<Installation | null>(null);
  const [message, setMessage] = useState("");
  const [report, setReport] = useState("");
  const [picking, setPicking] = useState(false);
  async function update(i: Installation) {
    setPicking(true);
    setMessage("");
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const path = await open({
        multiple: false,
        directory: false,
        title: "Выберите update PKG Bloodborne 1.09",
        filters: [{ name: "PS4 PKG", extensions: ["pkg"] }],
      });
      if (typeof path === "string") {
        await invoke("update_installation", { id: i.id, path });
        await state.refresh();
      }
    } catch (e) {
      setMessage(String(e));
    } finally {
      setPicking(false);
    }
  }
  useEffect(() => {
    if (selected) detailRef.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);
  const item = state.items.find((i) => i.id === selected);
  const name = (i: Installation) =>
    i.collectionId === collection.id ? collection.title : i.collectionId;
  async function action(command: string, i: Installation, setup = false) {
    setMessage("");
    const result = await state.action(command, i, setup);
    if (result) {
      setReport(result);
      setMessage(
        command === "verify_installation"
          ? "Целостность файлов подтверждена"
          : command === "remove_installation"
            ? "Игра удалена. Сохранения сохранены."
            : "Настройки runtime открыты",
      );
    }
  }
  return (
    <>
      <p className="quiet-label">{state.items.length} установленных игр</p>
      {!state.ready && <p role="status">Загрузка библиотеки…</p>}
      {message && (
        <p role="status" className="inspection">
          {message}
        </p>
      )}
      {state.ready && !state.items.length && (
        <div className="empty-state">
          <h2>Здесь начнётся ваша история</h2>
          <p className="muted">Установленные игры появятся здесь.</p>
          <Button onClick={onCatalog}>Открыть каталог</Button>
        </div>
      )}
      <div className="installed-grid">
        {state.items.map((i) => (
          <button
            key={i.id}
            className={`installed-card ${selected === i.id ? "selected" : ""}`}
            aria-label={`Выбрать: ${name(i)}`}
            aria-pressed={selected === i.id}
            onClick={() => {
              setSelected(i.id);
              setMessage("");
            }}
          >
            <div className="installed-cover">
              <GameArt
                src={media[i.collectionId]?.cover}
                label={`Обложка ${name(i)}`}
              />
            </div>
            <h2>{name(i)}</h2>
            <span className="muted small">
              Версия {i.version || "не определена"}
            </span>
            <span className="muted small">
              <span className="status-dot" />
              {state.running.includes(i.id) ? "Уже запущена" : "Готова к игре"}
            </span>
          </button>
        ))}
      </div>
      {item && (
        <section
          ref={detailRef}
          className="library-detail"
          aria-label={`Выбранная игра: ${name(item)}`}
        >
          <div className="library-detail-art">
            <GameArt
              src={
                media[item.collectionId]?.banner ||
                media[item.collectionId]?.cover
              }
              label={`Оформление ${name(item)}`}
            />
          </div>
          <div className="library-detail-body">
            <p className="eyebrow">ВАША КОЛЛЕКЦИЯ</p>
            <h2>{name(item)}</h2>
            <p className="muted">Версия {item.version || "не определена"}</p>
            {item.version === "01.00" && (
              <p className="muted small">
                Обновление создаёт отдельную 1.09 и копирует профиль. Эта 1.00 и
                её сохранения остаются доступны. Требуется место для полной
                копии; PORT проверит объём до записи.
              </p>
            )}
            <div className="media-actions">
              <GameAction
                state={state}
                collectionId={item.collectionId}
                installationId={item.id}
                onInstall={onCatalog}
              />
              <details className="game-management">
                <summary>Управление игрой</summary>
                <div className="management-actions">
                  {item.version === "01.00" && (
                    <Button
                      variant="secondary"
                      disabled={
                        picking ||
                        state.busy ||
                        !!state.loadError ||
                        !!state.operation?.active ||
                        state.running.includes(item.id) ||
                        state.items.some(
                          (i) =>
                            i.collectionId === item.collectionId &&
                            i.version === "01.09",
                        )
                      }
                      onClick={() => void update(item)}
                    >
                      {picking ? "Выбор PKG…" : "Установить обновление"}
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    disabled={
                      state.busy ||
                      !!state.operation?.active ||
                      state.running.includes(item.id)
                    }
                    onClick={() =>
                      void action("launch_installation", item, true)
                    }
                  >
                    Настроить runtime
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={state.busy || !!state.operation?.active}
                    onClick={() => void action("verify_installation", item)}
                  >
                    Проверить целостность
                  </Button>
                  <Button
                    variant="danger"
                    disabled={
                      state.busy ||
                      !!state.operation?.active ||
                      state.running.includes(item.id)
                    }
                    onClick={() => setRemove(item)}
                  >
                    Удалить
                  </Button>
                </div>
              </details>
            </div>
            {state.operation?.active &&
              ["verifying", "updating"].includes(state.operation.phase) && (
                <Button
                  variant="ghost"
                  onClick={() =>
                    void invoke("cancel_install").catch((e) =>
                      setMessage(String(e)),
                    )
                  }
                >
                  {state.operation.phase === "updating"
                    ? "Отменить обновление"
                    : "Отменить проверку"}
                </Button>
              )}
            {state.operation?.message && (
              <p role="status" className="muted small">
                {state.operation.message}
              </p>
            )}
            <details className="technical-info">
              <summary>Техническая информация</summary>
              <dl>
                {report && (
                  <>
                    <dt>Последняя операция</dt>
                    <dd>{report}</dd>
                  </>
                )}
                <dt>Установка</dt>
                <dd>{item.id}</dd>
                <dt>Коллекция</dt>
                <dd>{item.collectionId}</dd>
                <dt>Версия игры</dt>
                <dd>{item.version || "Не определена"}</dd>
                <dt>Игровые данные</dt>
                <dd>{item.dataPath}</dd>
                <dt>Runtime</dt>
                <dd>{item.runtimePath}</dd>
                <dt>Манифест SHA-256</dt>
                <dd>{item.manifestSha256}</dd>
              </dl>
            </details>
          </div>
        </section>
      )}
      <Modal
        open={!!remove}
        onOpenChange={(v) => {
          if (!v) setRemove(null);
        }}
        title={`Удалить ${remove ? name(remove) : "игру"}?`}
        description="Будут удалены только игровые файлы, скопированные PORT. Исходная папка, сохранения, настройки runtime и неизвестные файлы сохранятся."
      >
        <div className="media-actions">
          <Button
            variant="danger"
            disabled={state.busy}
            onClick={() => {
              const i = remove;
              setRemove(null);
              if (i) void action("remove_installation", i);
            }}
          >
            Подтвердить удаление
          </Button>
          <Button variant="secondary" onClick={() => setRemove(null)}>
            Оставить игру
          </Button>
        </div>
      </Modal>
    </>
  );
}
