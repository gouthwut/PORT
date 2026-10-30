// Stage 11.1-A: temporary HUB view model over the published v1 catalog.
// It never mutates CMS data. Fields that v1 does not provide (popularity,
// update dates, ratings) are left absent instead of being invented.
import type { PublishedGame } from "../services/catalog";

export type PortType =
  "native-port" | "recompilation" | "compatibility-runtime";
export type DevStatus =
  "verified" | "playable" | "experimental" | "unavailable";

export interface HubProject {
  id: string;
  title: string;
  description: string;
  platform: string; // original console, as published
  platformKey: string;
  type: PortType;
  status: DevStatus;
  targetOs: string[];
  release: "available" | "unavailable";
  genres: string[];
  authors: string[];
  order: number; // CMS publication order (curated), not popularity
  demo: boolean;
  source: PublishedGame | null;
}

export const typeLabel: Record<PortType, string> = {
  "native-port": "Нативный порт",
  recompilation: "Рекомпиляция",
  "compatibility-runtime": "Среда совместимости",
};
export const statusLabel: Record<DevStatus, string> = {
  verified: "Стабильный",
  playable: "Играбельный",
  experimental: "Экспериментальный",
  unavailable: "В разработке",
};

const PLATFORMS: { key: string; label: string; match: RegExp }[] = [
  { key: "ps4", label: "PlayStation 4", match: /ps\s?4|playstation\s?4/i },
  { key: "ps3", label: "PlayStation 3", match: /ps\s?3|playstation\s?3/i },
  { key: "ps2", label: "PlayStation 2", match: /ps\s?2|playstation\s?2/i },
  { key: "ps1", label: "PlayStation", match: /ps\s?1|psx|^playstation$/i },
  { key: "x360", label: "Xbox 360", match: /360/ },
  { key: "xbox", label: "Xbox", match: /xbox/i },
  { key: "switch", label: "Nintendo Switch", match: /switch/i },
  { key: "n64", label: "Nintendo 64", match: /n64|nintendo\s?64/i },
  { key: "gc", label: "GameCube", match: /gamecube|\bgc\b/i },
  { key: "wii", label: "Wii", match: /wii/i },
  { key: "snes", label: "SNES", match: /snes|super nintendo/i },
  { key: "sega", label: "SEGA", match: /sega|dreamcast|genesis|mega ?drive/i },
];
export function platformOf(raw: string) {
  const p = PLATFORMS.find((x) => x.match.test(raw));
  return p
    ? { key: p.key, label: p.label }
    : {
        key: raw.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "other",
        label: raw || "Другое",
      };
}
export const shortPlatform: Record<string, string> = {
  ps4: "PS4",
  ps3: "PS3",
  ps2: "PS2",
  ps1: "PS1",
  x360: "X360",
  xbox: "XBOX",
  switch: "NSW",
  n64: "N64",
  gc: "GC",
  wii: "WII",
  snes: "SNES",
  sega: "SEGA",
};

function osOf(raw: string): string[] {
  const out: string[] = [];
  if (/win/i.test(raw)) out.push("Windows");
  if (/linux|steam ?deck/i.test(raw)) out.push("Linux");
  if (/mac/i.test(raw)) out.push("macOS");
  return out.length ? out : ["Windows"];
}

export function fromPublished(g: PublishedGame, order: number): HubProject {
  const p = platformOf(g.sourceConsole);
  return {
    id: g.id,
    title: g.title,
    description: g.description,
    platform: p.label,
    platformKey: p.key,
    type: g.implementation,
    status: g.compatibility.status,
    targetOs: osOf(g.requirements.os),
    release: g.windowsBuild,
    genres: g.genres,
    authors: g.project.authors,
    order,
    demo: false,
    source: g,
  };
}

// Opt-in density preview (?hubDemo=N in dev). Every item is flagged demo and
// labelled in the UI; it is never mixed into production views by default.
const demoWords = [
  "Neon",
  "Iron",
  "Ashen",
  "Crystal",
  "Echo",
  "Lunar",
  "Rust",
  "Velvet",
  "Hollow",
  "Prism",
  "Static",
  "Ember",
];
const demoNouns = [
  "Frontier",
  "Circuit",
  "Kingdom",
  "Drift",
  "Signal",
  "Vault",
  "Garden",
  "Reactor",
  "Harbor",
  "Arcade",
];
export function demoProjects(n: number): HubProject[] {
  const types: PortType[] = [
    "native-port",
    "recompilation",
    "compatibility-runtime",
  ];
  const statuses: DevStatus[] = [
    "verified",
    "playable",
    "experimental",
    "unavailable",
  ];
  return Array.from({ length: n }, (_, i) => {
    const p = PLATFORMS[i % PLATFORMS.length];
    return {
      id: `demo-${i}`,
      title: `${demoWords[i % demoWords.length]} ${demoNouns[(i * 7) % demoNouns.length]}`,
      description: "Демонстрационная запись для проверки плотности сетки.",
      platform: p.label,
      platformKey: p.key,
      type: types[i % 3],
      status: statuses[(i * 3) % 4],
      targetOs: i % 4 === 0 ? ["Windows", "Linux"] : ["Windows"],
      release: i % 3 === 2 ? "unavailable" : "available",
      genres: [],
      authors: [],
      order: 1000 + i,
      demo: true,
      source: null,
    };
  });
}
export function demoCount(): number {
  if (!import.meta.env.DEV) return 0;
  const v = new URLSearchParams(location.search).get("hubDemo");
  return v ? Math.min(600, Math.max(0, Number(v) || 0)) : 0;
}

export type SortKey = "curated" | "title" | "status" | "release";
export interface Filters {
  query: string;
  platforms: string[];
  types: PortType[];
  statuses: DevStatus[];
  os: string[];
  releaseOnly: boolean;
}
export const emptyFilters = (query = ""): Filters => ({
  query,
  platforms: [],
  types: [],
  statuses: [],
  os: [],
  releaseOnly: false,
});
const statusRank: Record<DevStatus, number> = {
  verified: 0,
  playable: 1,
  experimental: 2,
  unavailable: 3,
};
export function applyFilters(list: HubProject[], f: Filters, sort: SortKey) {
  const q = f.query.trim().toLowerCase();
  const out = list.filter(
    (p) =>
      (!q ||
        [
          p.title,
          p.description,
          p.platform,
          typeLabel[p.type],
          ...p.genres,
          ...p.authors,
        ]
          .join(" ")
          .toLowerCase()
          .includes(q)) &&
      (!f.platforms.length || f.platforms.includes(p.platformKey)) &&
      (!f.types.length || f.types.includes(p.type)) &&
      (!f.statuses.length || f.statuses.includes(p.status)) &&
      (!f.os.length || p.targetOs.some((o) => f.os.includes(o))) &&
      (!f.releaseOnly || p.release === "available"),
  );
  const cmp: Record<SortKey, (a: HubProject, b: HubProject) => number> = {
    curated: (a, b) => a.order - b.order,
    title: (a, b) => a.title.localeCompare(b.title, "ru"),
    status: (a, b) =>
      statusRank[a.status] - statusRank[b.status] || a.order - b.order,
    release: (a, b) =>
      a.release === b.release
        ? a.order - b.order
        : a.release === "available"
          ? -1
          : 1,
  };
  return out.sort(cmp[sort]);
}
export function facet<T extends string>(
  list: HubProject[],
  pick: (p: HubProject) => T | T[],
) {
  const m = new Map<T, number>();
  for (const p of list)
    for (const v of ([] as T[]).concat(pick(p))) m.set(v, (m.get(v) || 0) + 1);
  return m;
}
