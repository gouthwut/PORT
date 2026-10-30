import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CatalogState } from "../services/catalog";
import { downloadUnavailable } from "./downloads";
import { fromV1, type CatalogProject } from "./catalog-model";
import sourceConfig from "./source-config.json";
import { useLanguage } from "./i18n";
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

const CACHE_KEY = "port.catalog.cache.v2";
const STALE_MS = 60_000;

function loadCache(): {
  version: "v2";
  projects: CatalogProject[];
  notice: string;
} | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (Array.isArray(data.projects) && data.projects.length > 0) {
      return {
        version: "v2",
        projects: data.projects,
        notice: "Cached catalog",
      };
    }
  } catch {
    /* ignore corrupted cache */
  }
  return null;
}

function saveCache(projects: CatalogProject[]) {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ projects, timestamp: Date.now() }),
    );
  } catch {
    /* ignore storage quota */
  }
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
  const language = useLanguage();
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

  const cached = useMemo(() => loadCache(), []);
  const [result, setResult] = useState<{
    version: "v1" | "v2";
    projects: CatalogProject[];
    notice: string;
  } | null>(cached);
  const [sourceType, setSourceType] = useState<
    "demo" | "empty" | "cache" | "online"
  >(cached ? "cache" : "empty");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const lock = useRef(false);
  const lastFetched = useRef<number>(0);

  const refreshV2 = useCallback(
    async (forced = false) => {
      if (config.value?.version !== "v2" || lock.current) return;
      if (
        !forced &&
        lastFetched.current > 0 &&
        Date.now() - lastFetched.current < STALE_MS
      ) {
        return;
      }
      lock.current = true;
      const current = generation.current;
      setBusy(true);
      setError("");
      try {
        const c = config.value;
        const next = await selectSource(c, () =>
          loadV2Catalog(createV2Client(c.baseUrl)),
        );
        if (current === generation.current) {
          setResult(next);
          setSourceType("online");
        }
        if (next.version === "v2") {
          const client = createV2Client(c.baseUrl);
          let index = 0;
          const enriched = [...next.projects];
          await Promise.all(
            Array.from({ length: Math.min(4, enriched.length) }, async () => {
              for (;;) {
                const i = index++;
                if (i >= enriched.length || current !== generation.current)
                  break;
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
          if (current === generation.current) {
            setResult({ ...next, projects: enriched });
            setSourceType("online");
            saveCache(enriched);
            lastFetched.current = Date.now();
          }
        }
      } catch (e) {
        if (current === generation.current) {
          // Retain existing projects if loaded, while recording the failure
          setError(String(e));
        }
      } finally {
        if (current === generation.current) {
          lock.current = false;
          setBusy(false);
        }
      }
    },
    [config, language],
  );

  useEffect(() => {
    void refreshV2(true);
    const reconnect = () => void refreshV2(true);
    const onFocus = () => void refreshV2(false);
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void refreshV2(false);
      }
    };
    window.addEventListener("online", reconnect);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("online", reconnect);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
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
    warning: "",
    notice:
      result?.notice ??
      (language === "ru"
        ? "Источник каталога: API v2"
        : "Catalog source: API v2"),
    source: result ? sourceType : "empty",
    refresh: () => refreshV2(true),
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
