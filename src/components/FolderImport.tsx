import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { native } from "../services/settings";
import { Button } from "./ui";

interface Folder {
  path: string;
  version: string | null;
  titleId: string;
  files: number;
  bytes: number;
  warning: string;
}
interface Status {
  phase: string;
  active: boolean;
  completed: number;
  total: number;
  message: string;
}
export function FolderImport({
  packagePaths = [],
  defaultParent = "",
}: {
  packagePaths?: string[];
  defaultParent?: string;
}) {
  const [folder, setFolder] = useState<Folder | null>(null);
  const [parent, setParent] = useState(defaultParent);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<Status | null>(null);
  const [pkgAvailable, setPkgAvailable] = useState(false);
  useEffect(() => {
    if (!native) return;
    void invoke<boolean>("pkg_install_available")
      .then(setPkgAvailable)
      .catch(() => setPkgAvailable(false));
    let mounted = true;
    const read = () =>
      void invoke<Status>("install_status")
        .then((s) => {
          if (mounted) setStatus(s);
        })
        .catch((e) => {
          if (mounted) setError(String(e));
        });
    read();
    const timer = setInterval(read, 500);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);
  async function choose(source: boolean) {
    if (busy || status?.active) return;
    setBusy(true);
    setError("");
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const p = await open({
        directory: true,
        multiple: false,
        title: source
          ? "Bloodborne — папка с eboot.bin, sce_module, sce_sys, dvdroot_ps4"
          : "Отдельная папка назначения PORT (вне исходной папки)",
      });
      if (typeof p === "string") {
        if (source) {
          setFolder(null);
          setFolder(await invoke<Folder>("inspect_game_folder", { path: p }));
        } else setParent(p);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function action(command: string) {
    setBusy(true);
    setError("");
    try {
      await invoke(command, {
        parent,
        source: folder?.path,
        paths: packagePaths,
      });
      setStatus(await invoke<Status>("install_status"));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  const locked = busy || !!status?.active;
  return (
    <section
      className="installer-section"
      aria-label="Импорт подготовленной папки"
    >
      <h3>03 · Источник → Установка</h3>
      <p className="muted small">
        Собственная подготовленная папка CUSA03173: eboot.bin, sce_module,
        sce_sys/param.sfo, dvdroot_ps4. Копирование в отдельную установку с
        SHA-256; исходная папка не изменяется. Уже применённое обновление
        повторно не устанавливается.
      </p>
      <div className="media-actions">
        <Button
          disabled={
            !native ||
            locked ||
            !parent ||
            !packagePaths.length ||
            !pkgAvailable
          }
          onClick={() => void action("install_packages")}
        >
          Проверить и установить основной PKG
        </Button>
        <Button disabled={!native || locked} onClick={() => void choose(true)}>
          Выбрать папку с файлами игры
        </Button>
        <Button
          variant="secondary"
          disabled={!native || locked}
          onClick={() => void choose(false)}
        >
          Выбрать папку назначения
        </Button>
      </div>
      {!native && (
        <p className="muted small">
          Импорт, подготовка runtime и запуск доступны только в
          Windows-приложении.
        </p>
      )}
      {folder && (
        <div className="inspection">
          <p>{folder.path}</p>
          <p>
            {folder.titleId} ·{" "}
            {folder.version
              ? `APP_VER ${folder.version}`
              : "Версия не определена"}{" "}
            · {folder.files} файлов · {(folder.bytes / 1024 ** 3).toFixed(2)}{" "}
            ГиБ
          </p>
          <p>{folder.warning}</p>
        </div>
      )}
      {parent && (
        <p className="inspection">
          Назначение: {parent}. PORT создаст отдельную подпапку установки.
        </p>
      )}
      <div className="media-actions">
        <Button
          disabled={!native || locked || !folder || !parent}
          onClick={() => void action("import_game_folder")}
        >
          Установить из папки
        </Button>
        <Button
          variant="secondary"
          disabled={!native || locked || !parent}
          onClick={() => void action("prepare_runtime")}
        >
          Подготовить только runtime
        </Button>
        <Button
          variant="secondary"
          disabled={!status?.active || busy}
          onClick={() => void action("cancel_install")}
        >
          Отменить установку
        </Button>
      </div>
      <p className="muted small">
        Сначала скачайте компоненты выше. Проверенный кэш работает без
        интернета. Подготовка только runtime не добавляет игру в библиотеку.
      </p>
      {native && !pkgAvailable && (
        <p className="muted small">
          Эта сборка не содержит PKG worker; импорт собственной папки доступен.
        </p>
      )}
      {error && (
        <p role="alert" className="installer-error">
          {error}
        </p>
      )}
      {status?.phase && (
        <div
          role={status.phase === "error" ? "alert" : "status"}
          className="inspection"
        >
          <p>{status.message || status.phase}</p>
          {status.active && status.total > 0 && (
            <>
              <progress
                aria-label="Установка Bloodborne"
                max={status.total}
                value={Math.min(status.completed, status.total)}
              />
              <p className="small">
                {(status.completed / 1024 ** 3).toFixed(2)} /{" "}
                {(status.total / 1024 ** 3).toFixed(2)} ГиБ
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
