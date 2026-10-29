import { isTauri, invoke } from "@tauri-apps/api/core";
export interface Settings {
  theme: "dark" | "system";
  language?: "ru" | "en" | "es" | "fr";
  installDir: string;
  reducedMotion: boolean;
  compactCards: boolean;
}
export const defaults: Settings = {
  theme: "dark",
  language: "ru",
  installDir: "",
  reducedMotion: false,
  compactCards: false,
};
export const native = isTauri();
const key = "port.settings.v1";
function parse(raw: string | null): Settings {
  if (!raw) return { ...defaults };
  const s: unknown = JSON.parse(raw);
  if (!s || typeof s !== "object") throw new Error("Некорректные настройки");
  const value = s as Record<string, unknown>;
  if (
    !["dark", "system"].includes(value.theme as string) ||
    typeof value.installDir !== "string" ||
    typeof value.reducedMotion !== "boolean" ||
    typeof value.compactCards !== "boolean"
  )
    throw new Error("Некорректные настройки");
  if (
    value.language !== undefined &&
    !["ru", "en", "es", "fr"].includes(value.language as string)
  )
    throw new Error("Некорректный язык");
  return {
    language: (value.language as Settings["language"]) ?? "ru",
    theme: value.theme as Settings["theme"],
    installDir: value.installDir,
    reducedMotion: value.reducedMotion,
    compactCards: value.compactCards,
  };
}
export const settingsService = {
  load: async (): Promise<Settings> =>
    native ? invoke("load_settings") : parse(localStorage.getItem(key)),
  save: async (settings: Settings): Promise<void> => {
    if (native) await invoke("save_settings", { settings });
    else localStorage.setItem(key, JSON.stringify(settings));
  },
  reset: async (): Promise<Settings> => {
    if (native) return invoke("reset_settings");
    localStorage.removeItem(key);
    return { ...defaults };
  },
};
