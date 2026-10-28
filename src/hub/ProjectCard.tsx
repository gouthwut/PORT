import { useV2Media } from "./v2-media";
import { useState } from "react";
import {
  ArrowUpRight,
  FlaskConical,
  ImageOff,
  MonitorDown,
} from "lucide-react";
import type { PublishedGame } from "../services/catalog";
import type { MediaSet } from "../services/media";
import {
  projectTitle,
  technologyLabels,
  type CatalogProject,
} from "./catalog-model";

export function ProjectCard({
  project,
  media: suppliedMedia,
  onOpen,
}: {
  project: CatalogProject;
  media: MediaSet;
  onOpen: () => void;
}) {
  const v2Media = useV2Media(project.legacy ? undefined : suppliedMedia);
  const media = project.legacy ? suppliedMedia : v2Media;
  const [failed, setFailed] = useState("");
  const title = projectTitle(project);
  const build = {
    available: "Windows-сборка",
    unavailable: "Без Windows-сборки",
    unknown: "Сборка не указана",
  }[project.windows];
  return (
    <button
      className="port-project hub-project-card"
      onClick={onOpen}
      aria-label={`Подробнее: ${title}${project.name && project.name !== title ? ` · ${project.name}` : ""}`}
    >
      <span className="port-project-image">
        {media.cover && failed !== media.cover ? (
          <img
            src={media.cover}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setFailed(media.cover)}
          />
        ) : (
          <span className="port-image-missing">
            <ImageOff size={28} aria-hidden="true" />
            <span>Обложка недоступна</span>
          </span>
        )}
        <span className="port-project-platform">
          {project.platforms.join(" · ") || "Платформа не указана"}
        </span>
        <span className="port-project-open">
          <ArrowUpRight size={18} aria-hidden="true" />
        </span>
      </span>
      <span className="hub-project-copy">
        <span
          className={`hub-build-status ${project.windows === "available" ? "has-build" : ""}`}
          title={
            project.buildEvidence === "editorial-v1"
              ? "Наличие сборки по данным каталога. Не является проверкой совместимости."
              : undefined
          }
        >
          <span />
          {build}
        </span>
        <strong>{title}</strong>
        {project.name && project.name !== title && (
          <span className="hub-project-name">{project.name}</span>
        )}
      </span>
      <span className="port-project-meta">
        <span>{technologyLabels[project.kind]}</span>
        <span>
          О проекте <ArrowUpRight size={14} aria-hidden="true" />
        </span>
      </span>
    </button>
  );
}

/** Compact catalog entry; availability and compatibility are independent facts. */
export function CompactProjectCard({
  project,
  media,
  onOpen,
}: {
  project: PublishedGame;
  media: MediaSet;
  onOpen: () => void;
}) {
  const [failedCover, setFailedCover] = useState("");
  const experimental = project.compatibility.status === "experimental";
  const available = project.windowsBuild === "available";
  return (
    <button
      className="port-compact-project"
      onClick={onOpen}
      aria-label={`Подборка: ${project.title}`}
    >
      <span className="port-compact-cover">
        {media.cover && failedCover !== media.cover ? (
          <img
            src={media.cover}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setFailedCover(media.cover)}
          />
        ) : (
          <ImageOff size={24} role="img" aria-label="Обложка недоступна" />
        )}
      </span>
      <span className="port-compact-copy">
        <span className="port-compact-platform">{project.sourceConsole}</span>
        <strong>{project.title}</strong>
        <span className="port-compact-badges">
          {available && (
            <span className="port-compact-badge">
              <MonitorDown size={12} aria-hidden="true" /> Windows
            </span>
          )}
          {experimental && (
            <span className="port-compact-badge is-experimental">
              <FlaskConical size={12} aria-hidden="true" /> Экспериментальный
            </span>
          )}
          {!available && (
            <span className="port-compact-badge is-unavailable">
              Без Windows-сборки
            </span>
          )}
        </span>
      </span>
      <ArrowUpRight
        className="port-compact-arrow"
        size={17}
        aria-hidden="true"
      />
    </button>
  );
}
