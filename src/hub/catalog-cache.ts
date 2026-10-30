import { invoke } from "@tauri-apps/api/core";
import { native } from "../services/settings";
import { parseV2Snapshot, type V2Snapshot } from "./api-v2";
import sourceConfig from "./source-config.json";

const key = "port.hub.catalog.v2";
const limit = 8 * 1024 * 1024;
const allowed = (source: string) =>
  source === sourceConfig.baseUrl || source === sourceConfig.baseUrl + "/";

export async function readCatalogCache(source: string) {
  if (!allowed(source)) return null;
  try {
    const value = native
      ? await invoke<string | null>("load_hub_catalog_cache")
      : localStorage.getItem(key);
    if (!value || new TextEncoder().encode(value).length > limit) return null;
    const cache = JSON.parse(value);
    if (
      cache.format !== 1 ||
      cache.source !== sourceConfig.baseUrl ||
      !Number.isSafeInteger(cache.savedAt) ||
      cache.savedAt <= 0 ||
      cache.savedAt > Date.now() + 60_000
    )
      return null;
    return parseV2Snapshot(cache.snapshot);
  } catch {
    // A corrupt, foreign or old cache never substitutes for published records.
    return null;
  }
}

export async function saveCatalogCache(source: string, snapshot: V2Snapshot) {
  if (!allowed(source)) return;
  parseV2Snapshot(snapshot);
  const value = JSON.stringify({
    format: 1,
    source: sourceConfig.baseUrl,
    savedAt: Date.now(),
    snapshot,
  });
  if (new TextEncoder().encode(value).length > limit)
    throw Error("Catalog cache limit");
  if (native) await invoke("save_hub_catalog_cache", { value });
  else localStorage.setItem(key, value);
}
