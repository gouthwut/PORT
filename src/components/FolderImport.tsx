import { useEffect, useRef, useState } from "react";
import { FolderOpen, Monitor, Check } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { native } from "../services/settings";
import { Button } from "./ui";
import type { InstallationDestination } from "../domain";

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
  packageBytes = 0,
  sourceKind = "folder",
}: {
  sourceKind?: "folder" | "xbox360-iso";
  packagePaths?: string[];
  defaultParent?: string;
  packageBytes?: number;
}) {
  const iso = sourceKind === "xbox360-iso";
  const [folder, setFolder] = useState<Folder | null>(null);
  const [parent, setParent] = useState(defaultParent);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<Status | null>(null);
  const [pkgAvailable, setPkgAvailable] = useState(false);
  const [shortcut, setShortcut] = useState(false);
  const [destination, setDestination] =
    useState<InstallationDestination | null>(null);
  const [checking, setChecking] = useState(false);
  const [pathError, setPathError] = useState("");
  const guard = useRef(false);
  useEffect(() => {
    if (native && !defaultParent)
      void invoke<string>("default_install_parent")
        .then(setParent)
        .catch(() => {});
  }, [defaultParent]);
  const sourceReady = !!packagePaths.length || !!folder;
  const bytes = Math.max(folder?.bytes ?? 0, packageBytes);
  useEffect(() => {
    setDestination(null);
    setPathError("");
    if (!native || !parent || !sourceReady) return;
    let active = true;
    setChecking(true);
    const timer = setTimeout(() => {
      void invoke<InstallationDestination>("check_install_destination", {
        parent,
        bytes,
        adapterId: iso ? "skate3" : "bloodborne",
      })
        .then((d) => {
          if (active) setDestination(d);
        })
        .catch((e) => {
          if (active) setPathError(String(e));
        })
        .finally(() => {
          if (active) setChecking(false);
        });
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [parent, sourceReady, bytes, iso]);
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
    if (guard.current || status?.active) return;
    guard.current = true;
    setBusy(true);
    setError("");
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const p = await open({
        directory: !(source && iso),
        filters:
          source && iso
            ? [{ name: "Xbox 360 ISO", extensions: ["iso"] }]
            : undefined,
        multiple: false,
        title:
          source && iso
            ? "Skate 3 — Xbox 360 ISO"
            : source
              ? "Bloodborne — папка с eboot.bin, sce_module, sce_sys, dvdroot_ps4"
              : "Отдельная папка назначения PORT (вне исходной папки)",
      });
      if (typeof p === "string") {
        if (source) {
          setFolder(null);
          const info = await invoke<Folder>(
            iso ? "inspect_skate3_iso" : "inspect_game_folder",
            { path: p },
          );
          setFolder({ ...info, path: p });
        } else setParent(p);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }
  async function action(command: string) {
    if (guard.current) return;
    guard.current = true;
    setBusy(true);
    setError("");
    try {
      await invoke(command, {
        parent,
        source: folder?.path,
        paths: packagePaths,
        destinationId: destination?.id,
        desktopShortcut: shortcut,
      });
      setStatus(await invoke<Status>("install_status"));
    } catch (e) {
      setError(String(e));
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }
  const locked = busy || !!status?.active;
  return (
    <section
      className="installer-section"
      aria-label={
        iso ? "Установка из Xbox 360 ISO" : "Импорт подготовленной папки"
      }
    >
      {iso && (
        <>
          <h3>01 · Xbox 360 ISO</h3>
          <Button
            disabled={!native || locked}
            onClick={() => void choose(true)}
          >
            Выбрать Xbox 360 ISO
          </Button>
        </>
      )}
      <h3>02 · Место установки</h3>
      <p className="muted small">
        {sourceReady
          ? "Выберите, где хранить игру и её компоненты."
          : iso
            ? "Выберите собственный Xbox 360 ISO Skate 3."
            : "Сначала выберите PKG или подготовленную папку игры."}
      </p>
      <label className="install-field-label" htmlFor="install-parent">
        Папка установки
      </label>
      <div className="install-path-field">
        <FolderOpen size={18} aria-hidden="true" />
        <input
          id="install-parent"
          value={parent}
          placeholder="Выберите папку на диске"
          disabled={!native || locked || !sourceReady}
          onChange={(e) => setParent(e.target.value)}
          spellCheck={false}
        />
        <Button
          variant="secondary"
          aria-label="Выбрать папку назначения"
          disabled={!native || locked || !sourceReady}
          onClick={() => void choose(false)}
        >
          Обзор
        </Button>
      </div>
      {checking && sourceReady && (
        <p role="status" className="muted small">
          Проверяем папку и свободное место…
        </p>
      )}
      {pathError && (
        <p role="alert" className="installer-error">
          {pathError}
        </p>
      )}
      {destination && (
        <div className="install-destination">
          <span className="quiet-label">ИТОГОВОЕ РАСПОЛОЖЕНИЕ</span>
          <p>{destination.root}</p>
          <span className="muted small">
            Нужно {(destination.required / 1024 ** 3).toFixed(1)} ГиБ · свободно{" "}
            {(destination.available / 1024 ** 3).toFixed(1)} ГиБ
          </span>
        </div>
      )}
      <h3>03 · Всё готово к установке</h3>
      <label className={`install-shortcut ${shortcut ? "checked" : ""}`}>
        <input
          type="checkbox"
          checked={shortcut}
          onChange={(e) => setShortcut(e.target.checked)}
          disabled={!native || locked || !sourceReady}
        />
        <span className="install-check" aria-hidden="true">
          {shortcut && <Check size={15} />}
        </span>
        <span>
          <strong>Создать ярлык на рабочем столе</strong>
          <small>Быстрый запуск этой игры через PORT//</small>
        </span>
        <Monitor size={20} aria-hidden="true" />
      </label>
      {!iso && (
        <div className="media-actions">
          <Button
            disabled={
              !native ||
              locked ||
              !parent ||
              !packagePaths.length ||
              !pkgAvailable ||
              !destination ||
              checking
            }
            onClick={() => void action("install_packages")}
          >
            Проверить и установить основной PKG
          </Button>
          <Button
            disabled={!native || locked}
            onClick={() => void choose(true)}
          >
            Выбрать папку с файлами игры
          </Button>
        </div>
      )}
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
      {parent && !destination && (
        <p className="inspection">
          Назначение: {parent}. PORT создаст отдельную подпапку установки.
        </p>
      )}
      <div className="media-actions">
        <Button
          disabled={!native || locked || !folder || !destination || checking}
          onClick={() =>
            void action(iso ? "install_skate3" : "import_game_folder")
          }
        >
          {iso ? "Установить из ISO" : "Установить из папки"}
        </Button>
        {!iso && (
          <Button
            variant="secondary"
            disabled={!native || locked || !parent}
            onClick={() => void action("prepare_runtime")}
          >
            Подготовить только runtime
          </Button>
        )}
        <Button
          variant="secondary"
          disabled={!status?.active || busy || status.phase === "finishing"}
          onClick={() => void action("cancel_install")}
        >
          Отменить установку
        </Button>
      </div>
      <p className="muted small">
        {iso
          ? "Skate 3 Recomp v2.0.2 будет проверена по SHA-256. Официальный мастер запросит Title Update 3: завершите его, затем закройте игру для проверки и добавления в библиотеку. ISO остаётся без изменений. Сохранения: user-data."
          : "Компоненты Windows-проекта доступны ниже. Проверенный кэш работает без интернета. Подготовка только runtime не добавляет игру в библиотеку."}
      </p>
      {native && !iso && !pkgAvailable && (
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
                aria-label={iso ? "Установка Skate 3" : "Установка Bloodborne"}
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
