import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import schema from "../../docs/catalog.schema.json";
import fixture from "../../fixtures/catalog/published-v1.json";
import productionEndpoint from "../catalog-endpoint.json";
import { native } from "./settings";
import type { MediaSet } from "./media";

export interface CatalogAsset {
  url: string;
  sha256: string;
}
export interface PublishedGame {
  id: string;
  collectionId: string;
  status: "published";
  title: string;
  description: string;
  genres: string[];
  tags: string[];
  sourceConsole: string;
  implementation: "compatibility-runtime" | "recompilation" | "native-port";
  media: {
    cover?: CatalogAsset;
    banner?: CatalogAsset;
    hero?: CatalogAsset;
    gallery: CatalogAsset[];
  };
  requirements: {
    os: string;
    cpu: string;
    gpu: string;
    memory: string;
    storage: string;
    notes: string;
  };
  compatibility: {
    status: "experimental" | "playable" | "verified" | "unavailable";
    notes: string;
  };
  project: { github: string; authors: string[]; license: string };
  requiredFiles: string[];
  windowsBuild: "available" | "unavailable";
  adapterId: string;
}
export interface PublishedCatalog {
  schemaVersion: 1;
  revision: string;
  publishedAt: string;
  games: PublishedGame[];
}
export interface CatalogSnapshot {
  endpoint: string;
  catalog: PublishedCatalog;
  images: Record<string, string>;
  known: PublishedGame[];
  syncedAt: number | null;
  source: "demo" | "empty" | "cache" | "online";
  warning: string;
}
const MAX_JSON = 1024 * 1024;
const MAX_IMAGE = 1024 * 1024;
const MAX_IMAGES = 24 * 1024 * 1024;
export function publicHttps(raw: string): URL {
  const u = new URL(raw);
  if (
    raw.length > 2048 ||
    /[\s\\\x00-\x1f\x7f]/.test(raw) ||
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    raw.includes("#") ||
    u.port ||
    !u.hostname.includes(".") ||
    u.hostname.endsWith(".") ||
    /^[\d.]+$/.test(u.hostname) ||
    u.hostname.includes(":") ||
    [
      "localhost",
      ".localhost",
      ".local",
      ".internal",
      ".test",
      ".invalid",
      ".example",
    ].some((s) => u.hostname.endsWith(s))
  )
    throw Error(
      "Нужен публичный HTTPS URL без учётных данных и нестандартного порта",
    );
  return u;
}
type Rule = {
  type?: string;
  const?: unknown;
  enum?: unknown[];
  properties?: Record<string, Rule>;
  required?: string[];
  items?: Rule;
  maxItems?: number;
  minLength?: number;
  maxLength?: number;
  format?: string;
};
function validate(v: unknown, s: Rule): void {
  const bad = () => {
    throw Error("Каталог не соответствует схеме v1");
  };
  if (("const" in s && v !== s.const) || (s.enum && !s.enum.includes(v))) bad();
  if (s.type === "object") {
    if (!v || typeof v !== "object" || Array.isArray(v)) bad();
    const o = v as Record<string, unknown>;
    if (
      Object.keys(o).some((k) => !(k in s.properties!)) ||
      s.required!.some((k) => !(k in o))
    )
      bad();
    for (const [k, x] of Object.entries(o)) validate(x, s.properties![k]);
  } else if (s.type === "array") {
    if (!Array.isArray(v) || v.length > s.maxItems!) bad();
    for (const x of v as unknown[]) validate(x, s.items!);
  } else if (s.type === "string") {
    if (typeof v !== "string") bad();
    const x = v as string;
    const n = Array.from(x).length;
    if (
      n < s.minLength! ||
      n > s.maxLength! ||
      /[\x00-\x09\x0b-\x1f\x7f-\x9f]/.test(x)
    )
      bad();
    if (s.format === "id" && !/^[a-z0-9][a-z0-9-]*$/.test(x)) bad();
    if (s.format === "sha256" && !/^[a-f0-9]{64}$/.test(x)) bad();
    if (
      s.format === "timestamp" &&
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(x)
    )
      bad();
    if (s.format === "https" || s.format === "github") {
      const u = publicHttps(x);
      if (
        s.format === "github" &&
        (u.hostname !== "github.com" ||
          u.search ||
          !/^\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(u.pathname))
      )
        bad();
    }
  } else if (!("const" in s) && !s.enum) bad();
}
export function assets(g: PublishedGame) {
  return [
    g.media.cover,
    g.media.banner,
    g.media.hero,
    ...g.media.gallery,
  ].filter((a): a is CatalogAsset => !!a);
}
export function parseCatalog(raw: string, endpoint = ""): PublishedCatalog {
  if (new TextEncoder().encode(raw).length > MAX_JSON)
    throw Error("Каталог превышает 1 МиБ");
  const v: unknown = JSON.parse(raw);
  validate(v, schema as Rule);
  const c = v as PublishedCatalog;
  const ids = new Set<string>();
  for (const g of c.games) {
    if (ids.has(g.id)) throw Error("Повторяющийся ID игры");
    ids.add(g.id);
    if (
      endpoint &&
      assets(g).some(
        (a) => publicHttps(a.url).origin !== publicHttps(endpoint).origin,
      )
    )
      throw Error("Изображения должны использовать источник API");
  }
  return c;
}
export const demoSnapshot = (): CatalogSnapshot => ({
  endpoint: "",
  catalog: parseCatalog(JSON.stringify(fixture)),
  images: {},
  known: [],
  syncedAt: null,
  source: "demo",
  warning: "",
});
export const developerMode = import.meta.env.DEV;
export const defaultEndpoint = productionEndpoint;
const localFixture =
  developerMode && import.meta.env.VITE_CATALOG_FIXTURE === "1";
