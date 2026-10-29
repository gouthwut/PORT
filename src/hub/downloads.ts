import { useEffect, useState } from "react";
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
    status?.phase === "downloading";
  async function action(command: string) {
    setError("");
    try {
      await invoke(command);
    } catch (e) {
      setError(String(e));
    }
  }
  return {
    status,
    busy,
    error,
    async start(b: V2Build) {
      if (!native || busy || downloadUnavailable(b)) return;
      setStarting(true);
      setError("");
      try {
        await invoke("start_hub_download", {
          projectId: b.projectId,
          buildId: b.id,
        });
        setStatus(await invoke<DownloadStatus>("hub_download_status"));
      } catch (e) {
        setError(String(e));
      } finally {
        setStarting(false);
      }
    },
    cancel: () => action("cancel_hub_download"),
    open: () => action("open_hub_download_folder"),
  };
}
export type DownloadState = ReturnType<typeof useDownload>;
