import { useMemo, useState } from "react";
import {
  ArrowRight,
  Download,
  Lock,
  RotateCw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import type { CatalogState, PublishedGame } from "../services/catalog";
import type { MediaSet } from "../services/media";
import {
  applyFilters,
  demoCount,
  demoProjects,
  emptyFilters,
  facet,
  fromPublished,
  shortPlatform,
  statusLabel,
  typeLabel,
  type DevStatus,
  type Filters,
  type HubProject,
  type PortType,
  type SortKey,
} from "./model";

type MediaFn = (g: PublishedGame) => MediaSet;

export function useHubProjects(catalog: CatalogState) {
  return useMemo(() => {
    const real = catalog.snapshot.catalog.games.map(fromPublished);
    const n = demoCount();
    return n ? [...real, ...demoProjects(n)] : real;
  }, [catalog.snapshot.catalog.games]);
}

export function StatusBadge({ status }: { status: DevStatus }) {
  return (
    <span className={`hub-status s-${status}`}>
      <i />
      {statusLabel[status]}
    </span>
  );
}
export function PlatformBadge({ p }: { p: HubProject }) {
  return (
    <span className={`hub-plat p-${p.platformKey}`}>
      {shortPlatform[p.platformKey] || p.platform}
    </span>
  );
}

function Cover({ p, media }: { p: HubProject; media: MediaFn }) {
  const src = p.source ? media(p.source).cover : "";
  if (src) return <img src={src} alt="" loading="lazy" decoding="async" />;
  // Temporary typographic placeholder: no licensed artwork in the catalog yet.
  return (
    <div className={`hub-placeholder p-${p.platformKey}`} aria-hidden>
      <span className="ph-plat">
        {shortPlatform[p.platformKey] || p.platform}
      </span>
      <span className="ph-title">{p.title}</span>
      <span className="ph-note">временная обложка</span>
    </div>
  );
}

export function ProjectCard({
  p,
  media,
  onOpen,
}: {
  p: HubProject;
  media: MediaFn;
  onOpen: (p: HubProject) => void;
}) {
  return (
    <button
      className="hub-card"
      onClick={() => onOpen(p)}
      aria-label={`Открыть проект ${p.title}`}
      disabled={p.demo}
    >
      <div className="hub-cover">
        <Cover p={p} media={media} />
        <div className="hub-cover-top">
          <StatusBadge status={p.status} />
          {p.demo && <span className="hub-demo">DEMO</span>}
        </div>
        <div className="hub-cover-shade" />
        <div className="hub-cover-info">
          <h3>{p.title}</h3>
          <p>
            {p.platform} <ArrowRight size={11} /> {p.targetOs.join(" / ")}
          </p>
        </div>
      </div>
      <div className="hub-card-foot">
        <span>{typeLabel[p.type]}</span>
        {p.release === "available" ? (
          <span className="rel ok">
            <Download size={13} />
            Релиз
          </span>
        ) : (
          <span className="rel no">
            <Lock size={12} />
            Нет релиза
          </span>
        )}
      </div>
    </button>
  );
}

function Row({
  title,
  eyebrow,
  items,
  media,
  onOpen,
  onAll,
}: {
  title: string;
  eyebrow: string;
  items: HubProject[];
  media: MediaFn;
  onOpen: (p: HubProject) => void;
  onAll: () => void;
}) {
  if (!items.length) return null;
  return (
    <section className="hub-row">
      <header>
        <div>
          <p className="hub-eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
        <button className="hub-link" onClick={onAll}>
          Смотреть все <ArrowRight size={15} />
        </button>
      </header>
      <div className="hub-grid row">
        {items.map((p) => (
          <ProjectCard key={p.id} p={p} media={media} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}

function LoadState({
  catalog,
  count,
}: {
  catalog: CatalogState;
  count: number;
}) {
  if (catalog.error && !count)
    return (
      <div className="hub-state err" role="alert">
        <h3>Каталог не загрузился</h3>
        <p>Сервер каталога недоступен, а сохранённой копии нет.</p>
        <button
          className="hub-btn ghost"
          onClick={() => void catalog.refresh()}
        >
          <RotateCw size={15} />
          Повторить
        </button>
      </div>
    );
  if (catalog.busy && !count)
    return (
      <div className="hub-grid" aria-label="Загрузка каталога">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="hub-skel" />
        ))}
      </div>
    );
  return null;
}

export function HubHome({
  catalog,
  media,
  onOpen,
  onCatalog,
}: {
  catalog: CatalogState;
  media: MediaFn;
  onOpen: (p: HubProject) => void;
  onCatalog: (f?: Partial<Filters>) => void;
}) {
  const all = useHubProjects(catalog);
  const platforms = [...facet(all, (p) => p.platformKey).keys()];
  const byOrder = applyFilters(all, emptyFilters(), "curated");
  const fresh = all.filter(
    (p) => p.status === "experimental" || p.status === "unavailable",
  );
  return (
    <div className="hub-home">
      <section className="hub-hero">
        <div className="hero-sky" />
        <div className="hero-sun" />
        <div className="hero-ridge r1" />
        <div className="hero-ridge r2" />
        <div className="hero-grid" />
        <div className="hero-copy">
          <p className="hub-eyebrow">PORT// HUB · нативные ПК-порты</p>
          <h1>
            Консольные миры
            <br />
            <em>на твоём ПК</em>
          </h1>
          <p className="hero-sub">
            Каталог нативных портов, рекомпиляций и фанатских проектов.
            Официальные релизы авторов и честный статус каждого проекта.
          </p>
          <div className="hero-actions">
            <button className="hub-btn primary" onClick={() => onCatalog()}>
              Исследовать каталог <ArrowRight size={17} />
            </button>
            <span className="hero-count">
              {all.length
                ? `${all.length} в каталоге`
                : catalog.busy
                  ? "Загрузка…"
                  : ""}
            </span>
          </div>
        </div>
        <div className="hero-tag" aria-hidden>
          <span className="neon">
            Same games
            <br />
            new possibilities
          </span>
          <span className="mono">
            CONSOLE → PC
            <br />
            PRESERVATION · RECOMP · NATIVE
          </span>
        </div>
        <div className="hero-cart" aria-hidden>
          <span>PORT//</span>
        </div>
      </section>
      {platforms.length > 0 && (
        <nav className="hub-pills" aria-label="Быстрый выбор платформы">
          {platforms.map((k) => {
            const p = all.find((x) => x.platformKey === k)!;
            return (
              <button
                key={k}
                className={`hub-pill p-${k}`}
                onClick={() => onCatalog({ platforms: [k] })}
              >
                <b>{shortPlatform[k] || "•"}</b>
                {p.platform}
              </button>
            );
          })}
        </nav>
      )}
      <LoadState catalog={catalog} count={all.length} />
      {!all.length && !catalog.busy && !catalog.error && (
        <div className="hub-state">
          <h3>Каталог пока пуст</h3>
          <p>Опубликованные проекты появятся здесь.</p>
        </div>
      )}
      <Row
        eyebrow="Подборка редакции"
        title="Популярные проекты"
        items={byOrder.slice(0, 6)}
        media={media}
        onOpen={onOpen}
        onAll={() => onCatalog()}
      />
      <Row
        eyebrow="Порядок публикации CMS"
        title="Недавно обновлённые"
        items={[...byOrder].reverse().slice(0, 6)}
        media={media}
        onOpen={onOpen}
        onAll={() => onCatalog()}
      />
      <Row
        eyebrow="Ранние сборки"
        title="Новые и экспериментальные"
        items={fresh.slice(0, 6)}
        media={media}
        onOpen={onOpen}
        onAll={() => onCatalog({ statuses: ["experimental", "unavailable"] })}
      />
    </div>
  );
}

function Group<T extends string>({
  title,
  options,
  sel,
  set,
}: {
  title: string;
  options: { v: T; label: string; n: number }[];
  sel: T[];
  set: (v: T[]) => void;
}) {
  if (!options.length) return null;
  return (
    <fieldset className="hub-group">
      <legend>{title}</legend>
      {options.map((o) => (
        <label key={o.v} className={sel.includes(o.v) ? "on" : ""}>
          <input
            type="checkbox"
            checked={sel.includes(o.v)}
            onChange={() =>
              set(
                sel.includes(o.v)
                  ? sel.filter((x) => x !== o.v)
                  : [...sel, o.v],
              )
            }
          />
          <span className="box" />
          <span className="lbl">{o.label}</span>
          <small>{o.n}</small>
        </label>
      ))}
    </fieldset>
  );
}

const PAGE = 48;
export function HubCatalog({
  catalog,
  media,
  onOpen,
  filters,
  setFilters,
}: {
  catalog: CatalogState;
  media: MediaFn;
  onOpen: (p: HubProject) => void;
  filters: Filters;
  setFilters: (f: Filters) => void;
}) {
  const all = useHubProjects(catalog);
  const [sort, setSort] = useState<SortKey>("curated");
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState(false);
  const list = applyFilters(all, filters, sort);
  const set = (patch: Partial<Filters>) => {
    setLimit(PAGE);
    setFilters({ ...filters, ...patch });
  };
  const opts = <T extends string>(m: Map<T, number>, label: (v: T) => string) =>
    [...m].map(([v, n]) => ({ v, n, label: label(v) }));
  const plat = facet(all, (p) => p.platformKey);
  const active =
    filters.platforms.length +
    filters.types.length +
    filters.statuses.length +
    filters.os.length +
    (filters.releaseOnly ? 1 : 0);
  return (
    <div className="hub-catalog">
      <header className="cat-head">
        <div>
          <p className="hub-eyebrow">Каталог</p>
          <h1>Все проекты</h1>
        </div>
        <div className="cat-search">
          <Search size={17} />
          <input
            aria-label="Поиск по каталогу"
            placeholder="Название, платформа, жанр, автор"
            value={filters.query}
            onChange={(e) => set({ query: e.target.value })}
          />
          {filters.query && (
            <button
              aria-label="Очистить поиск"
              onClick={() => set({ query: "" })}
            >
              <X size={15} />
            </button>
          )}
        </div>
      </header>
      <div className="cat-chips" role="group" aria-label="Платформа оригинала">
        <button
          className={!filters.platforms.length ? "on" : ""}
          aria-pressed={!filters.platforms.length}
          onClick={() => set({ platforms: [] })}
        >
          Все
        </button>
        {[...plat.keys()].map((k) => (
          <button
            key={k}
            className={filters.platforms.includes(k) ? "on" : ""}
            aria-pressed={filters.platforms.includes(k)}
            onClick={() => set({ platforms: [k] })}
          >
            {all.find((p) => p.platformKey === k)!.platform}
          </button>
        ))}
      </div>
      <div className="cat-body">
        <aside
          className={`cat-filters ${open ? "open" : ""}`}
          aria-label="Фильтры"
        >
          <Group
            title="Платформа оригинала"
            sel={filters.platforms}
            set={(v) => set({ platforms: v })}
            options={opts(
              plat,
              (k) => all.find((p) => p.platformKey === k)!.platform,
            )}
          />
          <Group<PortType>
            title="Тип проекта"
            sel={filters.types}
            set={(v) => set({ types: v })}
            options={opts(
              facet(all, (p) => p.type),
              (v) => typeLabel[v],
            )}
          />
          <Group<DevStatus>
            title="Статус разработки"
            sel={filters.statuses}
            set={(v) => set({ statuses: v })}
            options={opts(
              facet(all, (p) => p.status),
              (v) => statusLabel[v],
            )}
          />
          <Group
            title="Целевая ОС"
            sel={filters.os}
            set={(v) => set({ os: v })}
            options={opts(
              facet(all, (p) => p.targetOs),
              (v) => v,
            )}
          />
          <label className="hub-toggle">
            <input
              type="checkbox"
              checked={filters.releaseOnly}
              onChange={(e) => set({ releaseOnly: e.target.checked })}
            />
            <span />
            Только с релизом
          </label>
          {active > 0 && (
            <button
              className="hub-btn ghost sm"
              onClick={() => set({ ...emptyFilters(filters.query) })}
            >
              Сбросить фильтры
            </button>
          )}
        </aside>
        <section className="cat-results">
          <div className="cat-bar">
            <button
              className="hub-btn ghost sm cat-ftoggle"
              aria-expanded={open}
              onClick={() => setOpen(!open)}
            >
              <SlidersHorizontal size={15} />
              Фильтры{active ? ` · ${active}` : ""}
            </button>
            <span role="status" className="cat-found">
              Найдено <b>{list.length}</b> {plural(list.length)}
            </span>
            <label className="cat-sort">
              Сортировка
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
              >
                <option value="curated">По порядку CMS</option>
                <option value="title">По названию</option>
                <option value="status">По статусу</option>
                <option value="release">Сначала с релизом</option>
              </select>
            </label>
          </div>
          {catalog.snapshot.warning && (
            <p className="hub-warn">{catalog.snapshot.warning}</p>
          )}
          {catalog.error && all.length > 0 && (
            <p className="hub-warn">
              Не удалось обновить каталог, показана сохранённая копия.
            </p>
          )}
          {all.some((p) => p.demo) && (
            <p className="hub-warn demo">
              Включён демо-режим плотности: записи с меткой DEMO не настоящие.
            </p>
          )}
          <LoadState catalog={catalog} count={all.length} />
          {list.length > 0 && (
            <div className="hub-grid">
              {list.slice(0, limit).map((p) => (
                <ProjectCard key={p.id} p={p} media={media} onOpen={onOpen} />
              ))}
            </div>
          )}
          {list.length > limit && (
            <button
              className="hub-btn ghost more"
              onClick={() => setLimit(limit + PAGE)}
            >
              Показать ещё ({list.length - limit})
            </button>
          )}
          {!list.length && all.length > 0 && (
            <div className="hub-state">
              <h3>Ничего не найдено</h3>
              <p>Попробуйте другой запрос или ослабьте фильтры.</p>
              <button
                className="hub-btn ghost"
                onClick={() => set(emptyFilters())}
              >
                Сбросить всё
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
function plural(n: number) {
  const a = n % 10,
    b = n % 100;
  return a === 1 && b !== 11
    ? "проект"
    : a >= 2 && a <= 4 && (b < 12 || b > 14)
      ? "проекта"
      : "проектов";
}
