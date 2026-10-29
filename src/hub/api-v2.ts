import { publicHttps } from "../services/catalog";
import { parseV2Media } from "./v2-media";
import { native } from "../services/settings";
import {
  fromV2,
  lifecycleLabels,
  technologyLabels,
  type PublicV2Summary,
  type CatalogProject,
} from "./catalog-model";

type OS = "windows" | "linux" | "macos";
type Channel = "stable" | "prerelease";
export interface ProjectFilters {
  q?: string;
  platform?: OS;
  kind?: PublicV2Summary["kind"];
  lifecycle?: PublicV2Summary["lifecycle"];
  game?: string;
  sort?: "name" | "updated";
  cursor?: string;
  limit?: number;
}
export interface V2Summary extends PublicV2Summary {
  summary: string | null;
  targetPlatforms: OS[];
}
export interface V2Game {
  id: string;
  title: string;
}
export interface V2Build {
  id: string;
  projectId: string;
  version: string;
  os: OS;
  arch: "x64" | "x86" | "arm64" | "universal" | "unknown";
  channel: Channel;
  availability: "available" | "unavailable" | "unknown";
  url: string;
  releaseUrl: string | null;
  sha256: string | null;
  size: number | null;
  publishedAt: string | null;
}
export interface Specs {
  os: string | null;
  cpu: string | null;
  gpu: string | null;
  memory: string | null;
  storage: string | null;
}
export interface Requirements {
  requirements: {
    minimum: Specs | null;
    recommended: Specs | null;
    notes: string | null;
    source: string | null;
  };
  dependencies: { name: string; url: string | null; required: boolean }[];
  sourceRequirements: string[];
}
export interface Instructions {
  install: { steps: string[]; notes: string | null };
  knownIssues: { title: string; details: string | null }[];
  sourceRequirements: string[];
}
export interface V2Detail {
  project: CatalogProject;
  builds: V2Build[];
  requirements: Requirements;
  instructions: Instructions;
}
export class V2Error extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}
const bad = (): never => {
  throw new V2Error("Ответ API v2 не соответствует контракту");
};
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : bad();
const str = (v: unknown, max = 8000): string =>
  typeof v === "string" &&
  v.trim() &&
  v.length <= max &&
  !/[\x00-\x09\x0b-\x1f\x7f]/.test(v)
    ? v
    : bad();
const opt = (v: unknown) => (v == null ? null : str(v));
const id = (v: unknown): string =>
  typeof v === "string" && /^[a-z0-9][a-z0-9-]{0,79}$/.test(v) ? v : bad();
const list = <T>(v: unknown, parse: (v: unknown) => T, max = 100): T[] =>
  Array.isArray(v) && v.length <= max ? v.map(parse) : bad();
const optionalList = <T>(v: unknown, parse: (v: unknown) => T, max = 100) =>
  list(v ?? [], parse, max);
const one = <T extends string>(v: unknown, values: readonly T[]): T =>
  values.includes(v as T) ? (v as T) : bad();
const url = (v: unknown) => publicHttps(str(v, 2048)).href;
const optUrl = (v: unknown) => (v == null ? null : url(v));
const envelope = (v: unknown) => {
  const o = obj(v);
  if (o.schemaVersion !== 2) bad();
  return o;
};
const integer = (v: unknown) =>
  Number.isSafeInteger(v) && (v as number) >= 0 ? (v as number) : bad();
const nextCursor = (v: unknown) =>
  v === null ? null : typeof v === "string" && /^\d{1,6}$/.test(v) ? v : bad();
