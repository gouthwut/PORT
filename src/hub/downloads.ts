import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { native } from "../services/settings";
import type { V2Build } from "./api-v2";

export function downloadUnavailable(b: V2Build): string | null {
  if (b.os !== "windows") return "Нужна сборка для Windows";
  if (b.availability !== "available")
    return "Доступность файла не подтверждена";
  if (!b.url) return "Файл сборки пока не опубликован";
  try {
    const u = new URL(b.url);
    const parts = u.pathname.split("/").slice(1);
    const name = parts[5] ?? "";
    if (
      u.protocol !== "https:" ||
      u.hostname !== "github.com" ||
      u.port ||
      u.username ||
      u.password ||
      u.search ||
      u.hash ||
      parts.length !== 6 ||
      parts.some((p) => !p) ||
      parts[2] !== "releases" ||
      parts[3] !== "download" ||
      !/^[a-z0-9_-][a-z0-9._-]{0,159}$/i.test(name) ||
      name.endsWith(".") ||
      /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)
    )
      return "Скачивание этого файла пока недоступно в PORT";
    return null;
  } catch {
    return "Файл сборки пока не опубликован";
  }
}
export interface DownloadStatus {
  id?: string;
  projectId?: string;
  buildId?: string;
  version?: string;
  arch?: string;
  channel?: string;
  projectName?: string;
  phase: string;
  name: string;
  completed: number;
  total: number | null;
  speed: number;
  message: string;
  path: string | null;
}
export function useDownload() {
  const [status, setStatus] = useState<DownloadStatus | null>(null);
  const [history, setHistory] = useState<DownloadStatus[]>([]);
  const lock = useRef(false);
  const historyPhase = useRef("");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!native) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await invoke<DownloadStatus>("hub_download_status");
        if (active) setStatus(next);
        const identity = `${next.id}:${next.phase}`;
        if (identity !== historyPhase.current) {
          const rows = await invoke<DownloadStatus[]>("hub_download_history");
          if (active) setHistory(rows ?? []);
          historyPhase.current = identity;
        }
      } catch {
        if (active) setError("Не удалось получить состояние загрузки.");
      } finally {
        if (active) timer = setTimeout(poll, 500);
      }
    };
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);
  const busy =
    starting ||
    status?.phase === "selecting" ||
    status?.phase === "checking" ||
    status?.phase === "downloading" ||
    status?.phase === "verifying";
  async function action(command: string, args?: Record<string, unknown>) {
    setError("");
    try {
      await invoke(command, args);
    } catch (e) {
      setError(
        typeof e === "string" && e.length < 500
          ? e
          : "Не удалось выполнить действие. Повторите попытку.",
      );
    }
  }
  return {
    status,
    history,
    busy,
    error,
    async start(b: V2Build, projectName?: string) {
      if (!native || busy || lock.current || downloadUnavailable(b)) return;
      lock.current = true;
      setStarting(true);
      setError("");
      try {
        await invoke("start_hub_download", {
          projectId: b.projectId,
          buildId: b.id,
          projectName,
        });
        setStatus(await invoke<DownloadStatus>("hub_download_status"));
      } catch (e) {
        setError(
          typeof e === "string" && e.length < 500
            ? e
            : "Не удалось выполнить действие. Повторите попытку.",
        );
      } finally {
        lock.current = false;
        setStarting(false);
      }
    },
    cancel: () => action("cancel_hub_download"),
    open: (id?: string) =>
      action("open_hub_download_folder", id ? { id } : undefined),
    async remove(id: string) {
      await action("remove_hub_download", { id });
      setHistory(
        (await invoke<DownloadStatus[]>("hub_download_history")) ?? [],
      );
    },
    async retry(row: DownloadStatus) {
      if (!row.projectId || !row.buildId || busy || lock.current) return;
      lock.current = true;
      setStarting(true);
      setError("");
      try {
        await invoke("start_hub_download", {
          projectId: row.projectId,
          buildId: row.buildId,
          projectName: row.projectName,
          repeat: true,
        });
        setStatus(await invoke<DownloadStatus>("hub_download_status"));
      } catch {
        setError(
          "Не удалось повторить загрузку. Проверьте доступность сборки.",
        );
      } finally {
        lock.current = false;
        setStarting(false);
      }
    },
  };
}
export type DownloadState = ReturnType<typeof useDownload>;
