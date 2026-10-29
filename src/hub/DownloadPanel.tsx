import type { DownloadState } from "./downloads";
import { Button } from "../components/ui";
import "./downloads.css";

const bytes = (n: number) =>
  n >= 1024 ** 3
    ? `${(n / 1024 ** 3).toFixed(2)} ГиБ`
    : `${(n / 1024 ** 2).toFixed(1)} МиБ`;
export function DownloadPanel({ state }: { state: DownloadState }) {
  const s = state.status;
  if ((!s || !s.phase) && !state.error) return null;
  return (
    <aside className="port-download-panel" aria-label="Загрузка файла">
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
      {s?.path && <p aria-label="Путь сохранения">{s.path}</p>}
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
      <p role="status">{s?.message}</p>
      {state.error && <p role="alert">{state.error}</p>}
      {state.busy && s?.phase !== "selecting" && (
        <Button variant="secondary" onClick={() => void state.cancel()}>
          Отменить загрузку
        </Button>
      )}
      {s?.phase === "completed" && (
        <Button variant="secondary" onClick={() => void state.open()}>
          Открыть папку
        </Button>
      )}
    </aside>
  );
}
