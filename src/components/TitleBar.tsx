import { t } from "../hub/i18n";
import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Copy, Minus, Square, X } from "lucide-react";
import { native } from "../services/settings";
import "./titlebar.css";

export function TitleBar({ onError }: { onError: (message: string) => void }) {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    if (!native) return;
    let active = true;
    const refresh = async () => {
      try {
        const value = await getCurrentWindow().isMaximized();
        if (active) setMaximized(value);
      } catch {
        // Keep the controls usable if a window-state query fails.
      }
    };
    void refresh();
    window.addEventListener("resize", refresh);
    return () => {
      active = false;
      window.removeEventListener("resize", refresh);
    };
  }, []);

  async function control(action: "minimize" | "toggleMaximize" | "close") {
    try {
      const appWindow = getCurrentWindow();
      await appWindow[action]();
      if (action === "toggleMaximize")
        setMaximized(await appWindow.isMaximized());
    } catch {
      onError("Не удалось выполнить действие с окном. Повторите попытку.");
    }
  }

  return (
    <div className="port-titlebar" role="banner" aria-label={t("Окно PORT")}>
      <div className="port-titlebar-drag" data-tauri-drag-region>
        <span className="port-titlebar-brand" data-tauri-drag-region>
          PORT
        </span>
      </div>
      <div className="port-window-controls">
        {(
          [
            ["minimize", t("Свернуть окно"), Minus],
            [
              "toggleMaximize",
              maximized ? t("Восстановить окно") : t("Развернуть окно"),
              maximized ? Copy : Square,
            ],
            ["close", t("Закрыть окно"), X],
          ] as const
        ).map(([action, label, Icon]) => (
          <button
            key={action}
            type="button"
            className={action === "close" ? "port-window-close" : undefined}
            aria-label={t(label)}
            title={
              native
                ? label
                : `${t(label)} — ${t("Доступно в приложении Windows")}`
            }
            disabled={!native}
            onClick={() => void control(action)}
          >
            <Icon size={14} strokeWidth={1.5} aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  );
}
