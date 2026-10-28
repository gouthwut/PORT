import { useMemo } from "react";
import type { CatalogState } from "../services/catalog";
import { fromV1, type CatalogProject } from "./catalog-model";

/** Transport-independent input to the catalog view. Only public records belong here. */
export interface ProjectCatalogState {
  projects: CatalogProject[];
  busy: boolean;
  error: string;
  warning: string;
  source: "demo" | "empty" | "cache" | "online";
  refresh: () => Promise<void>;
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
