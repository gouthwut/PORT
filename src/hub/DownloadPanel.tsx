import { useEffect, useRef, useState } from "react";
import { CheckCircle2, X } from "lucide-react";
import type { DownloadState } from "./downloads";
import { Button } from "../components/ui";
import "./downloads.css";

const bytes = (n: number) =>
  n >= 1024 ** 3
    ? `${(n / 1024 ** 3).toFixed(2)} ГиБ`
    : `${(n / 1024 ** 2).toFixed(1)} МиБ`;
export function DownloadPanel({ state }: { state: DownloadState }) {
  const s = state.status;
  const [dismissed, setDismissed] = useState(false);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (!dismissed) return;
    const timer = setTimeout(() => setHidden(true), 200);
    return () => clearTimeout(timer);
  }, [dismissed]);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const remaining = useRef(7000);
  const panel = useRef<HTMLElement | null>(null);
  const identity = [s?.phase, s?.name, s?.path, state.error, state.busy].join(
    "|",
  );
  useEffect(() => {
    remaining.current = 7000;
    setDismissed(false);
    setHidden(false);
    setFocused(!!panel.current?.contains(document.activeElement));
    if (!panel.current) setHovered(false);
  }, [identity]);
  useEffect(() => {
    if (
      s?.phase !== "completed" ||
      state.busy ||
      state.error ||
      hovered ||
      focused ||
      interacting ||
      dismissed
    )
      return;
    const started = Date.now();
    const timer = setTimeout(() => setDismissed(true), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(
        0,
        remaining.current - (Date.now() - started),
      );
    };
  }, [
    identity,
    s?.phase,
    state.busy,
    state.error,
    hovered,
    focused,
    interacting,
    dismissed,
  ]);
  const visible = !hidden && (!!s?.phase || !!state.error);
  return (
    <>
      {visible && (
        <aside
          ref={panel}
          className={`port-download-panel${dismissed ? " is-closing" : ""}`}
          aria-label="Загрузка файла"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onFocusCapture={() => setFocused(true)}
          onBlurCapture={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false);
          }}
        >
          {!state.busy && (
            <button
              className="icon-button download-dismiss"
              aria-label="Закрыть уведомление"
              onClick={() => setDismissed(true)}
            >
              <X size={16} />
            </button>
          )}
          <strong>
            {s?.phase === "completed"
              ? "Загрузка завершена"
              : s?.phase === "error"
                ? "Ошибка загрузки"
                : s?.phase === "cancelled"
                  ? "Загрузка отменена"
                  : "Загрузка файла"}
          </strong>
          {s?.name && <p className="download-name">{s.name}</p>}
          {s?.phase === "completed" && (
            <p className="download-success" role="status">
              <CheckCircle2 size={16} aria-hidden="true" /> Файл сохранён
            </p>
          )}
          {s?.phase === "downloading" && (
            <>
              <progress
                aria-label="Прогресс скачивания"
                max={s.total ?? undefined}
                value={s.total ? s.completed : undefined}
              />
              <p>
                {bytes(s.completed)}
                {s.total
                  ? ` / ${bytes(s.total)} · ${Math.floor((s.completed / s.total) * 100)}%`
                  : " · размер неизвестен"}{" "}
                · {bytes(s.speed)}/с
              </p>
            </>
          )}
          {s?.phase !== "completed" && <p role="status">{s?.message}</p>}
          {state.error && <p role="alert">{state.error}</p>}
          {state.busy && s?.phase !== "selecting" && (
            <Button variant="secondary" onClick={() => void state.cancel()}>
              Отменить загрузку
            </Button>
          )}
          {s?.phase === "completed" && (
            <Button
              variant="secondary"
              onClick={async () => {
                setInteracting(true);
                try {
                  await state.open();
                } finally {
                  setInteracting(false);
                }
              }}
            >
              Открыть папку
            </Button>
          )}
        </aside>
      )}
    </>
  );
}
