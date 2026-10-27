import { invoke } from "@tauri-apps/api/core";
import { native } from "./settings";

export interface MediaSet {
  hero: string;
  cover: string;
  banner: string;
  gallery: string[];
}
export const emptyMedia: MediaSet = {
  hero: "",
  cover: "",
  banner: "",
  gallery: [],
};
const key = "port.media.v1";
function parseMedia(value: unknown): MediaSet {
  if (!value || typeof value !== "object")
    throw new Error("Некорректное оформление");
  const m = value as MediaSet;
  const photo = (s: unknown): s is string =>
    typeof s === "string" &&
    s.length <= 900_000 &&
    (!s || /^data:image\/webp;base64,[A-Za-z0-9+/=]+$/.test(s));
  if (
    ![m.hero, m.cover, m.banner].every(photo) ||
    !Array.isArray(m.gallery) ||
    m.gallery.length > 10 ||
    !m.gallery.every(photo)
  )
    throw new Error("Некорректное оформление");
  return { hero: m.hero, cover: m.cover, banner: m.banner, gallery: m.gallery };
}
export const mediaService = {
  load: async (): Promise<MediaSet> =>
    native
      ? invoke("load_media")
      : parseMedia(
          JSON.parse(localStorage.getItem(key) || JSON.stringify(emptyMedia)),
        ),
};
