import { invoke } from "@tauri-apps/api/core";
import type { GameState } from "../services/game-state";
import { Button } from "./ui";

export function GameAction({
  state,
  collectionId,
  installationId,
  onInstall,
}: {
  state: GameState;
  collectionId: string;
  installationId?: string;
  onInstall: () => void;
}) {
  const item = state.items.find((i) =>
    installationId ? i.id === installationId : i.collectionId === collectionId,
  );
  const running = item && state.running.includes(item.id);
  const active = state.operation?.active;
  const installing =
    active &&
    (!item ||
      [
        "copying",
        "extracting",
        "downloading",
        "validating",
        "preparing",
        "hashing",
        "installing",
        "updating",
        "finalizing",
      ].includes(state.operation!.phase));
  return (
    <div className="game-primary-action">
      <Button
        disabled={
          !state.ready ||
          !!state.loadError ||
          state.busy ||
          !!running ||
          !!active
        }
        onClick={() =>
          item ? void state.action("launch_installation", item) : onInstall()
        }
      >
        {!state.ready
          ? "Загрузка…"
          : running
            ? "Уже запущена"
            : installing
              ? state.operation?.phase === "updating" ||
                state.operation?.phase === "finalizing"
                ? "Обновление…"
                : "Установка…"
              : state.busy
                ? "Подождите…"
                : item
                  ? "Играть"
                  : "Установить"}
      </Button>
      {installing && (
        <div className="game-install-progress">
          <progress
            aria-label="Прогресс установки"
            max={state.operation!.total || undefined}
            value={
              state.operation!.total
                ? Math.min(state.operation!.completed, state.operation!.total)
                : undefined
            }
          />
          {state.operation!.total > 0 && (
            <span>
              {Math.floor(
                (state.operation!.completed / state.operation!.total) * 100,
              )}
              %
            </span>
          )}
          <Button
            variant="ghost"
            disabled={state.operation?.phase === "finalizing"}
            onClick={() =>
              void invoke("cancel_install")
                .then(state.refresh)
                .catch(() => onInstall())
            }
          >
            {state.operation?.phase === "updating" ||
            state.operation?.phase === "finalizing"
              ? "Отменить обновление"
              : "Отменить установку"}
          </Button>
        </div>
      )}
      {state.operation?.phase === "error" && (
        <p className="muted small">
          Установка не завершена.{" "}
          {state.operation.message || "Повторите выбор файлов."}
        </p>
      )}
    </div>
  );
}
