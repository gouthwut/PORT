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
  const [parent, setParent] = useState(defaultParent);
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const guard = useRef(false);
  const kind = recipe.sourceKind ?? "folder";
  useEffect(() => {
    if (!native) return;
    if (!defaultParent)
      void invoke<string>("default_install_parent").then(setParent).catch(() => {});
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
          ? [{ name: sourceLabel[kind] ?? kind, extensions: [kind === "zip" ? "zip" : "iso"] }]
          : undefined,
        title: isSource ? `${recipe.title} — ${sourceLabel[kind] ?? kind}` : "Папка установки PORT",
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
      await invoke("install_recipe", { recipeId: recipe.id, source, parent });
    } catch (e) {
      setError(String(e));
    }
  }
  if (!recipe.supported)
    return (
      <div role="alert" className="installer-panel">
        <strong>Неподдерживаемый сценарий установки</strong>
        <p>{recipe.reason ?? "Рецепт не прошёл проверку клиента."}</p>
      </div>
    );
  const active = !!status?.active;
  return (
    <div className="installer-panel">
      <ul>
        <li>Источник: {sourceLabel[kind] ?? kind}</li>
        {recipe.titleId && <li>Title ID: {recipe.titleId}</li>}
        {recipe.requiredFiles.length > 0 && (
          <li>Обязательные файлы: {recipe.requiredFiles.join(", ")}</li>
        )}
        <li>
          Runtime скачивается автоматически ({mb(recipe.runtimeSize)}, проверка SHA-256)
        </li>
        {recipe.dependencies.length > 0 && (
          <li>Компоненты проверяются автоматически: {recipe.dependencies.join(", ")}</li>
        )}
      </ul>
      <div className="installer-row">
        <Button disabled={!native || active} onClick={() => void pick(true)}>
          <FolderOpen size={16} aria-hidden /> Указать файлы игры
        </Button>
        <span>{source || "не выбрано"}</span>
      </div>
      <div className="installer-row">
        <Button disabled={!native || active} onClick={() => void pick(false)}>
          <FolderOpen size={16} aria-hidden /> Папка установки
        </Button>
        <span>{parent || "не выбрано"}</span>
      </div>
      {!native && <p>Установка доступна только в приложении PORT для Windows.</p>}
      {status && status.phase !== "idle" && (
        <div aria-live="polite">
          {status.total > 0 && (
            <progress value={status.completed} max={status.total} aria-label="Прогресс установки" />
          )}
          <p>
            {status.phase === "ready" && <Check size={16} aria-hidden />} {status.message}
          </p>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="installer-row">
        {active ? (
          <Button onClick={() => void invoke("cancel_install").catch((e) => setError(String(e)))}>
            Отменить
          </Button>
        ) : (
          <Button disabled={!native || !source || !parent} onClick={() => void install()}>
            Установить
          </Button>
        )}
      </div>
    </div>
  );
}
