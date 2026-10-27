import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "./ui";
import { native } from "../services/settings";
import { FolderImport } from "./FolderImport";
import { GameArt } from "./BloodborneMedia";

interface Inspection {
  format: string;
  contentId: string;
  titleId: string;
  region: string;
  version: string | null;
  packageType: string;
  role: string;
  category: string | null;
  pfsEncrypted: boolean | null;
  size: number;
  compatible: boolean;
  reason: string;
}
interface Selection {
  items: {
    fileName: string;
    inspection: Inspection | null;
    error: string | null;
  }[];
  metadataCompatible: boolean;
  installable: boolean;
  issues: string[];
  summary: string;
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
export function InstallerPanel({
  installDir = "",
  artwork = "",
}: {
  installDir?: string;
  artwork?: string;
}) {
  const [result, setResult] = useState<Selection | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [error, setError] = useState("");
  const guard = useRef(false);
  useEffect(() => {
    if (native) void choose();
  }, []);
  async function choose() {
    if (guard.current) return;
    guard.current = true;
    setBusy(true);
    setError("");
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const paths = await open({
        multiple: true,
        directory: false,
        title:
          "Bloodborne — выберите основной PKG и, при наличии, обновление (Ctrl / Shift)",
        filters: [{ name: "PS4 PKG", extensions: ["pkg"] }],
      });
      if (paths && (typeof paths === "string" || paths.length)) {
        setSelectedPaths(typeof paths === "string" ? [paths] : paths);
        setResult(null);
        setResult(
          await invoke<Selection>("inspect_packages", {
            paths: typeof paths === "string" ? [paths] : paths,
          }),
        );
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
      <div className="install-banner">
        <GameArt src={artwork} label="Bloodborne" />
        <div>
          <span className="eyebrow">ВАША СЛЕДУЮЩАЯ ИСТОРИЯ</span>
          <h2>Bloodborne</h2>
          <p>Свои файлы. Новая история.</p>
        </div>
      </div>
      <ol className="install-flow" aria-label="Порядок установки">
        <li className={result?.metadataCompatible ? "complete" : "current"}>
          <span>01</span>PKG
        </li>
        <li className={result?.metadataCompatible ? "current" : ""}>
          <span>02</span>Папка
        </li>
        <li>
          <span>03</span>Ярлык
        </li>
        <li>
          <span>04</span>Установка
        </li>
      </ol>
      <h3>01 · Выбор игровых файлов</h3>
      <p className="muted small">
        Выберите основной PKG. Если есть обновление, его можно выбрать вместе с
        игрой через Ctrl / Shift для проверки. Исходные файлы не изменяются и не
        отправляются в сеть. Обновление устанавливается отдельно, после основной
        игры.
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
          {result.items.map(({ fileName, inspection: p, error }, i) => (
            <section key={i} className="package-component">
              <h4>
                {p?.role === "base"
                  ? "Bloodborne — основная игра"
                  : p?.role === "update"
                    ? `Bloodborne — обновление ${p.version || "?"}`
                    : "Пакет не подтверждён"}
              </h4>
              <p className="small">{fileName}</p>
              {error && <p role="alert">{error}</p>}
              {p && (
                <details>
                  <summary>Сведения о пакете</summary>
                  <dl>
                    <dt>Формат / тип</dt>
                    <dd>
                      {p.format} · {p.packageType} · CATEGORY{" "}
                      {p.category || "?"}
                    </dd>
                    <dt>Content ID / Title ID</dt>
                    <dd>
                      {p.contentId} / {p.titleId}
                    </dd>
                    <dt>Регион</dt>
                    <dd>{p.region}</dd>
                    <dt>Версия / размер</dt>
                    <dd>
                      {p.version || "Версия недоступна"} · {mb(p.size)} МБ
                    </dd>
                    <dt>Содержимое PFS</dt>
                    <dd>
                      {p.pfsEncrypted === true
                        ? "Флаг шифрования установлен; поддерживаемый механизм проверяется при установке"
                        : p.pfsEncrypted === false
                          ? "Флаг шифрования не установлен; извлечение ещё не проверено"
                          : "Не определено"}
                    </dd>
                  </dl>
                </details>
              )}
            </section>
          ))}
          <p>{result.summary}</p>
          {result.issues.length > 0 && (
            <ul>
              {result.issues.map((issue, i) => (
                <li key={i}>{issue}</li>
              ))}
            </ul>
          )}
          <p className="muted small">
            Проверка метаданных не проверяет подпись и полную целостность PKG.
            Установка не выполнена.
          </p>
        </div>
      )}
      <details className="dialog-note">
        <summary>Совместимость и ограничения PKG</summary>
        <p>
          Только чтение заголовка и доступного PARAM.SFO при выборе пакетов.
          Флаг PFS сам по себе не определяет доступность содержимого. В сборке с
          проверенным PKG worker доступно извлечение совместимого основного
          fake/debug PKG. Другие механизмы и произвольные зашифрованные PKG не
          поддерживаются. Обновление выбирается для проверки совместимости, но
          не применяется: установленная версия определяется по данным. PORT не
          подбирает passcode и не обходит DRM.
        </p>
      </details>
      <FolderImport
        defaultParent={installDir}
        packagePaths={result?.metadataCompatible ? selectedPaths : []}
        packageBytes={
          result?.items
            .filter((i) => i.inspection?.role === "base")
            .reduce((n, i) => n + (i.inspection?.size || 0), 0) || 0
        }
      />
      <details className="install-components">
        <summary>Компоненты Windows-проекта</summary>
        <DownloadPanel />
      </details>
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
      <h3>Компоненты для Bloodborne</h3>
      <p className="muted small">
        SuperMedo · windows-v1.9.4 · 180.5 МБ. Игровые данные в загрузку не
        входят.
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
          {status.path && (
            <details className="technical-info">
              <summary>Расположение архива</summary>
              <p className="inspection">{status.path}</p>
            </details>
          )}
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
      <details className="technical-info">
        <summary>Источник и подробности загрузки</summary>
        <p className="muted small">
          Архив из официального GitHub Releases проекта SuperMedo; SHA-256
          закреплён в PORT. Возобновление через HTTP Range; если сервер его не
          поддерживает, скачивание начнётся заново. Пауза и отмена применяются
          после текущего чтения (сетевой таймаут до 120 с). Ошибка сети
          сохраняет частичный файл для повтора. Готовый архив не распаковывается
          и не запускается.
        </p>
      </details>
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
