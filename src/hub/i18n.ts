import { useSyncExternalStore } from "react";
import translations from "./translations.json";
export type Language = "ru" | "en" | "es" | "fr";
let language: Language = "ru";
const listeners = new Set<() => void>();
export function setLanguage(next: Language) {
  if (next === language) return;
  language = next;
  document.documentElement.lang = next;
  listeners.forEach((notify) => notify());
}
export function useLanguage() {
  return useSyncExternalStore(
    (notify) => {
      listeners.add(notify);
      return () => {
        listeners.delete(notify);
      };
    },
    () => language,
  );
}
/** Russian source copy is the fallback, so missing entries never expose keys. */
export function t(source: string): string {
  if (language === "ru") return source;
  const row = (translations as Record<string, string[]>)[source];
  return row?.[{ en: 0, es: 1, fr: 2 }[language]] ?? source;
}

/** Native status text is display-only; never expose OS diagnostics as UI copy. */
export function downloadMessage(source: string): string {
  if (!source) return "";
  if (
    /os error|reparse point|symlink|permission denied|access is denied|mutex|poison/i.test(
      source,
    ) ||
    (language !== "ru" && !Object.hasOwn(translations, source))
  )
    return t("Не удалось выполнить действие. Повторите попытку.");
  return t(source);
}
