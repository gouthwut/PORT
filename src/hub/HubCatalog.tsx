import { t } from "./i18n";
import { useDeferredValue, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Layers3,
  RotateCw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { developerMode } from "../services/catalog";
import type { MediaSet } from "../services/media";
import { native } from "../services/settings";
import { usePreferences } from "./preferences";
import { ProjectCard } from "./ProjectCard";
import {
  defaultCatalogQuery,
  lifecycleLabels,
  selectProjects,
  technologyLabels,
  type CatalogQuery,
  type CatalogProject,
} from "./catalog-model";
import type { ProjectCatalogState } from "./catalog-source";
import "./catalog.css";

export function HubCatalog({
  catalog,
  query,
  onQuery,
  media,
  onOpen,
}: {
  catalog: ProjectCatalogState;
  query: CatalogQuery;
  onQuery: (query: CatalogQuery) => void;
  media: (project: CatalogProject) => MediaSet;
  onOpen: (project: CatalogProject) => void;
}) {
  const preferences = usePreferences();
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const projects = favoritesOnly
    ? catalog.projects.filter((p) => preferences.favorites.includes(p.id))
    : catalog.projects;
  const deferredSearch = useDeferredValue(query.search);
  const result = useMemo(
    () => selectProjects(projects, { ...query, search: deferredSearch }),
    [projects, query, deferredSearch],
  );
  const platforms = useMemo(
    () => [...new Set(projects.flatMap((p) => p.platforms))].sort(),
    [projects],
  );
  const resultsRef = useRef<HTMLHeadingElement>(null);
  const change = (patch: Partial<CatalogQuery>) =>
    onQuery({ ...query, ...patch, page: 1 });
  const reset = () => {
    setFavoritesOnly(false);
    onQuery({ ...defaultCatalogQuery });
  };
  const active =
    favoritesOnly ||
    !!(
      query.search ||
      query.platform ||
      query.kind ||
      query.lifecycle ||
      query.windows ||
      query.sort !== "catalog"
    );
  const error = !!catalog.error;
  const paging = (page: number) => {
    onQuery({ ...query, page });
    requestAnimationFrame(() => {
      resultsRef.current?.focus();
      resultsRef.current?.scrollIntoView({
        block: "start",
        behavior: "instant",
      });
    });
  };
  return (
    <div className="hub-catalog">
      <header className="hub-catalog-intro">
        <div>
          <p className="port-kicker">{t("PORT// / ПРОЕКТЫ")}</p>
          <h1>
            {t("Каталог")}
            <span>.</span>
          </h1>
          <p>
            {t("Независимые порты и новые способы играть.")} <br />
            {t("Найди игру, сравни технологии, узнай о проекте.")}{" "}
          </p>
        </div>
        <Layers3
          className="hub-catalog-mark"
          size={100}
          strokeWidth={0.75}
          aria-hidden="true"
        />
      </header>
      <section className="hub-catalog-tools" aria-label={t("Фильтры каталога")}>
        <div className="hub-filter-heading">
          <button
            aria-pressed={favoritesOnly}
            onClick={() => {
              setFavoritesOnly((v) => !v);
              onQuery({ ...query, page: 1 });
            }}
          >
            {t("Избранное")}{" "}
          </button>
          <span>
            <SlidersHorizontal size={16} aria-hidden="true" />
            {t("Найти проект")}{" "}
          </span>
          <button onClick={reset} disabled={!active}>
            {t("Сбросить фильтры")} <X size={14} aria-hidden="true" />
          </button>
        </div>
        <label className="hub-catalog-search">
          <Search size={19} aria-hidden="true" />
          <input
            aria-label={t("Поиск по игре или проекту")}
            placeholder={t("Название игры или проекта")}
            value={query.search}
            onChange={(e) => change({ search: e.target.value })}
          />
          {query.search && (
            <button
              aria-label={t("Очистить запрос каталога")}
              onClick={() => change({ search: "" })}
            >
              <X size={17} />
            </button>
          )}
        </label>
        <div className="hub-filter-grid">
          <label>
            {t("Исходная платформа")}{" "}
            <select
              aria-label={t("Исходная платформа")}
              value={query.platform}
              onChange={(e) => change({ platform: e.target.value })}
            >
              <option value="">{t("Все платформы")}</option>
              {platforms.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <label>
            {t("Технология")}{" "}
            <select
              aria-label={t("Технология")}
              value={query.kind}
              onChange={(e) => change({ kind: e.target.value })}
            >
              <option value="">{t("Все технологии")}</option>
              {Object.entries(technologyLabels)
                .filter(([key]) => key !== "compatibility-runtime")
                .map(([key, label]) => (
                  <option key={key} value={key}>
                    {t(label)}
                  </option>
                ))}
            </select>
          </label>
          <label>
            {t("Стадия разработки")}{" "}
            <select
              aria-label={t("Стадия разработки")}
              value={query.lifecycle}
              onChange={(e) => change({ lifecycle: e.target.value })}
            >
              <option value="">{t("Все стадии")}</option>
              {Object.entries(lifecycleLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {t(label)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div
          className="hub-build-filter"
          role="group"
          aria-label={t("Наличие Windows-сборки")}
        >
          <span>{t("Windows-сборка")}</span>
          {[
            ["", t("Все")],
            ["available", t("Доступны")],
            ["unavailable", t("Недоступны")],
            ["unknown", t("Не указано")],
          ].map(([key, label]) => (
            <button
              key={key}
              aria-pressed={query.windows === key}
              onClick={() => change({ windows: key })}
            >
              {t(label)}
            </button>
          ))}
        </div>
      </section>
      <div className="hub-catalog-results-head">
        <h2 ref={resultsRef} tabIndex={-1}>
          {t("Проекты")}{" "}
          <span aria-live="polite" aria-atomic="true">
            {result.total}
          </span>
        </h2>
        <label>
          {t("Сортировка")}{" "}
          <select
            aria-label={t("Сортировка")}
            value={query.sort}
            onChange={(e) =>
              change({ sort: e.target.value as CatalogQuery["sort"] })
            }
          >
            <option value="catalog">{t("Порядок каталога")}</option>
            <option value="name">{t("Название: А → Я")}</option>
            <option value="name-desc">{t("Название: Я → А")}</option>
          </select>
        </label>
      </div>
      <div className="hub-source-status" aria-label={t("Состояние каталога")}>
        <span>
          <span>
            {catalog.source === "demo"
              ? t("Локальные тестовые данные")
              : catalog.source === "cache"
                ? t("Каталог сохранён на компьютере")
                : catalog.source === "empty" && !catalog.busy
                  ? t("Каталог ещё не загружен")
                  : catalog.busy
                    ? t("Обновление каталога…")
                    : t("Опубликованный каталог")}
          </span>
          {!native && " · WEB PREVIEW"}
        </span>
        <button
          aria-label={t("Обновить каталог")}
          disabled={catalog.busy}
          onClick={() => void catalog.refresh()}
        >
          <RotateCw size={14} aria-hidden="true" />
          {t("Обновить")}{" "}
        </button>
      </div>
      {error && (
        <div className="hub-catalog-error" role="alert">
          <span>
            {projects.length
              ? t("Не удалось обновить каталог. Последние данные сохранены.")
              : t(
                  "Не удалось загрузить каталог. Проверь подключение и повтори попытку.",
                )}
          </span>
          <button
            disabled={catalog.busy}
            onClick={() => void catalog.refresh()}
          >
            {t("Повторить")}{" "}
          </button>
        </div>
      )}
      {catalog.warning && (
        <p className="hub-catalog-note" role="status">
          {developerMode
            ? catalog.warning
            : t(
                "Некоторые изображения недоступны. Сведения о проектах сохранены.",
              )}
        </p>
      )}
      {catalog.notice && (
        <p className="hub-catalog-note" role="status">
          {t(catalog.notice)}
        </p>
      )}
      <section
        aria-label={t("Проекты каталога")}
        aria-busy={catalog.busy || deferredSearch !== query.search}
      >
        {catalog.busy && !projects.length ? (
          <div className="hub-catalog-grid" aria-label={t("Загрузка каталога")}>
            {[0, 1, 2].map((n) => (
              <div key={n} className="port-card-skeleton" />
            ))}
          </div>
        ) : result.items.length ? (
          <div className="hub-catalog-grid">
            {result.items.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                media={media(p)}
                onOpen={() => onOpen(p)}
              />
            ))}
          </div>
        ) : (
          (projects.length > 0 || !error) && (
            <div className="hub-catalog-empty">
              <Search size={32} aria-hidden="true" />
              <h3>
                {projects.length || active
                  ? t("Ничего не найдено")
                  : t("Каталог пока пуст")}
              </h3>
              <p>
                {projects.length
                  ? t("Попробуй другое название или сбрось фильтры.")
                  : t("Опубликованные проекты появятся здесь.")}
              </p>
              {active && (
                <button className="text-link" onClick={reset}>
                  {t("Сбросить фильтры")}{" "}
                </button>
              )}
            </div>
          )
        )}
      </section>
      {result.pages > 1 && (
        <nav
          className="hub-catalog-pagination"
          aria-label={t("Страницы каталога")}
        >
          <button
            disabled={result.page === 1}
            onClick={() => paging(result.page - 1)}
          >
            <ArrowLeft size={16} />
            {t("Назад")}{" "}
          </button>
          <span>
            {t("Страница")} {result.page}
            {t("из")} {result.pages}
          </span>
          <button
            disabled={result.page === result.pages}
            onClick={() => paging(result.page + 1)}
          >
            {t("Далее")} <ArrowRight size={16} />
          </button>
        </nav>
      )}
      <footer className="hub-catalog-note">
        {t(
          "Наличие сборки не подтверждает совместимость. Требования к оригинальным файлам — в информации о проекте.",
        )}{" "}
      </footer>
    </div>
  );
}
