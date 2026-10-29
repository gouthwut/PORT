import { useState, type ReactNode } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  FlaskConical,
  Layers3,
  MonitorDown,
  Grid2X2,
  ImageOff,
  RotateCw,
} from "lucide-react";
import type { ProjectCatalogState } from "./catalog-source";
import {
  projectTitle,
  technologyLabels,
  type CatalogProject,
} from "./catalog-model";
import { useV2Media } from "./v2-media";
import { CompactProjectCard } from "./ProjectCard";
const platformShort = (platform: string) =>
  platform.replace("PlayStation ", "PS");
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
            Консольные
            <br />
            миры
            <br />
            <span>на твоём ПК</span>
          </h1>
          <p className="port-intro">
            Открывай независимые порты,
            <br className="port-desktop-break" /> рекомпиляции и новые способы
            играть.
          </p>
          <button className="port-cta" onClick={() => onCatalog()}>
            Исследовать каталог <ArrowRight size={18} />
          </button>
        </div>
        <div className="port-art-credit">Оригинальная иллюстрация PORT//</div>
      </section>

      <div className="port-home-body">
        <nav className="port-platforms" aria-label="Быстрый выбор платформы">
          <button aria-pressed={!selected} onClick={() => setPlatform("")}>
            <Grid2X2 size={17} />
            Все платформы
          </button>
          {platforms.map(([key, name]) => (
            <button
              key={key}
              aria-label={name}
              aria-pressed={selected === key}
              onClick={() => setPlatform(key)}
            >
              <span className={`port-platform-symbol port-platform-${key}`}>
                {platformShort(key)}
              </span>
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
              <p className="port-kicker">ПРОЕКТЫ СООБЩЕСТВА</p>
              <h2 id="editorial-title">
                Выбор редакции<span className="port-section-dot">/</span>
              </h2>
            </div>
            <button onClick={() => onCatalog()}>
              Весь каталог <ArrowRight size={16} />
            </button>
          </header>
          <p className="port-order-note">
            В порядке каталога PORT
            {selected
              ? ` · ${platforms.find(([key]) => key === selected)?.[1]}`
              : ""}
          </p>
          {(catalog.error || catalog.warning) && (
            <div className="port-catalog-notice" role="status">
              <span>
                {projects.length
                  ? "Показана сохранённая копия каталога. Обновление пока недоступно."
                  : "Каталог не удалось загрузить."}
              </span>
              <button onClick={() => void catalog.refresh()}>
                <RotateCw size={15} />
                Повторить
              </button>
            </div>
          )}
          {catalog.busy && !projects.length ? (
            <div
              className="port-project-grid"
              aria-label="Загрузка каталога"
              aria-busy="true"
            >
              {[0, 1, 2].map((n) => (
                <div key={n} className="port-card-skeleton" />
              ))}
            </div>
          ) : visible.length ? (
            <div className="port-project-grid">
              {visible.map((p) => (
                <HomeProject key={p.id} project={p} onOpen={() => onOpen(p)} />
              ))}
            </div>
          ) : (
            !catalog.error && (
              <p className="port-empty">
                Опубликованные проекты появятся здесь.
              </p>
            )
          )}
        </section>
        {projects.length > 0 && (
          <>
            {(builds.length > 0 || experimental.length > 0) && (
              <div className="port-discovery">
                <ProjectShelf
                  title="Сборки для Windows"
                  icon={<MonitorDown size={20} />}
                  projects={builds}
                  onOpen={onOpen}
                  description="Требования и условия запуска — в проекте."
                />
                <ProjectShelf
                  title="Экспериментальные проекты"
                  icon={<FlaskConical size={20} />}
                  projects={experimental}
                  onOpen={onOpen}
                  description="Альфа- и бета-проекты. Сведения о сборках — в проекте."
                />
              </div>
            )}
            <button className="port-catalog-door" onClick={onCatalog}>
              <span className="port-door-icon">
                <Layers3 size={24} />
              </span>
              <span>
                <strong>Найди следующий проект</strong>
                <span>Открой полный каталог и сравни требования.</span>
              </span>
              <ArrowRight size={22} />
            </button>
          </>
        )}
        <footer className="port-home-footer">
          <span>
            Независимые проекты · собственная копия игры может потребоваться
          </span>
          <span>
            PORT<span className="port-footer-slash">//</span> <i /> CONSOLE → PC
          </span>
        </footer>
      </div>
    </div>
  );
}

function HomeProject({
  project: p,
  onOpen,
}: {
  project: CatalogProject;
  onOpen: () => void;
}) {
  const media = useV2Media(p.media);
  const [failed, setFailed] = useState("");
  return (
    <button
      className="port-project"
      onClick={onOpen}
      aria-label={`Открыть проект ${projectTitle(p)}`}
    >
      <div className="port-project-image">
        {media.cover && failed !== media.cover ? (
          <img
            src={media.cover}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setFailed(media.cover)}
          />
        ) : (
          <div className="port-image-missing">
            <ImageOff size={26} />
            <span>Обложка недоступна</span>
          </div>
        )}
        <span className="port-project-platform">
          {p.platforms.map(platformShort).join(" · ") || "Платформа не указана"}
        </span>
        <span className="port-project-open">
          <ArrowUpRight size={18} />
        </span>
        <div className="port-project-caption">
          <span
            className={`port-project-status ${p.windows === "available" ? "has-build" : ""}`}
          >
            {p.windows === "available"
              ? "Windows-сборка"
              : p.windows === "unavailable"
                ? "Без Windows-сборки"
                : "Сборка не указана"}
          </span>
          <h3>{projectTitle(p)}</h3>
        </div>
      </div>
      <div className="port-project-meta">
        <span>{technologyLabels[p.kind]}</span>
        <span>
          О проекте <ArrowRight size={13} />
        </span>
      </div>
    </button>
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
        <h2>{title}</h2>
      </header>
      <p>{description}</p>
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
