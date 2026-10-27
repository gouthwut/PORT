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
  save: async (media: MediaSet): Promise<void> => {
    parseMedia(media);
    if (native) await invoke("save_media", { media });
    else localStorage.setItem(key, JSON.stringify(media));
  },
};
// Decode and downscale locally; SVG and remote URLs are never accepted.
export async function importPhoto(
  file: File,
  portrait = false,
): Promise<string> {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 12 * 1024 * 1024
  )
    throw new Error("Выберите PNG, JPEG или WebP до 12 МБ.");
  const bitmap = await createImageBitmap(file);
  try {
    if (
      bitmap.width * bitmap.height > 40_000_000 ||
      bitmap.width < 200 ||
      bitmap.height < 200
    )
      throw new Error(
        "Изображение должно быть от 200 px и не более 40 мегапикселей.",
      );
    const scale = Math.min(
      1,
      (portrait ? 1000 : 1920) / Math.max(bitmap.width, bitmap.height),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas
      .getContext("2d")!
      .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const result = canvas.toDataURL("image/webp", 0.82);
    if (result.length > 900_000)
      throw new Error(
        "Изображение слишком сложное. Выберите файл меньшего размера.",
      );
    return result;
  } finally {
    bitmap.close();
  }
}