const initialSnapshot = (): CatalogSnapshot =>
  localFixture
    ? demoSnapshot()
    : {
        endpoint: defaultEndpoint,
        catalog: {
          schemaVersion: 1,
          revision: "empty",
          publishedAt: "2026-10-27T00:00:00Z",
          games: [],
        },
        images: {},
        known: [],
        syncedAt: null,
        warning: "",
        source: "empty",
      };
// This registry is compiled code. Remote IDs never provide commands, URLs or flags to installers.
export { adapterRegistry, supportsInstall } from "./adapters";
export function catalogMedia(
  g: PublishedGame,
  images: Record<string, string>,
): MediaSet {
  const src = (a?: CatalogAsset) => (a ? images[a.sha256] || "" : "");
  return {
    cover: src(g.media.cover),
    banner: src(g.media.banner),
    hero: src(g.media.hero),
    gallery: g.media.gallery.map(src).filter(Boolean),
  };
}
const configKey = "port.catalog.endpoint.v1",
  cacheKey = "port.catalog.cache.v1",
  knownKey = "port.catalog.known.v1";
async function loadPreview(): Promise<CatalogSnapshot> {
  const configured = localStorage.getItem(configKey);
  const endpoint =
    configured === "" && developerMode
      ? ""
      : configured || (localFixture ? "" : defaultEndpoint);
  if (endpoint) publicHttps(endpoint);
  // Preview has no installations. Known metadata is for preview only, never a library record.
  let known: PublishedGame[] = [];
  try {
    const raw = localStorage.getItem(knownKey);
    if (raw) {
      const c = demoSnapshot().catalog;
      c.games = JSON.parse(raw);
      known = parseCatalog(JSON.stringify(c)).games;
    }
  } catch {
    /* Invalid preview metadata discarded. */
  }
  const raw = localStorage.getItem(cacheKey);
  if (raw && raw.length <= 36 * 1024 * 1024)
    try {
      const s = JSON.parse(raw) as CatalogSnapshot;
      if (s.endpoint === endpoint) {
        s.catalog = parseCatalog(JSON.stringify(s.catalog), endpoint);
        const images: Record<string, string> = {};
        let total = 0;
        for (const [hash, data] of Object.entries(s.images)) {
          try {
            if (
              typeof data !== "string" ||
              data.length > (MAX_IMAGE * 4) / 3 + 64 ||
              !/^data:image\/webp;base64,[a-zA-Z0-9+/=]+$/.test(data)
            )
              continue;
            const b = Uint8Array.from(atob(data.slice(23)), (c) =>
              c.charCodeAt(0),
            );
            await webp(b);
            if ((await digest(b)) !== hash || total + b.length > MAX_IMAGES)
              continue;
            total += b.length;
            images[hash] = data;
          } catch {
            /* Corrupt images become placeholders. */
          }
        }
        return { ...s, images, known, source: "cache" };
      }
    } catch {
      /* Keep configuration; a corrupt cache never becomes published data. */
    }
  return {
    ...demoSnapshot(),
    endpoint,
    known,
    ...(endpoint
      ? {
          catalog: {
            schemaVersion: 1 as const,
            revision: "empty",
            publishedAt: "2026-10-27T00:00:00Z",
            games: [],
          },
          source: "empty" as const,
        }
      : {}),
  };
}
async function bytes(
  url: string,
  limit: number,
  type: string,
  deadline: number,
) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw Error("Истекло время синхронизации");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(8000, remaining));
  try {
    const r = await fetch(publicHttps(url), {
      signal: controller.signal,
      redirect: "error",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      headers: { Accept: type },
    });
    if (
      r.status !== 200 ||
      r.headers.get("content-type")?.split(";")[0].trim() !== type ||
      Number(r.headers.get("content-length")) > limit ||
      !r.body
    )
      throw Error("Неверный HTTP-ответ каталога");
    const reader = r.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        throw Error("Превышен размер ответа");
      }
      chunks.push(value);
    }
    const result = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      result.set(c, offset);
      offset += c.length;
    }
    return result;
  } finally {
    clearTimeout(timer);
  }
}
async function webp(b: Uint8Array) {
  const ascii = (a: number, z: number) =>
    new TextDecoder().decode(b.slice(a, z));
  if (b.length < 30 || ascii(0, 4) !== "RIFF" || ascii(8, 12) !== "WEBP")
    throw Error("Ожидается WebP");
  // Decode with a size-limited header check before creating any image element.
  const d = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const u24 = (i: number) => b[i] + (b[i + 1] << 8) + (b[i + 2] << 16);
  let w = 0,
    h = 0;
  if (d.getUint32(4, true) + 8 !== b.length) throw Error("Повреждённый WebP");
  if (ascii(12, 16) === "VP8X" && !(b[20] & 2)) {
    w = u24(24) + 1;
    h = u24(27) + 1;
  } else if (ascii(12, 16) === "VP8L" && b[20] === 47) {
    const bits = d.getUint32(21, true);
    w = (bits & 16383) + 1;
    h = ((bits >>> 14) & 16383) + 1;
  } else if (
    ascii(12, 16) === "VP8 " &&
    b[23] === 157 &&
    b[24] === 1 &&
    b[25] === 42
  ) {
    w = d.getUint16(26, true) & 16383;
    h = d.getUint16(28, true) & 16383;
  }
  if (!w || !h || w > 4096 || h > 4096 || w * h > 8388608)
    throw Error("Недопустимые размеры WebP");
}
async function digest(b: Uint8Array) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", b as BufferSource)),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
/** Shared bounded, hash-verified WebP loader; callers validate asset origins. */
export async function loadCatalogImage(asset: CatalogAsset): Promise<string> {
  const b = await bytes(asset.url, MAX_IMAGE, "image/webp", Date.now() + 8000);
  await webp(b);
  if ((await digest(b)) !== asset.sha256) throw Error("Image hash");
  let binary = "";
  for (const byte of b) binary += String.fromCharCode(byte);
  return `data:image/webp;base64,${btoa(binary)}`;
}

