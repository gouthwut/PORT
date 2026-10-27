import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "./ui";
import { native } from "../services/settings";

interface Inspection {
  format: string;
  contentId: string;
  titleId: string;
  region: string;
  version: string | null;
  packageType: string;
  size: number;
  compatible: boolean;
  reason: string;
}
interface DownloadStatus {
  phase: string;
  completed: number;
  total: number;
  speed: number;
  message: string;
  path: string | null;
  active: boolean;
}
const mb = (n: number) => (n / 1024 / 1024).toFixed(1);
export function InstallerPanel() {
  const [result, setResult] = useState<Inspection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const guard = useRef(false);
  async function choose() {
    if (guard.current) return;
    guard.current = true;
    setBusy(true);
    setError("");
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const path = await open({
        multiple: false,
        directory: false,
        title:
          "Выберите собственный PKG Bloodborne — только проверка метаданных",
        filters: [{ name: "PS4 PKG", extensions: ["pkg"] }],
      });
      if (typeof path === "string") {
        setResult(null);
        setResult(await invoke<Inspection>("inspect_package", { path }));
      }
    } catch (e) {
      setError(String(e));
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="installer-section">
      <h3>01 · Проверка вашего PKG</h3>
      <p className="muted small">
        Только чтение заголовка и доступного PARAM.SFO. Исходный файл не
        изменяется и не отправляется на серверы. Это ещё не проверка целостности
        игровых данных.
      </p>
      <Button disabled={!native || busy} onClick={() => void choose()}>
        {busy ? "Ожидание выбора / проверка…" : "Выбрать PKG"}
      </Button>
      {!native && (
        <p className="muted small">
          Выбор PKG доступен в Windows-приложении. WEB PREVIEW не читает игровые
          файлы.
        </p>
      )}
      {error && (
        <p className="installer-error" role="alert">
          {error}
        </p>
      )}
      {result && (
        <div className="inspection" role="status">
          <dl>
            <dt>Формат</dt>
            <dd>{result.format}</dd>
            <dt>Тип</dt>
            <dd>{result.packageType}</dd>
            <dt>Content ID / Title ID</dt>
            <dd>
              {result.contentId} / {result.titleId}
            </dd>
            <dt>Регион</dt>
            <dd>{result.region}</dd>
            <dt>Версия приложения</dt>
            <dd>{result.version || "Недоступна в открытых метаданных"}</dd>
            <dt>Размер</dt>
            <dd>{mb(result.size)} МБ</dd>
          </dl>
          <p>{result.reason}</p>
        </div>
      )}
      <div className="dialog-note">
        <p>
          Автоматическое извлечение PKG заблокировано: исследованный экстрактор
          пишет пути из пакета без подтверждённой защиты от выхода из папки.
          Подключать его к вашим файлам пока нельзя. Подготовленная папка — путь
          для следующей интеграции; её импорт и установка ещё недоступны.
        </p>
      </div>
      <h3>02 · Компоненты Windows-проекта</h3>
      <DownloadPanel />
      <h3>03 · Установка и запуск</h3>
      <p className="muted small">
        Выбор папки, извлечение, регистрация в библиотеке и запуск остаются
        недоступны до устранения блокера экстрактора и проверки игровых данных.
        Скачанный архив сам по себе не добавляет игру в библиотеку.
      </p>
    </div>
  );
}
export function DownloadPanel() {
  const [status, setStatus] = useState<DownloadStatus | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const guard = useRef(false);
  useEffect(() => {
    if (!native) return;
    let active = true;
    const read = async () => {
      try {
        const s = await invoke<DownloadStatus>("download_status");
        if (active) setStatus(s);
      } catch (e) {
        if (active) setError(String(e));
      }
    };
    void read();
    const timer = setInterval(() => void read(), 600);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  async function action(a: string) {
    if (guard.current) return;
    guard.current = true;
    setBusy(true);
    setError("");
    try {
      if (a === "start") await invoke("start_download");
      else await invoke("control_download", { action: a });
      setStatus(await invoke<DownloadStatus>("download_status"));
    } catch (e) {
      setError(String(e));
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }
  const labels: Record<string, string> = {
    idle: "Ожидание",
    connecting: "Проверка релиза",
    downloading: "Загрузка",
    paused: "Пауза",
    verifying: "Проверка архива",
    ready: "Архив проверен",
    cancelled: "Отменено",
    error: "Ошибка",
  };
  return (
    <section
      className="installer-section runtime-download"
      aria-label="Загрузка компонентов"
    >
      <p className="muted small">
        SuperMedo · windows-v1.9.4 · 180.5 МБ · официальный GitHub Releases.
        SHA-256 закреплён в PORT. Оригинальные игровые данные не загружаются.
      </p>
      {status && (
        <>
          <p role="status">
            {labels[status.phase] || status.phase} · {status.message}
          </p>
          <progress
            aria-label="Компоненты Windows-проекта"
            max={status.total}
            value={status.completed}
          />
          <p className="muted small">
            {mb(status.completed)} / {mb(status.total)} МБ · {mb(status.speed)}{" "}
            МБ/с
          </p>
          {status.path && <p className="inspection">{status.path}</p>}
        </>
      )}
      <div className="media-actions">
        <Button
          disabled={!native || busy || !!status?.active}
          onClick={() => void action("start")}
        >
          {status?.phase === "error"
            ? "Повторить / продолжить"
            : status?.phase === "ready"
              ? "Проверить кэш"
              : "Скачать компоненты"}
        </Button>
        <Button
          variant="secondary"
          disabled={
            busy || !status || !["downloading", "paused"].includes(status.phase)
          }
          onClick={() =>
            void action(status?.phase === "paused" ? "resume" : "pause")
          }
        >
          {status?.phase === "paused" ? "Продолжить" : "Пауза"}
        </Button>
        <Button
          variant="secondary"
          disabled={busy || !status?.active}
          onClick={() => void action("cancel")}
        >
          Отменить загрузку
        </Button>
      </div>
      <p className="muted small">
        Возобновление через HTTP Range; если сервер его не поддерживает,
        скачивание начнётся заново. Пауза и отмена применяются после текущего
        чтения (сетевой таймаут до 120 с). Ошибка сети сохраняет частичный файл
        для повтора. Готовый архив не распаковывается и не запускается.
      </p>
      {!native && (
        <p className="muted small">
          WEB PREVIEW · реальные загрузки доступны только в Windows-приложении.
        </p>
      )}
      {error && (
        <p role="alert" className="installer-error">
          {error}
        </p>
      )}
    </section>
  );
}
