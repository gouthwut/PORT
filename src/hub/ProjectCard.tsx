import { t } from "./i18n";
import { FavoriteButton } from "./preferences";
import { useV2Media } from "./v2-media";
import { useProjectArtwork } from "./artwork";
import { useState } from "react";
import {
  ArrowUpRight,
  FlaskConical,
  ImageOff,
  MonitorDown,
} from "lucide-react";
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
  home = false,
}: {
  project: CatalogProject;
  media: MediaSet;
  onOpen: () => void;
  home?: boolean;
}) {
  const v2Media = useV2Media(project.legacy ? undefined : suppliedMedia);
  const media = project.legacy ? suppliedMedia : v2Media;
  const art = useProjectArtwork(media);
  const frame = art.frame;
  const title = projectTitle(project);
  const build = {
    available: t("Windows-сборка"),
    unavailable: t("Без Windows-сборки"),
    unknown: t("Сборка не указана"),
  }[project.windows];
  return (
    <div className="project-card-wrapper" data-artwork={art.kind}>
      <FavoriteButton id={project.id} />
      <button
        className="port-project hub-project-card"
        onClick={onOpen}
        aria-label={
          home
            ? `${t("Открыть проект")} ${title}`
            : `${t("Подробнее:")} ${title}${project.name && project.name !== title ? ` · ${project.name}` : ""}`
        }
      >
        <span className="port-project-image" data-has-frame={!!frame}>
          {frame ? (
            <img
              src={frame}
              alt=""
              loading="lazy"
              decoding="async"
              onError={() => art.fail(frame)}
            />
          ) : art.cover ? (
            <img
              src={art.cover}
              alt=""
              loading="lazy"
              decoding="async"
              onError={() => art.fail(art.cover)}
            />
          ) : (
            <span className="port-image-missing">
              <b className="card-brand">PORT//</b>
              <span>{t("Обложка недоступна")}</span>
            </span>
          )}
          <span className="port-project-platform">
            {project.platforms.join(" · ") || t("Платформа не указана")}
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
                ? t(
                    "Наличие сборки по данным каталога. Не является проверкой совместимости.",
                  )
                : undefined
            }
          >
            <span />
            {t(build)}
          </span>
          <strong>{project.name || title}</strong>
          {project.name && project.name !== title && (
            <span className="hub-project-name">{title}</span>
          )}
          {project.description && (
            <span className="hub-project-description">
              {project.description}
            </span>
          )}
        </span>
        <span className="port-project-meta">
          <span>{t(technologyLabels[project.kind])}</span>
          <span>
            {t("О проекте")} <ArrowUpRight size={14} aria-hidden="true" />
          </span>
        </span>
      </button>
    </div>
  );
}

/** Compact catalog entry; availability and compatibility are independent facts. */
export function CompactProjectCard({
  project,
  onOpen,
}: {
  project: CatalogProject;
  onOpen: () => void;
}) {
  const media = useV2Media(project.media);
  const [failedCover, setFailedCover] = useState("");
  const experimental = ["alpha", "beta"].includes(project.lifecycle);
  const available = project.windows === "available";
  return (
    <button
      className="port-compact-project"
      onClick={onOpen}
      aria-label={`${t("Подборка:")} ${projectTitle(project)}`}
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
          <ImageOff size={24} role="img" aria-label={t("Обложка недоступна")} />
        )}
      </span>
      <span className="port-compact-copy">
        <span className="port-compact-platform">
          {project.platforms.join(" · ") || t("Платформа не указана")}
        </span>
        <strong>{projectTitle(project)}</strong>
        <span className="port-compact-badges">
          {available && (
            <span className="port-compact-badge">
              <MonitorDown size={12} aria-hidden="true" /> Windows
            </span>
          )}
          {experimental && (
            <span className="port-compact-badge is-experimental">
              <FlaskConical size={12} aria-hidden="true" />
              {t("Экспериментальный")}{" "}
            </span>
          )}
          {!available && (
            <span className="port-compact-badge is-unavailable">
              {project.windows === "unavailable"
                ? t("Без Windows-сборки")
                : t("Сборка не указана")}
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
