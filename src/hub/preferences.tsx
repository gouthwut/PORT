import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { native } from "../services/settings";

interface Preferences {
  favorites: string[];
  recent: string[];
}
const empty: Preferences = { favorites: [], recent: [] };
const key = "port.hub.preferences.v1";
function parse(value: unknown): Preferences {
  if (!value || typeof value !== "object") throw Error("Invalid preferences");
  const p = value as Preferences;
  if (
    [p.favorites, p.recent].some(
      (ids) =>
        !Array.isArray(ids) ||
        ids.length > 1000 ||
        ids.some(
          (id) =>
            typeof id !== "string" || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(id),
        ) ||
        new Set(ids).size !== ids.length,
    )
  )
    throw Error("Invalid project IDs");
  return { favorites: p.favorites, recent: p.recent };
}
const Context = createContext({
  ...empty,
  ready: false,
  error: "",
  toggle: (_id: string) => {},
  visit: (_id: string) => {},
});
export const usePreferences = () => useContext(Context);
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState(empty);
  const current = useRef(empty);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const queue = useRef(Promise.resolve());
  useEffect(() => {
    let active = true;
    (native
      ? invoke("load_hub_preferences")
      : Promise.resolve(
          JSON.parse(localStorage.getItem(key) || JSON.stringify(empty)),
        )
    )
      .then((value) => {
        const p = parse(value);
        if (active) {
          current.current = p;
          setData(p);
          setReady(true);
        }
      })
      .catch(() => {
        if (active)
          setError(
            "Не удалось прочитать избранное и недавние проекты. Перезапустите PORT.",
          );
      });
    return () => {
      active = false;
    };
  }, []);
  function save(next: Preferences) {
    if (!ready) return;
    current.current = next;
    setData(next);
    queue.current = queue.current.then(async () => {
      try {
        if (native) await invoke("save_hub_preferences", { preferences: next });
        else localStorage.setItem(key, JSON.stringify(next));
        setError("");
      } catch {
        setError(
          "Не удалось сохранить избранное и недавние проекты. Повторите действие.",
        );
      }
    });
  }
  return (
    <Context.Provider
      value={{
        ...data,
        ready,
        error,
        toggle(id) {
          const p = current.current;
          save({
            ...p,
            favorites: p.favorites.includes(id)
              ? p.favorites.filter((x) => x !== id)
              : [...p.favorites, id],
          });
        },
        visit(id) {
          const p = current.current;
          save({
            ...p,
            recent: [id, ...p.recent.filter((x) => x !== id)].slice(0, 12),
          });
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function FavoriteButton({ id }: { id: string }) {
  const p = usePreferences();
  const selected = p.favorites.includes(id);
  return (
    <button
      className="favorite-button"
      disabled={!p.ready}
      aria-label={selected ? "Убрать из избранного" : "В избранное"}
      aria-pressed={selected}
      onClick={() => p.toggle(id)}
    >
      <span aria-hidden="true">{selected ? "★" : "☆"}</span>
    </button>
  );
}
