import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CatalogState } from "../services/catalog";
import { downloadUnavailable } from "./downloads";
import { fromV1, type CatalogProject } from "./catalog-model";
import sourceConfig from "./source-config.json";
import { readCatalogCache, saveCatalogCache } from "./catalog-cache";
import {
  createV2Client,
  loadV2Catalog,
  parseSourceConfig,
  type SourceConfig,
} from "./api-v2";

/** Transport-independent input to the catalog view. Only public records belong here. */
export interface ProjectCatalogState {
  projects: CatalogProject[];
  busy: boolean;
  error: string;
  warning: string;
  source: "demo" | "empty" | "cache" | "online";
  notice?: string;
  refresh: () => Promise<void>;
}

export async function selectSource(
  config: SourceConfig,
  v2: () => Promise<CatalogProject[]>,
): Promise<{
  version: "v1" | "v2";
  projects: CatalogProject[];
  notice: string;
}> {
  if (config.version === "v1")
    return { version: "v1", projects: [], notice: "" };
  try {
    return {
      version: "v2",
      projects: await v2(),
      notice: "Источник каталога: API v2",
    };
  } catch (e) {
    if (config.fallback !== "v1") throw e;
    return {
      version: "v1",
      projects: [],
      notice:
        "API v2 недоступен или ответ некорректен. Показан только каталог v1 согласно конфигурации.",
    };
  }
}

export function useProjectCatalog(): ProjectCatalogState {
  const config = useMemo(() => {
    try {
      const value = parseSourceConfig(
        import.meta.env.DEV && import.meta.env.VITE_HUB_SOURCE_JSON
          ? JSON.parse(import.meta.env.VITE_HUB_SOURCE_JSON)
          : sourceConfig,
      );
      // The current UI never substitutes installer-era catalog records.
      if (value.version !== "v2" || value.fallback !== "none")
        throw Error("API v2 без fallback обязателен");
      return { value, error: "" };
    } catch {
      return {
        value: null,
        error:
          "Каталог недоступен: требуется источник API v2 без подстановки старого каталога.",
      };
    }
  }, []);
  const [result, setResult] = useState<{
    version: "v1" | "v2";
    projects: CatalogProject[];
    notice: string;
    source: "cache" | "online";
  } | null>(null);
  const [busy, setBusy] = useState(config.value?.version === "v2");
  const [error, setError] = useState("");
  const [cacheWarning, setCacheWarning] = useState("");
  const generation = useRef(0);
  const lock = useRef(false);
  const lastRefresh = useRef(0);
  const refreshV2 = useCallback(async () => {
    if (config.value?.version !== "v2" || lock.current) return;
    lock.current = true;
    lastRefresh.current = Date.now();
    const current = generation.current;
    setBusy(true);
    setError("");
    try {
      const c = config.value;
      const next = await selectSource(c, () =>
        loadV2Catalog(createV2Client(c.baseUrl), (snapshot) => {
          if (current !== generation.current) return;
          void saveCatalogCache(c.baseUrl, snapshot)
            .then(() => {
              if (current === generation.current) setCacheWarning("");
            })
            .catch(() => {
              if (current === generation.current)
                setCacheWarning(
                  "Не удалось сохранить каталог для работы без интернета.",
                );
            });
        }),
      );
      if (current === generation.current)
        setResult({ ...next, source: "online" });
      if (next.version === "v2") {
        const client = createV2Client(c.baseUrl);
        let index = 0;
        const enriched = [...next.projects];
        await Promise.all(
          Array.from({ length: Math.min(4, enriched.length) }, async () => {
            for (;;) {
              const i = index++;
              if (i >= enriched.length || current !== generation.current) break;
              try {
                // Summary responses carry only covers; detail owns validated gallery media.
                const [detail, buildResult] = await Promise.allSettled([
                  client.detail(enriched[i].id),
                  client.builds(enriched[i].id, "windows", "all"),
                ]);
                if (detail.status === "fulfilled")
                  enriched[i] = {
                    ...enriched[i],
                    media: detail.value.project.media,
                    description: detail.value.project.description,
                  };
                if (buildResult.status !== "fulfilled") continue;
                const builds = buildResult.value;
                enriched[i] = {
                  ...enriched[i],
                  windows: builds.some((b) => !downloadUnavailable(b))
                    ? "available"
                    : builds.some((b) => b.availability === "unknown")
                      ? "unknown"
                      : "unavailable",
                  buildEvidence: "approved-v2",
                };
              } catch {
                /* A missing build response cannot prove file availability. */
              }
            }
          }),
        );
        if (current === generation.current)
          setResult({ ...next, projects: enriched, source: "online" });
      }
    } catch (e) {
      if (current === generation.current) {
        setError(String(e));
        setResult((previous) =>
          previous ? { ...previous, source: "cache" } : null,
        );
      }
    } finally {
      if (current === generation.current) {
        lock.current = false;
        setBusy(false);
      }
    }
  }, [config]);
  useEffect(() => {
    let disposed = false;
    void (async () => {
      if (config.value?.version === "v2") {
        const projects = await readCatalogCache(config.value.baseUrl);
        if (!disposed && projects && lastRefresh.current === 0)
          setResult({ version: "v2", projects, notice: "", source: "cache" });
      }
      if (!disposed) void refreshV2();
    })();
    const reconnect = () => void refreshV2();
    const refreshIfVisible = () => {
      if (
        document.visibilityState === "visible" &&
        navigator.onLine &&
        Date.now() - lastRefresh.current >= 5 * 60_000
      )
        void refreshV2();
    };
    const interval = window.setInterval(refreshIfVisible, 5 * 60_000);
    window.addEventListener("online", reconnect);
    document.addEventListener("visibilitychange", refreshIfVisible);
    return () => {
      disposed = true;
      window.clearInterval(interval);
      window.removeEventListener("online", reconnect);
      document.removeEventListener("visibilitychange", refreshIfVisible);
      generation.current++;
      lock.current = false;
    };
  }, [refreshV2]);
  if (config.error)
    return {
      projects: [],
      busy: false,
      error: config.error,
      warning: "",
      notice: config.error,
      source: "empty",
      refresh: async () => {},
    };
  return {
    projects: result?.projects ?? [],
    busy,
    error,
    warning: cacheWarning,
    notice: result?.notice ?? "Источник каталога: API v2",
    source: result?.source ?? "empty",
    refresh: refreshV2,
  };
}

export function useV1Projects(catalog: CatalogState): ProjectCatalogState {
  const projects = useMemo(
    () => catalog.snapshot.catalog.games.map(fromV1),
    [catalog.snapshot.catalog.games],
  );
  return {
    projects,
    busy: catalog.busy,
    error: catalog.error,
    warning: catalog.snapshot.warning,
    source: catalog.snapshot.source,
    refresh: catalog.refresh,
  };
}
