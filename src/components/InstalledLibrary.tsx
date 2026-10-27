import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Installation } from "../domain";
import { native } from "../services/settings";
import { GameArt } from "./BloodborneMedia";
import { Button, Modal } from "./ui";

export function InstalledLibrary({
  cover,
  onCatalog,
}: {
  cover?: string;
  onCatalog: () => void;
}) {
  const [items, setItems] = useState<Installation[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [remove, setRemove] = useState<Installation | null>(null);
  const [running, setRunning] = useState("");
  async function refresh() {
    if (native) setItems(await invoke<Installation[]>("list_installations"));
  }
  useEffect(() => {
    void refresh().catch((e) => setError(String(e)));
  }, []);
  useEffect(() => {
    if (!native) return;
    const timer = setInterval(() => {
      void refresh().catch((e) => setError(String(e)));
      void invoke<string>("launch_status")
        .then(setRunning)
        .catch((e) => setError(String(e)));
    }, 2000);
    return () => clearInterval(timer);
  }, []);
  async function action(command: string, item: Installation, setup = false) {
    if (busy) return;
    setBusy(true);
    setVerifying(command === "verify_installation");
    setError("");
    setMessage("");
    try {
      setMessage(
        await invoke<string>(command, {
          id: item.id,
          confirmed: command === "remove_installation",
          setup,
        }),
      );
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
      setVerifying(false);
    }
  }
  return (
    <>
      <p className="quiet-label">{items.length} установленных игр</p>
      {error && (
        <p role="alert" className="installer-error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="inspection">
          {message}
        </p>
      )}
      {running && (
        <p role="status" className="muted small">
          {running}
        </p>
      )}
      {!items.length && (
        <div className="empty-state">
          <h2>Здесь начнётся ваша история</h2>
          <p className="muted">
            Установленная Bloodborne появится здесь.{" "}
            {native
              ? "Импортируйте собственные игровые файлы в каталоге."
              : "WEB PREVIEW не устанавливает и не запускает игры."}
          </p>
          <Button onClick={onCatalog}>Открыть каталог</Button>
        </div>
      )}
      {items.map((item) => (
        <article key={item.id} className="library-install inspection">
          <div className="library-cover">
            <GameArt src={cover} label="Обложка Bloodborne" />
          </div>
          <div>
            <h2>Bloodborne</h2>
            <p>
              CUSA03173 ·{" "}
              {item.version
                ? `APP_VER ${item.version}`
                : "Версия не определена"}{" "}
              · SuperMedo windows-v1.9.4
            </p>
            <p className="small">Игровые данные: {item.dataPath}</p>
            <p className="small">Runtime: {item.runtimePath}</p>
            <p className="muted small">
              «Играть» запускает Bloodborne через проверенный runtime. Настройки
              и сохранения этой установки хранятся отдельно. «Настроить runtime»
              открывает мастер SuperMedo. Создание процесса не подтверждает
              загрузку игры.
            </p>
            <div className="media-actions">
              <Button
                disabled={busy}
                onClick={() => void action("launch_installation", item)}
              >
                Играть
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => void action("launch_installation", item, true)}
              >
                Настроить runtime
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => void action("verify_installation", item)}
              >
                Проверить целостность
              </Button>
              <Button
                variant="danger"
                disabled={busy}
                onClick={() => setRemove(item)}
              >
                Удалить
              </Button>
            </div>
            {busy && verifying && (
              <Button
                variant="ghost"
                onClick={() =>
                  void invoke("cancel_install").catch((e) =>
                    setError(String(e)),
                  )
                }
              >
                Отменить проверку
              </Button>
            )}
          </div>
        </article>
      ))}
      <Modal
        open={!!remove}
        onOpenChange={(v) => {
          if (!v) setRemove(null);
        }}
        title="Удалить установленную Bloodborne?"
        description="Будут удалены только игровые файлы, скопированные PORT. Исходная папка, сохранения, настройки runtime и неизвестные файлы сохранятся."
      >
        <p className="small">{remove?.dataPath}</p>
        <div className="media-actions">
          <Button
            variant="danger"
            disabled={busy}
            onClick={() => {
              const item = remove;
              setRemove(null);
              if (item) void action("remove_installation", item);
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
