import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Installation } from "../domain";
import { native } from "./settings";

export interface OperationStatus {
  recoveryError?: string;
  collectionId?: string;
  phase: string;
  active: boolean;
  completed: number;
  total: number;
  message: string;
}
export function useGameState() {
  const [items, setItems] = useState<Installation[]>([]);
  const [running, setRunning] = useState<string[]>([]);
  const [operation, setOperation] = useState<OperationStatus | null>(null);
  const [ready, setReady] = useState(!native);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const requestLock = useRef(false);
  async function refresh() {
    if (!native) return;
    const [records, processes, status] = await Promise.all([
      invoke<Installation[]>("list_installations"),
      invoke<string[]>("running_installations"),
      invoke<OperationStatus>("install_status"),
    ]);
    setItems(
      records.sort((a, b) => (b.version || "").localeCompare(a.version || "")),
    );
    setRunning(processes);
    setOperation(status);
    setReady(true);
    setLoadError("");
    if (!requestLock.current) {
      requestLock.current = true;
      try {
        const id = await invoke<string | null>("take_launch_request");
        if (id) {
          const item = records.find((r) => r.id === id);
          if (!item) setError("Игра из ярлыка не найдена в библиотеке PORT");
          else if (!lock.current) void action("launch_installation", item);
          else
            setError(
              "Дождитесь завершения текущей операции и запустите игру из библиотеки",
            );
        }
      } catch (e) {
        setError(String(e));
      } finally {
        requestLock.current = false;
      }
    }
  }
  useEffect(() => {
    if (!native) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        await refresh();
      } catch (e) {
        if (!disposed) setLoadError(String(e));
      }
      if (!disposed) timer = setTimeout(poll, 1000);
    }
    void poll();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, []);
  async function action(command: string, item: Installation, setup = false) {
    if (
      lock.current ||
      (command === "launch_installation" && running.includes(item.id))
    )
      return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await invoke<string>(command, {
        id: item.id,
        setup,
        confirmed: command === "remove_installation",
      });
      await refresh();
      return result;
    } catch (e) {
      setError(String(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return {
    items,
    running,
    operation,
    ready,
    error: loadError || error,
    loadError,
    busy,
    refresh,
    action,
  };
}
export type GameState = ReturnType<typeof useGameState>;
