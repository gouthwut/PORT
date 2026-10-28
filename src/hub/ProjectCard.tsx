import { useState } from "react";
import {
  ArrowUpRight,
  FlaskConical,
  ImageOff,
  MonitorDown,
} from "lucide-react";
import type { PublishedGame } from "../services/catalog";
import type { MediaSet } from "../services/media";

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
