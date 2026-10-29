import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
} from "lucide-react";
import { useV2Media } from "./v2-media";
import { ProjectHero } from "./ProjectHero";
import {
  projectTitle,
  technologyLabels,
  type CatalogProject,
} from "./catalog-model";
import { t } from "./i18n";

/** Bounded, stable CMS order. Publication alone never grants a download action. */
export function featuredProjects(projects: CatalogProject[]) {
  return projects.slice(0, 6);
}

function FeaturedSlide({
  project,
  onOpen,
}: {
  project: CatalogProject;
  onOpen: () => void;
}) {
  const media = useV2Media(project.media);
  const title = project.name || projectTitle(project);
  return (
    <ProjectHero media={media} title={title} className="featured-hero">
      <p className="port-kicker">
        PORT// <small>{t("ПРОЕКТЫ СООБЩЕСТВА")}</small>
      </p>
      <div className="project-badges">
        <span>
          {project.platforms.join(" · ") || t("Платформа не указана")}
        </span>
        <span>{t(technologyLabels[project.kind])}</span>
      </div>
      <h1>{title}</h1>
      <p className="featured-summary">
        {project.description || t("Подробности — на странице проекта.")}
      </p>
      <div className="featured-actions">
        <button className="port-cta" onClick={onOpen}>
          {t("Открыть проект")} <ArrowRight size={18} aria-hidden="true" />
        </button>
        {project.windows === "available" &&
          project.buildEvidence === "approved-v2" && (
            <span className="featured-build">{t("Windows-сборка")}</span>
          )}
      </div>
    </ProjectHero>
  );
}

export function FeaturedCarousel({
  projects,
  onOpen,
}: {
  projects: CatalogProject[];
  onOpen: (project: CatalogProject) => void;
}) {
  const slides = featuredProjects(projects);
  const [selectedId, setSelectedId] = useState("");
  const index = Math.max(
    0,
    slides.findIndex((p) => p.id === selectedId),
  );
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(!document.hidden);
  const [windowFocused, setWindowFocused] = useState(document.hasFocus());
  const reduced = useReducedMotion();
  const ids = slides.map((p) => p.id).join("|");
  const playing =
    slides.length > 1 &&
    !reduced &&
    !paused &&
    !hover &&
    !focus &&
    visible &&
    windowFocused;
  useEffect(() => {
    const visibility = () => setVisible(!document.hidden);
    const blur = () => setWindowFocused(false);
    const focus = () => setWindowFocused(true);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("blur", blur);
    window.addEventListener("focus", focus);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("blur", blur);
      window.removeEventListener("focus", focus);
    };
  }, []);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(
      () => setSelectedId(slides[(index + 1) % slides.length].id),
      7000,
    );
    return () => window.clearTimeout(timer);
  }, [playing, index, ids]);
  const select = (next: number) => {
    setPaused(true);
    setSelectedId(slides[(next + slides.length) % slides.length].id);
  };
  return (
    <section
      className="featured-carousel"
      aria-label={t("Избранные проекты каталога")}
      aria-roledescription={t("Карусель")}
      data-playing={playing}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocusCapture={() => setFocus(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setFocus(false);
      }}
      onPointerDown={() => setPaused(true)}
    >
      <div className="featured-slides" aria-live={playing ? "off" : "polite"}>
        {slides.map((project, i) => (
          <div
            key={project.id}
            className={`featured-slide ${i === index ? "is-active" : ""}`}
            role="group"
            aria-roledescription={t("Слайд")}
            aria-label={`${i + 1} / ${slides.length}`}
            aria-hidden={i !== index}
            inert={i !== index}
            data-project-id={project.id}
          >
            {/* Keeping at most six decoded slides mounted preloads the next frame and prevents flashes. */}
            <FeaturedSlide project={project} onOpen={() => onOpen(project)} />
          </div>
        ))}
      </div>
      {slides.length > 1 && (
        <div className="featured-controls">
          <button
            aria-label={t("Предыдущий проект")}
            onClick={() => select(index - 1)}
          >
            <ChevronLeft size={18} />
          </button>
          <div className="featured-dots">
            {slides.map((p, i) => (
              <button
                key={p.id}
                aria-label={`${t("Показать проект")} ${p.name || projectTitle(p)}`}
                aria-current={i === index ? "true" : undefined}
                onClick={() => select(i)}
              >
                <span />
              </button>
            ))}
          </div>
          <button
            aria-label={t("Следующий проект")}
            onClick={() => select(index + 1)}
          >
            <ChevronRight size={18} />
          </button>
          {!reduced && (
            <button
              aria-label={t(
                paused ? "Включить автосмену" : "Остановить автосмену",
              )}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setPaused(!paused)}
            >
              {paused ? <Play size={15} /> : <Pause size={15} />}
            </button>
          )}
          <span className="featured-counter" aria-hidden="true">
            {String(index + 1).padStart(2, "0")} /{" "}
            {String(slides.length).padStart(2, "0")}
          </span>
        </div>
      )}
    </section>
  );
}
