import type { DownloadState, DownloadStatus } from "./downloads";
import { Button } from "../components/ui";
import "./downloads.css";

const labels: Record<string, string> = {
  checking: "Проверка сборки",
  selecting: "Выбор папки",
  downloading: "Скачивание",
  verifying: "Проверка целостности",
  completed: "Загрузка завершена",
  cancelled: "Загрузка отменена",
  interrupted: "Загрузка прервана",
  error: "Ошибка загрузки",
};
const bytes = (n: number) => `${(n / 1024 ** 2).toFixed(1)} MiB`;
export function DownloadsCenter({ state }: { state: DownloadState }) {
  const rows = state.history.filter((r) => r.id !== state.status?.id);
  if (
    state.status?.phase &&
    (state.busy || state.history.some((r) => r.id === state.status?.id))
  )
    rows.unshift(state.status);
  return (
    <section className="hub-catalog downloads-center">
      <div className="page-heading">
        <h1>
          Загрузки<span className="accent">.</span>
        </h1>
      </div>
      <p className="muted">
        Официальные архивы проектов. Установка и запуск — вручную.
      </p>
      {state.busy && (
        <p role="status">
          Перед закрытием PORT завершите или отмените загрузку. Повторная
          попытка начнётся с начала.
        </p>
      )}
      {state.error && <p role="alert">{state.error}</p>}
      {!rows.length && (
        <p className="hub-catalog-empty">История загрузок пока пуста</p>
      )}
      {rows.map((r, i) => (
        <DownloadRow key={r.id || i} row={r} state={state} />
      ))}
    </section>
  );
}
function DownloadRow({
  row: r,
  state,
}: {
  row: DownloadStatus;
  state: DownloadState;
}) {
  const active = ["checking", "selecting", "downloading", "verifying"].includes(
    r.phase,
  );
  const seconds =
    r.speed > 0 && r.total && r.completed < r.total
      ? Math.ceil((r.total - r.completed) / r.speed)
      : null;
  return (
    <article className="download-history-row">
      <h2>{r.projectName || r.projectId || r.name}</h2>
      <p>
        {r.version} {r.name && `· ${r.name}`}
      </p>
      <strong role="status">{labels[r.phase] || "Загрузка файла"}</strong>
      {r.phase === "downloading" && (
        <>
          <progress
            aria-label="Прогресс скачивания"
            max={r.total || undefined}
            value={r.total ? r.completed : undefined}
          />
          <p>
            {bytes(r.completed)}
            {r.total ? ` / ${bytes(r.total)}` : ""}
            {r.speed > 0 ? ` · ${bytes(r.speed)}/s` : ""}
            {seconds ? ` · ≈ ${seconds}s` : ""}
          </p>
        </>
      )}
      {r.message && r.phase !== "completed" && <p>{r.message}</p>}
      {r.phase === "completed" && r.path && (
        <p className="download-path">{r.path}</p>
      )}
      <div className="download-history-actions">
        {active && r.phase !== "selecting" && (
          <Button variant="secondary" onClick={() => void state.cancel()}>
            Отменить загрузку
          </Button>
        )}
        {!active && r.projectId && r.buildId && (
          <Button
            variant="secondary"
            disabled={state.busy}
            onClick={() => void state.retry(r)}
          >
            Повторить
          </Button>
        )}
        {r.phase === "completed" && (
          <Button variant="secondary" onClick={() => void state.open(r.id)}>
            Открыть папку
          </Button>
        )}
        {!active && r.id && (
          <Button variant="ghost" onClick={() => void state.remove(r.id!)}>
            Убрать из истории
          </Button>
        )}
      </div>
    </article>
  );
}
