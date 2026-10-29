import { t } from "./i18n";
import { useState, type ReactNode } from "react";
import {
  ArrowRight,
  FlaskConical,
  Layers3,
  MonitorDown,
  Grid2X2,
  RotateCw,
} from "lucide-react";
import type { ProjectCatalogState } from "./catalog-source";
import { type CatalogProject } from "./catalog-model";
import { emptyMedia } from "../services/media";
import { ProjectCard, CompactProjectCard } from "./ProjectCard";
import hero from "./assets/hub-hero.webp";

export function HubLanding({
  catalog,
  onOpen,
  onCatalog,
}: {
  catalog: ProjectCatalogState;
  onOpen: (project: CatalogProject) => void;
  onCatalog: () => void;
}) {
  const [platform, setPlatform] = useState("");
  // Only published CMS records belong on Home, including in development.
  const projects = catalog.projects;
  const platforms = [
    ...new Map(
      projects.flatMap((p) =>
        p.platforms.map((platform) => [platform, platform] as const),
      ),
    ).entries(),
  ];
  const selected = platforms.some(([key]) => key === platform) ? platform : "";
  const filtered = projects.filter(
    (p) => !selected || p.platforms.includes(selected),
  );
  const visible = filtered.slice(0, 6);
  const builds = filtered.filter((p) => p.windows === "available").slice(0, 3);
  const experimental = filtered
    .filter(
      (p) =>
        ["alpha", "beta"].includes(p.lifecycle) && p.windows !== "available",
    )
    .slice(0, 3);
  return (
    <div className="port-home">
      <section className="port-hero" aria-labelledby="hub-title">
        <img className="port-hero-art" src={hero} alt="" fetchPriority="high" />
        <div className="port-hero-shade" />
        <div className="port-hero-copy">
          <p className="port-kicker">
            <span />
            PORT// <i /> CONSOLE TO PC
          </p>
          <h1 id="hub-title">
            {t("Консольные")} {t("миры")} <br />
            <span>{t("на твоём ПК")}</span>
          </h1>
          <p className="port-intro">
            {t("Открывай независимые порты,")}{" "}
            <br className="port-desktop-break" />
            {t("рекомпиляции и новые способы играть.")}{" "}
          </p>
          <button className="port-cta" onClick={() => onCatalog()}>
            {t("Исследовать каталог")} <ArrowRight size={18} />
          </button>
        </div>
        <div className="port-art-credit">
          {t("Оригинальная иллюстрация PORT//")}
        </div>
      </section>

      <div className="port-home-body">
        <nav
          className="port-platforms"
          aria-label={t("Быстрый выбор платформы")}
        >
          <button aria-pressed={!selected} onClick={() => setPlatform("")}>
            <Grid2X2 size={17} />
            {t("Все платформы")}{" "}
          </button>
          {platforms.map(([key, name]) => (
            <button
              key={key}
              aria-label={name}
              aria-pressed={selected === key}
              onClick={() => setPlatform(key)}
            >
              {name}
              <span className="port-platform-count" aria-hidden="true">
                {projects.filter((p) => p.platforms.includes(key)).length}
              </span>
            </button>
          ))}
        </nav>
        <section className="port-editorial" aria-labelledby="editorial-title">
          <header className="port-section-head">
            <div>
              <p className="port-kicker">{t("ПРОЕКТЫ СООБЩЕСТВА")}</p>
              <h2 id="editorial-title">
                {t("Проекты")}
                <span className="port-section-dot">/</span>
              </h2>
            </div>
            <button onClick={() => onCatalog()}>
              {t("Весь каталог")} <ArrowRight size={16} />
            </button>
          </header>
          <p className="port-order-note">
            {t("В порядке каталога PORT")}{" "}
            {selected
              ? ` · ${platforms.find(([key]) => key === selected)?.[1]}`
              : ""}
          </p>
          {(catalog.error || catalog.warning) && (
            <div className="port-catalog-notice" role="status">
              <span>
                {projects.length
                  ? t(
                      "Показана сохранённая копия каталога. Обновление пока недоступно.",
                    )
                  : t("Каталог не удалось загрузить.")}
              </span>
              <button onClick={() => void catalog.refresh()}>
                <RotateCw size={15} />
                {t("Повторить")}{" "}
              </button>
            </div>
          )}
          {catalog.busy && !projects.length ? (
            <div
              className="port-project-grid"
              aria-label={t("Загрузка каталога")}
              aria-busy="true"
            >
              {[0, 1, 2].map((n) => (
                <div key={n} className="port-card-skeleton" />
              ))}
            </div>
          ) : visible.length ? (
            <div className="port-project-grid">
              {visible.map((p) => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  media={p.media ?? emptyMedia}
                  home
                  onOpen={() => onOpen(p)}
                />
              ))}
            </div>
          ) : (
            !catalog.error && (
              <p className="port-empty">
                {t("Опубликованные проекты появятся здесь.")}{" "}
              </p>
            )
          )}
        </section>
        {projects.length > 0 && (
          <>
            {(builds.length > 0 || experimental.length > 0) && (
              <div className="port-discovery">
                <ProjectShelf
                  title={t("Сборки для Windows")}
                  icon={<MonitorDown size={20} />}
                  projects={builds}
                  onOpen={onOpen}
                  description={t("Требования и условия запуска — в проекте.")}
                />
                <ProjectShelf
                  title={t("Экспериментальные проекты")}
                  icon={<FlaskConical size={20} />}
                  projects={experimental}
                  onOpen={onOpen}
                  description={t(
                    "Альфа- и бета-проекты. Сведения о сборках — в проекте.",
                  )}
                />
              </div>
            )}
            <button className="port-catalog-door" onClick={onCatalog}>
              <span className="port-door-icon">
                <Layers3 size={24} />
              </span>
              <span>
                <strong>{t("Найди следующий проект")}</strong>
                <span>{t("Открой полный каталог и сравни требования.")}</span>
              </span>
              <ArrowRight size={22} />
            </button>
          </>
        )}
        <footer className="port-home-footer">
          <span>
            {t(
              "Независимые проекты · собственная копия игры может потребоваться",
            )}{" "}
          </span>
          <span>
            PORT<span className="port-footer-slash">//</span> <i /> CONSOLE → PC
          </span>
        </footer>
      </div>
    </div>
  );
}

function ProjectShelf({
  title,
  icon,
  projects,
  onOpen,
  description,
}: {
  title: string;
  icon: ReactNode;
  projects: CatalogProject[];
  onOpen: (project: CatalogProject) => void;
  description: string;
}) {
  if (!projects.length) return null;
  return (
    <section className="port-shelf" aria-label={title}>
      <header>
        <span className="port-shelf-icon" aria-hidden="true">
          {icon}
        </span>
        <h2>{t(title)}</h2>
      </header>
      <p>{t(description)}</p>
      <ul>
        {projects.map((p) => (
          <li key={p.id}>
            <CompactProjectCard project={p} onOpen={() => onOpen(p)} />
          </li>
        ))}
      </ul>
    </section>
  );
}
