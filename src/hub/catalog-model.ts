import type { MediaSet } from "../services/media";
import type { PublishedGame } from "../services/catalog";

export const technologyLabels = {
  "native-port": "Нативный порт",
  recompilation: "Рекомпиляция",
  decompilation: "Декомпиляция",
  "compatibility-runtime": "Слой совместимости",
  "source-port": "Порт исходного кода",
  other: "Другая технология",
};
export const lifecycleLabels = {
  active: "Активная разработка",
  maintenance: "Поддержка",
  beta: "Бета",
  alpha: "Альфа",
  archived: "Архив",
  unknown: "Не указана",
};
export type ProjectKind = keyof typeof technologyLabels;
export type Lifecycle = keyof typeof lifecycleLabels;
export type BuildAvailability = "available" | "unavailable" | "unknown";

/** Presentation model: original titles, port identity and build claims stay separate. */
export interface CatalogProject {
  id: string;
  games: { id: string; title: string }[];
  name: string | null;
  description: string | null;
  officialLinks: { label: string; url: string }[];
  platforms: string[];
  kind: ProjectKind;
  lifecycle: Lifecycle;
  windows: BuildAvailability;
  buildEvidence: "editorial-v1" | "approved-v2" | "unknown";
  legacy: PublishedGame | null;
  media?: MediaSet;
}

export function fromV1(game: PublishedGame): CatalogProject {
  return {
    id: game.id,
    games: [{ id: game.id, title: game.title }],
    // V1 has no independent project name or development lifecycle.
    name: null,
    description: game.description || null,
    officialLinks: [{ label: "Проект на GitHub", url: game.project.github }],
    platforms: [game.sourceConsole],
    kind: game.implementation,
    lifecycle: "unknown",
    windows: game.windowsBuild,
    buildEvidence: "editorial-v1",
    legacy: game,
  };
}

/** Public v2 summary, AFTER transport validation. Not the owner/draft model.
 * Its latestStable is OS-agnostic; it cannot establish a Windows build. */
export interface PublicV2Summary {
  id: string;
  name: string;
  gameIds: string[];
  sourcePlatforms: string[];
  kind: ProjectKind;
  lifecycle: Lifecycle;
  media?: MediaSet;
}
export function fromV2(
  project: PublicV2Summary,
  games: { id: string; title: string }[],
): CatalogProject {
  return {
    id: project.id,
    games: games.filter((game) => project.gameIds.includes(game.id)),
    name: project.name,
    media: project.media,
    // Summary data does not establish detail content or official links.
    description: null,
    officialLinks: [],
    platforms: project.sourcePlatforms,
    kind: project.kind,
    lifecycle: project.lifecycle,
    windows: "unknown",
    buildEvidence: "unknown",
    legacy: null,
  };
}

export interface CatalogQuery {
  search: string;
  platform: string;
  kind: string;
  lifecycle: string;
  windows: string;
  sort: "catalog" | "name" | "name-desc";
  page: number;
}
export const defaultCatalogQuery: CatalogQuery = {
  search: "",
  platform: "",
  kind: "",
  lifecycle: "",
  windows: "",
  sort: "catalog",
  page: 1,
};
export const catalogPageSize = 24;
export function projectTitle(project: CatalogProject) {
  return (
    project.games.map((g) => g.title).join(" / ") ||
    project.name ||
    "Название не указано"
  );
}
const normalize = (s: string) =>
  s.normalize("NFKC").toLocaleLowerCase("ru-RU").trim();
export function selectProjects(
  projects: CatalogProject[],
  query: CatalogQuery,
) {
  const term = normalize(query.search);
  const matches = projects.filter(
    (p) =>
      (!term ||
        normalize([projectTitle(p), p.name].join(" ")).includes(term)) &&
      (!query.platform || p.platforms.includes(query.platform)) &&
      (!query.kind || p.kind === query.kind) &&
      (!query.lifecycle || p.lifecycle === query.lifecycle) &&
      (!query.windows || p.windows === query.windows),
  );
  if (query.sort !== "catalog")
    matches.sort(
      (a, b) =>
        (projectTitle(a).localeCompare(projectTitle(b), "ru", {
          numeric: true,
        }) || a.id.localeCompare(b.id)) * (query.sort === "name-desc" ? -1 : 1),
    );
  const total = matches.length;
  const pages = Math.max(1, Math.ceil(total / catalogPageSize));
  const page = Math.min(Math.max(1, query.page), pages);
  return {
    items: matches.slice((page - 1) * catalogPageSize, page * catalogPageSize),
    total,
    pages,
    page,
  };
}
