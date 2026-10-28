import { useState } from "react";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { GameArt } from "../components/BloodborneMedia";
import type { MediaSet } from "../services/media";
import { native } from "../services/settings";
import {
  projectTitle,
  technologyLabels,
  type CatalogProject,
} from "./catalog-model";
import "./project.css";

/** Public presentation only; installation identity stays in the v1 action layer. */
export function ProjectOverview({
  project,
  media,
  onBack,
}: {
  project: CatalogProject;
  media: MediaSet;
  onBack: () => void;
}) {
  const [linkError, setLinkError] = useState("");
  const title = projectTitle(project);
  return (
    <section className="hub-project-overview" aria-label="О проекте">
      <button className="back-link" onClick={onBack}>
        <ArrowLeft size={16} aria-hidden="true" /> Назад в каталог
      </button>
      <header className="detail-banner">
        <GameArt
          src={media.cover || media.banner || media.hero}
          fallbackLabel="Обложка недоступна"
          label={
            media.cover || media.banner || media.hero
              ? `Обложка ${title}`
              : "Обложка недоступна"
          }
        />
        <div className="hero-shade" />
        <div>
          <h1>{title}</h1>
        </div>
      </header>
      <dl className="requirements">
        <div>
          <dt>Название проекта</dt>
          <dd>{project.name || "Не указано"}</dd>
        </div>
        <div>
          <dt>Исходные платформы</dt>
          <dd>{project.platforms.join(" · ") || "Не указаны"}</dd>
        </div>
        <div>
          <dt>Технология порта</dt>
          <dd>{technologyLabels[project.kind]}</dd>
        </div>
        <div>
          <dt>Сборка для Windows</dt>
          <dd>
            {
              {
                available: "Доступна по данным каталога",
                unavailable: "Недоступна",
                unknown: "Не указана",
              }[project.windows]
            }
          </dd>
        </div>
      </dl>
      <h2>Описание</h2>
      <p className="body-copy catalog-description">
        {project.description || "Описание не указано."}
      </p>
      <h2>Официальные ссылки</h2>
      {project.officialLinks.length ? (
        <div className="hub-project-links">
          {project.officialLinks.map((link) => (
            <a
              className="text-link"
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={
                native
                  ? async (e) => {
                      e.preventDefault();
                      setLinkError("");
                      try {
                        const { openUrl } =
                          await import("@tauri-apps/plugin-opener");
                        await openUrl(link.url);
                      } catch {
                        setLinkError("Не удалось открыть ссылку");
                      }
                    }
                  : undefined
              }
            >
              {link.label} <ArrowUpRight size={15} aria-hidden="true" />
            </a>
          ))}
        </div>
      ) : (
        <p className="muted">Подтверждённые ссылки не указаны.</p>
      )}
      {linkError && <p role="alert">{linkError}</p>}
    </section>
  );
}
