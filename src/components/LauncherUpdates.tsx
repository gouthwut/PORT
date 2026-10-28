import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { native } from "../services/settings";
import type { UpdaterState } from "../services/updater";
import { Button, Modal } from "./ui";

const labels: Record<string, string> = {
  checking: "Проверка обновлений…",
  current: "Установлена актуальная версия",
  available: "Доступно обновление",
  downloading: "Загрузка обновления…",
  ready: "Обновление проверено и готово к установке",
  installing: "Запуск установщика…",
  error: "Обновление не завершено",
  unconfigured: "Официальный канал ещё не подключён",
  preview: "Обновления доступны в Windows-приложении",
};
export function LauncherUpdates({ state }: { state: UpdaterState }) {
  const [confirm, setConfirm] = useState(false);
  const { status, pending, error, run } = state;
  const busy =
    pending || ["checking", "downloading", "installing"].includes(status.phase);
  return (
    <section
      className="settings-section launcher-updates"
      aria-labelledby="updates-heading"
    >
      <h2 id="updates-heading">Обновления PORT//</h2>
      <div className="setting-row">
        <div>
          <h3>Текущая версия</h3>
          <p>{status.currentVersion}</p>
        </div>
        <Button
          variant="secondary"
          disabled={!native || busy || status.downloaded}
          onClick={() => void run("check_app_update")}
        >
          Проверить обновления
        </Button>
      </div>
      {status.channel === "isolated-test" && (
        <p className="muted">Изолированный тестовый канал</p>
      )}
      <p role="status" aria-live="polite">
        {labels[status.phase] || "Состояние обновлений недоступно"}
      </p>
      {status.version && (
        <p>
          Доступная версия: <strong>{status.version}</strong>
        </p>
      )}
      {status.notes && (
        <div className="update-notes">
          <h3>Что изменилось</h3>
          <p>{status.notes}</p>
        </div>
      )}
      {status.phase === "downloading" && (
        <>
          <progress
            aria-label="Загрузка обновления PORT"
            value={status.total ? status.completed : undefined}
            max={status.total || undefined}
          />
          <p className="muted">
            {(status.completed / 1048576).toFixed(1)} МБ
            {status.total
              ? ` из ${(status.total / 1048576).toFixed(1)} МБ`
              : ""}
          </p>
          <Button
            variant="secondary"
            onClick={() => void invoke("cancel_app_update").catch(() => {})}
          >
            Отменить загрузку
          </Button>
        </>
      )}
      {(error || (status.message && status.phase !== "unconfigured")) && (
        <p
          role={error || status.phase === "error" ? "alert" : undefined}
          className="muted"
        >
          {error || status.message}
        </p>
      )}
      {status.version && !status.downloaded && (
        <Button disabled={busy} onClick={() => void run("download_app_update")}>
          Загрузить обновление
        </Button>
      )}
      {status.downloaded && (
        <Button disabled={busy} onClick={() => setConfirm(true)}>
          Установить и перезапустить
        </Button>
      )}
      <Modal
        open={confirm}
        onOpenChange={setConfirm}
        title="Установить обновление PORT//?"
        description="PORT закроется на время установки и запустится снова. Сначала завершите операции с играми и закройте игровые окна. Библиотека, настройки и сохранения сохранятся."
      >
        <div className="dialog-actions">
          <Button variant="secondary" onClick={() => setConfirm(false)}>
            Позже
          </Button>
          <Button
            disabled={pending}
            onClick={() => {
              setConfirm(false);
              void run("install_app_update", { confirmed: true });
            }}
          >
            Подтвердить и перезапустить
          </Button>
        </div>
      </Modal>
    </section>
  );
}