const game = (v: unknown): V2Game => {
  const o = obj(v);
  return { id: id(o.id), title: str(o.title, 120) };
};
export function parseSummary(v: unknown): V2Summary {
  const o = obj(v);
  return {
    id: id(o.id),
    name: str(o.name, 120),
    summary: opt(o.summary),
    media: parseV2Media({ cover: o.cover }),
    gameIds: list(o.gameIds, id, 20),
    sourcePlatforms: optionalList(o.sourcePlatforms, (x) => str(x, 60), 12),
    targetPlatforms: optionalList(
      o.targetPlatforms,
      (x) => one(x, ["windows", "linux", "macos"] as const),
      3,
    ),
    kind: one(o.kind, Object.keys(technologyLabels) as V2Summary["kind"][]),
    lifecycle:
      o.lifecycle == null
        ? "unknown"
        : one(
            o.lifecycle,
            Object.keys(lifecycleLabels) as V2Summary["lifecycle"][],
          ),
  };
}
export function parseBuilds(v: unknown, projectId: string): V2Build[] {
  const result = list(
    v,
    (v): V2Build | null => {
      const o = obj(v);
      // Public API omits review: its SQL returns approved rows only. Never accept
      // an explicit draft/proposal/revocation from a misconfigured endpoint.
      if (o.review !== undefined && o.review !== "approved") return null;
      if (o.projectId !== projectId) bad();
      const sha256 = opt(o.sha256);
      if (sha256 && !/^[a-f0-9]{64}$/.test(sha256)) bad();
      return {
        id: id(o.id),
        projectId,
        version: str(o.version, 200),
        os: one(o.os, ["windows", "linux", "macos"] as const),
        arch: one(o.arch, [
          "x64",
          "x86",
          "arm64",
          "universal",
          "unknown",
        ] as const),
        channel: one(o.channel, ["stable", "prerelease"] as const),
        availability:
          o.availability == null
            ? "unknown"
            : one(o.availability, [
                "available",
                "unavailable",
                "unknown",
              ] as const),
        url: url(o.url),
        releaseUrl: optUrl(o.releaseUrl),
        sha256,
        size: o.size == null ? null : integer(o.size),
        publishedAt: opt(o.publishedAt),
      };
    },
    1000,
  ).filter((b): b is V2Build => b !== null);
  unique(result);
  return result;
}
const specs = (v: unknown): Specs | null => {
  if (v == null) return null;
  const o = obj(v);
  return {
    os: opt(o.os),
    cpu: opt(o.cpu),
    gpu: opt(o.gpu),
    memory: opt(o.memory),
    storage: opt(o.storage),
  };
};
function requirements(o: Record<string, unknown>): Requirements {
  const r = obj(o.requirements ?? {});
  return {
    requirements: {
      minimum: specs(r.minimum),
      recommended: specs(r.recommended),
      notes: opt(r.notes),
      source: opt(r.source),
    },
    dependencies: optionalList(
      o.dependencies,
      (v) => {
        const d = obj(v);
        if (typeof d.required !== "boolean") bad();
        return {
          name: str(d.name, 120),
          url: optUrl(d.url),
          required: d.required as boolean,
        };
      },
      30,
    ),
    sourceRequirements: optionalList(
      o.sourceRequirements,
      (x) => str(x, 300),
      20,
    ),
  };
}
function instructions(o: Record<string, unknown>): Instructions {
  const i = obj(o.install ?? {});
  return {
    install: {
      steps: optionalList(i.steps, (x) => str(x, 2000), 50),
      notes: opt(i.notes),
    },
    knownIssues: optionalList(
      o.knownIssues,
      (v) => {
        const k = obj(v);
        return { title: str(k.title, 200), details: opt(k.details) };
      },
      50,
    ),
    sourceRequirements: optionalList(
      o.sourceRequirements,
      (x) => str(x, 300),
      20,
    ),
  };
}
function unique(items: { id: string }[]) {
  if (new Set(items.map((x) => x.id)).size !== items.length) bad();
}

