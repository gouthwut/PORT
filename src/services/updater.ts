import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { version } from "../../package.json";
import { native } from "./settings";

export { version as appVersion };
export interface UpdateStatus {
  phase: string;
  currentVersion: string;
  channel: string;
  version: string | null;
  notes: string;
  completed: number;
  total: number | null;
  downloaded: boolean;
  message: string;
}
const initial: UpdateStatus = {
  phase: native ? "checking" : "preview",
  currentVersion: version,
  channel: "",
  version: null,
  notes: "",
  completed: 0,
  total: null,
  downloaded: false,
  message: "",
};
export function useUpdater() {
  const [status, setStatus] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!native) return;
    let active = true;
    let reading = false;
    const read = async () => {
      if (reading) return;
      reading = true;
      try {
        const value = await invoke<UpdateStatus>("updater_status");
        if (active && value?.currentVersion) setStatus(value);
      } catch {
        if (active) setError("Не удалось получить состояние обновлений.");
      } finally {
        reading = false;
      }
    };
    void read();
    const timer = setInterval(() => void read(), 750);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  const run = async (command: string, args?: Record<string, unknown>) => {
    if (pending || !native) return;
    setPending(true);
    setError("");
    try {
      await invoke(command, args);
    } catch (e) {
      setError(
        typeof e === "string"
          ? e
          : "Операция обновления не завершена. Повторите попытку.",
      );
    } finally {
      try {
        const value = await invoke<UpdateStatus>("updater_status");
        if (value?.currentVersion) setStatus(value);
      } catch {
        /* Keep the last known status. */
      }
      setPending(false);
    }
  };
  return { status, pending, error, run };
}
export type UpdaterState = ReturnType<typeof useUpdater>;
