import { useEffect, useRef, useState } from "react";
import { FolderOpen, Check } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { native } from "../services/settings";
import { Button } from "./ui";

/** Mirrors RecipeSummary in src-tauri/src/recipe.rs (camelCase). */
export interface RecipeSummary {
  id: string;
  collectionId: string;
  title: string;
  supported: boolean;
  reason: string | null;
  sourceKind: string | null;
  titleId: string | null;
  requiredFiles: string[];
  dependencies: string[];
  runtimeSize: number;
  sources?: {
    role: string;
    required: boolean;
    repeatable: boolean;
    target: string;
    operation: string;
    source: {
      kind: string;
      titleId?: string;
      mediaId?: string;
      version?: string;
      requiredFiles: string[];
    };
  }[];
  setup?: boolean;
}
interface Status {
  phase: string;
  active: boolean;
  completed: number;
  total: number;
  message: string;
}
const sourceLabel: Record<string, string> = {
  "xbox360-iso": "Xbox 360 ISO (XDVDFS)",
  folder: "Подготовленная папка игровых файлов",
  zip: "ZIP-архив игровых файлов",
};
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} МБ`;

/** Universal, data-driven installer: every step is executed by compiled, validated operations. */
export function RecipeInstall({
  recipe,
  defaultParent = "",
}: {
  recipe: RecipeSummary;
  defaultParent?: string;
}) {
  const [source, setSource] = useState("");
  const [sources, setSources] = useState<Record<string, string[]>>({});
  const [consent, setConsent] = useState(false);
  const [checked, setChecked] = useState("");
  const [checking, setChecking] = useState(false);
  const [parent, setParent] = useState(defaultParent);
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const guard = useRef(false);
  const kind = recipe.sourceKind ?? "folder";
  useEffect(() => {
    if (!native) return;
    if (!defaultParent)
      void invoke<string>("default_install_parent")
        .then(setParent)
        .catch(() => {});
    let on = true;
    const read = () =>
      void invoke<Status>("install_status")
        .then((s) => on && setStatus(s))
        .catch(() => {});
    read();
    const t = setInterval(read, 500);
    return () => {
      on = false;
      clearInterval(t);
    };
  }, [defaultParent]);
  useEffect(() => {
    setChecked("");
  }, [source, sources, parent, consent]);
  async function pickExtra(
    slot: NonNullable<RecipeSummary["sources"]>[number],
  ) {
    if (guard.current) return;
    guard.current = true;
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const value = await open({
        directory: slot.source.kind === "folder",
        multiple: slot.repeatable && slot.source.kind !== "folder",
        title: `${recipe.title} — ${slot.role}`,
      });
      if (value)
        setSources((old) => ({
          ...old,
          [slot.role]: slot.repeatable
            ? [
                ...(old[slot.role] ?? []),
                ...(Array.isArray(value) ? value : [value]),
              ].slice(0, 16)
            : [String(value)],
        }));
    } catch (e) {
      setError(String(e));
    } finally {
      guard.current = false;
    }
  }
  async function check() {
    setChecking(true);
    setError("");
    setChecked("");
    try {
      setChecked(
        await invoke<string>("inspect_recipe_sources", {
          recipeId: recipe.id,
          source,
          sources,
          parent,
          setupConsent: consent,
        }),
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setChecking(false);
    }
  }
  async function pick(isSource: boolean) {
    if (guard.current) return;
    guard.current = true;
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const file = isSource && kind !== "folder";
      const p = await open({
        directory: !file,
        multiple: false,
        filters: file
          ? [
              {
                name: sourceLabel[kind] ?? kind,
                extensions: [kind === "zip" ? "zip" : "iso"],
              },
            ]
          : undefined,
        title: isSource
          ? `${recipe.title} — ${sourceLabel[kind] ?? kind}`
          : "Папка установки PORT",
      });
      if (typeof p === "string") (isSource ? setSource : setParent)(p);
    } catch (e) {
      setError(String(e));
    } finally {
      guard.current = false;
    }
  }
  async function install() {
    setError("");
    try {
      await invoke("install_recipe", {
        recipeId: recipe.id,
        source,
        sources,
        parent,
        setupConsent: consent,
      });
    } catch (e) {
      setError(String(e));
    }
  }
  if (!recipe.supported)
    return (
      <div role="alert" className="installer-section inspection">
        <strong>Неподдерживаемый сценарий установки</strong>
        <p>{recipe.reason ?? "Рецепт не прошёл проверку клиента."}</p>
      </div>
    );
  const active = !!status?.active || checking;
  const selected =
    !!source &&
    !!parent &&
    (recipe.sources ?? []).every(
      (slot) => !slot.required || (sources[slot.role]?.length ?? 0) > 0,
    ) &&
    (!recipe.setup || consent);
  return (
    <div className="installer-section inspection">
      <ul>
        <li>Основная игра (baseGame): {sourceLabel[kind] ?? kind}</li>
        {recipe.titleId && <li>Title ID: {recipe.titleId}</li>}
        {recipe.requiredFiles.length > 0 && (
          <li>Обязательные файлы: {recipe.requiredFiles.join(", ")}</li>
        )}
        <li>
          Runtime скачивается автоматически ({mb(recipe.runtimeSize)}, проверка
          SHA-256)
        </li>
        {recipe.dependencies.length > 0 && (
          <li>
            Компоненты проверяются автоматически:{" "}
            {recipe.dependencies.join(", ")}
          </li>
        )}
      </ul>
      <div className="media-actions">
        <Button
          variant="secondary"
          disabled={!native || active}
          onClick={() => void pick(true)}
        >
          <FolderOpen size={16} aria-hidden /> Указать файлы игры
        </Button>
        <span>{source || "не выбрано"}</span>
      </div>
      {(recipe.sources ?? []).map((slot) => (
        <div key={slot.role} className="install-destination">
          <p>
            {slot.role === "titleUpdate" ? "Обновление игры" : "DLC"} ·{" "}
            {slot.required ? "обязательно" : "необязательно"} ·{" "}
            {slot.source.kind === "xbox360-content"
              ? "Xbox 360 STFS, включая файлы без расширения; содержимое проверит мастер"
              : "подготовленная папка"}
          </p>
          <p>
            {slot.source.titleId && `Title ID: ${slot.source.titleId}. `}
            {slot.source.mediaId && `Media ID: ${slot.source.mediaId}. `}
            {slot.source.version && `Версия: ${slot.source.version}. `}
            {slot.source.requiredFiles.join(", ")}
          </p>
          <div className="media-actions">
            <Button
              variant="secondary"
              disabled={!native || active}
              onClick={() => void pickExtra(slot)}
            >
              Выбрать {slot.role}
            </Button>
            <span>{(sources[slot.role] ?? []).join("; ") || "не выбрано"}</span>
            {!!sources[slot.role]?.length && (
              <Button
                variant="ghost"
                disabled={active}
                onClick={() =>
                  setSources((old) => ({ ...old, [slot.role]: [] }))
                }
              >
                Убрать {slot.role}
              </Button>
            )}
          </div>
        </div>
      ))}
      {recipe.setup && (
        <div>
          <p>
            PORT откроет проверенный штатный мастер. В нём потребуется повторно
            выбрать подготовленные источники по указанным PORT путям, завершить
            подготовку и закрыть игру. Совместимость TU и региона окончательно
            проверяет мастер. Его настройки и сохранения могут находиться вне
            папки PORT.
          </p>
          <label>
            <input
              type="checkbox"
              checked={consent}
              disabled={active}
              onChange={(e) => setConsent(e.target.checked)}
            />{" "}
            Разрешаю запуск проверенного Windows runtime для подготовки файлов
          </label>
        </div>
      )}
      <div className="media-actions">
        <Button
          variant="secondary"
          disabled={!native || active}
          onClick={() => void pick(false)}
        >
          <FolderOpen size={16} aria-hidden /> Папка установки
        </Button>
        <span>{parent || "не выбрано"}</span>
      </div>
      {!native && (
        <p>Установка доступна только в приложении PORT для Windows.</p>
      )}
      {status && status.phase !== "idle" && (
        <div aria-live="polite">
          {status.total > 0 && (
            <progress
              value={status.completed}
              max={status.total}
              aria-label="Прогресс установки"
            />
          )}
          <p>
            {status.phase === "ready" && <Check size={16} aria-hidden />}{" "}
            {status.message}
          </p>
        </div>
      )}
      {checked && <p role="status">{checked}</p>}
      {error && (
        <p role="alert" className="installer-error">
          {error}
        </p>
      )}
      <div className="media-actions">
        {status?.active ? (
          <Button
            onClick={() =>
              void invoke("cancel_install").catch((e) => setError(String(e)))
            }
          >
            Отменить
          </Button>
        ) : (
          <>
            <Button
              variant="secondary"
              disabled={!native || !selected || checking}
              onClick={() => void check()}
            >
              Проверить источники
            </Button>
            <Button
              disabled={!native || !selected || !checked || checking}
              onClick={() => void install()}
            >
              Установить
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