async function syncPreview(): Promise<CatalogSnapshot> {
  const old = await loadPreview();
  if (!old.endpoint) return old;
  const deadline = Date.now() + 45000;
  const catalog = parseCatalog(
    new TextDecoder("utf-8", { fatal: true }).decode(
      await bytes(old.endpoint, MAX_JSON, "application/json", deadline),
    ),
    old.endpoint,
  );
  const images: Record<string, string> = {};
  let total = 0,
    missing = 0;
  const attempted = new Set<string>();
  let downloadCount = 0,
    transferBudget = MAX_IMAGES;
  for (const g of catalog.games)
    for (const a of assets(g)) {
      if (attempted.has(a.sha256)) continue;
      attempted.add(a.sha256);
      if (
        old.images[a.sha256] &&
        total + (old.images[a.sha256].length * 3) / 4 <= MAX_IMAGES
      ) {
        images[a.sha256] = old.images[a.sha256];
        total += (old.images[a.sha256].length * 3) / 4;
        continue;
      }
      try {
        if (++downloadCount > 128 || transferBudget < MAX_IMAGE)
          throw Error("Image request budget");
        transferBudget -= MAX_IMAGE;
        const b = await bytes(a.url, MAX_IMAGE, "image/webp", deadline);
        transferBudget += MAX_IMAGE - b.length;
        await webp(b);
        const hash = await digest(b);
        if (hash !== a.sha256 || total + b.length > MAX_IMAGES)
          throw Error("Image hash/budget");
        total += b.length;
        let binary = "";
        for (const byte of b) binary += String.fromCharCode(byte);
        images[hash] = `data:image/webp;base64,${btoa(binary)}`;
      } catch {
        missing++;
      }
    }
  const snap: CatalogSnapshot = {
    ...old,
    catalog,
    images,
    syncedAt: Math.floor(Date.now() / 1000),
    source: "online",
    warning: missing
      ? `Недоступно изображений: ${missing}. Показаны заглушки.`
      : "",
  };
  // localStorage quota failures are visible; the last valid stored snapshot survives.
  localStorage.setItem(cacheKey, JSON.stringify(snap));
  return snap;
}
export const catalogService = {
  load: (): Promise<CatalogSnapshot> =>
    native ? invoke("load_catalog") : Promise.resolve().then(loadPreview),
  configure: async (endpoint: string): Promise<CatalogSnapshot> => {
    if (!developerMode) throw Error("Настройка доступна только разработчикам");
    if (endpoint) publicHttps(endpoint);
    if (native) return invoke("configure_catalog", { endpoint });
    localStorage.setItem(configKey, endpoint);
    return loadPreview();
  },
  sync: (): Promise<CatalogSnapshot> =>
    native ? invoke("sync_catalog") : syncPreview(),
};
export function useCatalog() {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [busy, setBusy] = useState(true),
    [error, setError] = useState("");
  const lock = useRef(false);
  async function refresh(endpoint?: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      if (endpoint !== undefined)
        setSnapshot(await catalogService.configure(endpoint));
      setSnapshot(await catalogService.sync());
    } catch (e) {
      setError(String(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    let active = true;
    void catalogService
      .load()
      .then(async (s) => {
        if (!active) return;
        setSnapshot(s);
        await refresh();
      })
      .catch((e) => {
        if (active) {
          setError(String(e));
          setBusy(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const update = () => void refresh();
    window.addEventListener("online", update);
    const timer = setInterval(update, 5 * 60 * 1000);
    return () => {
      window.removeEventListener("online", update);
      clearInterval(timer);
    };
  }, []);
  return { snapshot, busy, error, refresh };
}
export type CatalogState = ReturnType<typeof useCatalog>;