/** Same-origin public HTTPS only; bounded responses, no credentials/redirects/cache writes. */
export function createV2Client(baseUrl: string, fetcher: typeof fetch = fetch) {
  const base = publicHttps(baseUrl);
  if (base.pathname !== "/" || base.search)
    throw new V2Error("Источник v2 должен быть HTTPS origin");
  async function get(path: string, query: Record<string, string> = {}) {
    const target = new URL(path, base);
    target.search = new URLSearchParams(query).toString();
    try {
      const r = await fetcher(target.href, {
        credentials: "omit",
        redirect: "error",
        signal: AbortSignal.timeout(15000),
        headers: { Accept: "application/json" },
      });
      if (!r.ok) throw new V2Error(`API v2: HTTP ${r.status}`, r.status);
      if (
        !r.headers
          .get("content-type")
          ?.toLowerCase()
          .includes("application/json")
      )
        bad();
      const reader = r.body?.getReader() ?? bad();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 1024 * 1024)
            throw new V2Error("Ответ API v2 превышает 1 МиБ");
          chunks.push(value);
        }
      } finally {
        await reader.cancel();
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      return envelope(
        JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
      );
    } catch (e) {
      if (e instanceof V2Error) throw e;
      throw new V2Error(
        "Не удалось прочитать API v2. Проверьте подключение и конфигурацию источника.",
      );
    }
  }
  const scoped = async (
    projectId: string,
    suffix: string,
    query?: Record<string, string>,
  ) => {
    const o = await get(`/v2/projects/${id(projectId)}${suffix}`, query);
    if (o.projectId !== projectId) bad();
    return o;
  };
  return {
    async projects(filters: ProjectFilters = {}) {
      const query: Record<string, string> = {};
      for (const [k, v] of Object.entries(filters))
        if (v !== undefined) query[k] = String(v);
      if (
        filters.q !== undefined &&
        (!filters.q.trim() || filters.q.length > 80)
      )
        bad();
      if (
        filters.limit !== undefined &&
        (!Number.isInteger(filters.limit) ||
          filters.limit < 1 ||
          filters.limit > 100)
      )
        bad();
      if (filters.cursor !== undefined) nextCursor(filters.cursor);
      const o = await get("/v2/projects", query);
      const items = list(o.items, parseSummary);
      unique(items);
      return {
        items,
        total: integer(o.total),
        nextCursor: nextCursor(o.nextCursor),
      };
    },
    async games(cursor?: string) {
      const o = await get("/v2/games", {
        limit: "100",
        ...(cursor === undefined ? {} : { cursor }),
      });
      const items = list(o.items, game);
      unique(items);
      return { items, nextCursor: nextCursor(o.nextCursor) };
    },
    async builds(
      projectId: string,
      platform?: OS,
      channel: Channel | "all" = "stable",
    ) {
      const o = await scoped(projectId, "/builds", {
        channel,
        ...(platform ? { platform } : {}),
      });
      if (o.channel !== channel) bad();
      return parseBuilds(o.builds, projectId).filter(
        (b) =>
          (!platform || b.os === platform) &&
          (channel === "all" || b.channel === channel),
      );
    },
    async requirements(projectId: string) {
      return requirements(await scoped(projectId, "/requirements"));
    },
    async instructions(projectId: string) {
      return instructions(await scoped(projectId, "/install"));
    },
    async detail(projectId: string): Promise<V2Detail> {
      const o = await get(`/v2/projects/${id(projectId)}`);
      const p = obj(o.project);
      if (p.id !== projectId) bad();
      const summary = parseSummary(p);
      const games = list(o.games, game, 20);
      unique(games);
      if (games.some((g) => !summary.gameIds.includes(g.id))) bad();
      const links = obj(p.links ?? {});
      const builds = parseBuilds(o.builds, projectId);
      const windows = builds.filter(
        (b) => b.os === "windows" && b.channel === "stable",
      );
      const project = fromV2(summary, games);
      project.media = parseV2Media(p.media);
      project.description = opt(p.description) ?? summary.summary;
      project.officialLinks = [
        ["Проект на GitHub", links.github],
        ["Сайт проекта", links.website],
        ["Релизы", links.releases],
      ]
        .filter(([, u]) => u != null)
        .map(([label, u]) => ({ label: label as string, url: url(u) }));
      for (const build of builds) {
        if (
          build.releaseUrl &&
          !project.officialLinks.some((l) => l.url === build.releaseUrl)
        )
          project.officialLinks.push({
            label: `Релиз ${build.version}`,
            url: build.releaseUrl,
          });
      }
      project.windows = windows.some((b) => b.availability === "available")
        ? "available"
        : windows.length &&
            windows.every((b) => b.availability === "unavailable")
          ? "unavailable"
          : "unknown";
      project.buildEvidence = windows.length ? "approved-v2" : "unknown";
      return {
        project,
        builds,
        requirements: requirements(p),
        instructions: instructions(p),
      };
    },
  };
}
export type V2Client = ReturnType<typeof createV2Client>;

/** Existing UI filters need original-game search and source platforms, which the
 * server filters cannot express. Commit only a complete bounded snapshot. */
export async function loadV2Catalog(
  client: V2Client,
): Promise<CatalogProject[]> {
  async function all<T extends { id: string }>(
    load: (
      cursor?: string,
    ) => Promise<{ items: T[]; nextCursor: string | null; total?: number }>,
  ) {
    const items: T[] = [];
    let cursor: string | undefined;
    let total: number | undefined;
    for (let page = 0; page < 10; page++) {
      const result = await load(cursor);
      if (result.total !== undefined) {
        if (total !== undefined && total !== result.total) bad();
        total = result.total;
      }
      items.push(...result.items);
      unique(items);
      if (result.nextCursor === null) {
        if (total !== undefined && items.length !== total) bad();
        return items;
      }
      if (
        !result.items.length ||
        Number(result.nextCursor) <= Number(cursor ?? "0")
      )
        bad();
      cursor = result.nextCursor;
    }
    throw new V2Error(
      "Каталог v2 превышает лимит 1000 записей; частичный список не показан",
    );
  }
  const [projects, games] = await Promise.all([
    all((cursor) => client.projects({ limit: 100, cursor, sort: "name" })),
    all((cursor) => client.games(cursor)),
  ]);
  return projects.map((p) => fromV2(p, games));
}

export type SourceConfig =
  | { version: "v1" }
  | { version: "v2"; baseUrl: string; fallback: "v1" | "none" };
export function parseSourceConfig(v: unknown): SourceConfig {
  const o = obj(v);
  if (o.version === "v1") return { version: "v1" };
  if (o.version !== "v2" || !["v1", "none"].includes(String(o.fallback)))
    throw new V2Error("Неверная конфигурация источника каталога");
  const baseUrl = url(o.baseUrl);
  const u = new URL(baseUrl);
  if (u.pathname !== "/" || u.search) bad();
  // The packaged CSP permits only this explicit production origin. Alternate
  // native sources require an owner-reviewed matching CSP build configuration.
  if (
    native &&
    u.origin !== "https://port-catalog-cms.port-catalog-cms.workers.dev"
  )
    throw new V2Error("Источник v2 не разрешён политикой этого native build");
  return { version: "v2", baseUrl, fallback: o.fallback as "v1" | "none" };
}
