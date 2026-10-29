import { useEffect, useState } from "react";
import { ArrowLeft, ArrowUpRight, Download } from "lucide-react";
import { GameArt, Gallery } from "../components/BloodborneMedia";
import { useV2Media } from "./v2-media";
import { projectTitle, technologyLabels } from "./catalog-model";
import type { CatalogProject } from "./catalog-model";
import { createV2Client, parseSourceConfig, type V2Detail } from "./api-v2";
import sourceConfig from "./source-config.json";
import "./project.css";
import { downloadUnavailable, type DownloadState } from "./downloads";
import { native } from "../services/settings";
import { Button } from "../components/ui";

/** Read-only v2 detail. Legacy IDs never become an installation identity. */
export function V2Project({
  project,
  onBack,
  downloads,
}: {
  project: CatalogProject;
  onBack: () => void;
  downloads: DownloadState;
}) {
  const [data, setData] = useState<V2Detail | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    setBusy(true);
    void Promise.resolve()
      .then(async () => {
        const config = parseSourceConfig(
          import.meta.env.VITE_HUB_SOURCE_JSON
            ? JSON.parse(import.meta.env.VITE_HUB_SOURCE_JSON)
            : sourceConfig,
        );
        if (config.version !== "v2")
          throw Error("Источник проекта v2 не настроен");
        return createV2Client(config.baseUrl).detail(project.id);
      })
      .then((result) => {
        if (active) setData(result);
      })
      .catch(() => {
        if (active)
          setError(
            "Не удалось загрузить проект. Проверьте подключение и повторите попытку.",
          );
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [project.id, attempt]);
  const currentProject = data?.project ?? project;
  const media = useV2Media(currentProject.media);
  const [linkError, setLinkError] = useState("");
  const title = currentProject.name || projectTitle(currentProject);
  const windows =
    data?.builds.filter(
      (b) =>
        b.os === "windows" &&
        (!b.url ||
          !/^https:\/\/github\.com\/[^/]+\/[^/]+\/archive\//.test(b.url)),
    ) ?? [];
  const [selectedBuild, setSelectedBuild] = useState("");
  const build =
    windows.find((b) => b.id === selectedBuild) ??
    windows.find((b) => b.channel === "stable" && !downloadUnavailable(b)) ??
    windows.find((b) => !downloadUnavailable(b)) ??
    windows[0];
  const reason = build ? downloadUnavailable(build) : null;
  const req = data?.requirements;
  const install = data?.instructions;
  const systems = [
    ...new Set(
      (
        currentProject.targetPlatforms ??
        data?.builds.map((b) => b.os) ??
        []
      ).map(
        (os) => ({ windows: "Windows", linux: "Linux", macos: "macOS" })[os],
      ),
    ),
  ];
  const specs = [
    ["Минимальные", req?.requirements.minimum],
    ["Рекомендуемые", req?.requirements.recommended],
  ] as const;
  const hasSpecs = specs.some(
    ([, values]) => values && Object.values(values).some(Boolean),
  );
  return (
    <article className="hub-project-page">
      <button className="back-link" onClick={onBack}>
        <ArrowLeft size={16} aria-hidden="true" /> Назад в каталог
      </button>
      <section
        className="hub-project-overview project-hero"
        aria-label="О проекте"
      >
        <GameArt
          src={media.gallery[0] || media.cover}
          fallbackLabel="Обложка недоступна"
          label={
            media.gallery[0] || media.cover
              ? `Обложка ${title}`
              : "Обложка недоступна"
          }
        />
        <div className="project-hero-shade" />
        <div className="project-hero-content">
          <p className="project-eyebrow">
            {technologyLabels[currentProject.kind]}
            {currentProject.platforms.length > 0 &&
              ` · ${currentProject.platforms.join(" / ")}`}
          </p>
          <h1>{title}</h1>
          {currentProject.description && (
            <p className="project-summary">{currentProject.description}</p>
          )}
          <section className="project-download" aria-label="Сборки">
            <h2 className="project-eyebrow">Сборки</h2>
            {busy ? (
              <p role="status">Загрузка проекта…</p>
            ) : error ? (
              <p role="alert">
                {error}{" "}
                <button
                  className="text-link"
                  onClick={() => setAttempt((n) => n + 1)}
                >
                  Повторить
                </button>
              </p>
            ) : build ? (
              <>
                {windows.length > 1 && (
                  <label className="project-build-choice">
                    Версия для Windows
                    <select
                      aria-label="Версия для Windows"
                      value={build.id}
                      onChange={(e) => setSelectedBuild(e.target.value)}
                    >
                      {windows.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.version}
                          {b.arch !== "unknown" ? ` · ${b.arch}` : ""}
                          {b.channel === "prerelease"
                            ? " · Предварительная"
                            : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <div className="project-download-row">
                  <Button
                    className="project-download-button"
                    disabled={!native || downloads.busy || !!reason}
                    onClick={() => void downloads.start(build, title)}
                  >
                    <Download size={20} aria-hidden="true" /> Скачать для
                    Windows
                  </Button>
                  <div className="project-release-meta">
                    <strong>Версия {build.version}</strong>
                    <span>
                      {[
                        build.size != null
                          ? `${(build.size / 1024 ** 2).toFixed(1)} МиБ`
                          : null,
                        build.channel === "prerelease"
                          ? "Предварительная версия"
                          : "Стабильная версия",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    {!reason && (
                      <span>Официальный файл проекта · GitHub Releases</span>
                    )}
                  </div>
                </div>
                <p className="project-download-note">
                  {reason ??
                    (!native
                      ? "Скачивание доступно в приложении PORT для Windows"
                      : "Выберите папку сохранения. Установка и запуск — вручную.")}
                </p>
              </>
            ) : (
              <p className="project-unavailable">
                Одобренные сборки для Windows пока не опубликованы. Исходный код
                и новости — на странице проекта.
              </p>
            )}
          </section>
        </div>
      </section>
      <dl className="project-facts">
        {currentProject.platforms.length > 0 && (
          <div>
            <dt>Оригинальная платформа</dt>
            <dd>{currentProject.platforms.join(" / ")}</dd>
          </div>
        )}
        <div>
          <dt>Тип порта</dt>
          <dd>{technologyLabels[currentProject.kind]}</dd>
        </div>
        {systems.length > 0 && (
          <div>
            <dt>Платформы проекта</dt>
            <dd>{systems.join(" · ")}</dd>
          </div>
        )}
        {!!currentProject.developers?.length && (
          <div>
            <dt>Разработчики порта</dt>
            <dd>{currentProject.developers.join(" · ")}</dd>
          </div>
        )}
      </dl>
      {media.gallery.length > 0 && (
        <Gallery images={media.gallery} title={title} horizontal />
      )}
      {currentProject.description &&
        currentProject.description.length > 120 && (
          <details className="project-section">
            <summary>Подробнее о проекте</summary>
            <p>{currentProject.description}</p>
          </details>
        )}
      {build?.changelog && (
        <details className="project-section project-changelog">
          <summary>Что нового в {build.version}</summary>
          <p>{build.changelog}</p>
        </details>
      )}
      <section className="project-information" aria-label="Данные проекта v2">
        {hasSpecs && (
          <section className="project-section">
            <h2>Системные требования</h2>
            <div className="project-spec-columns">
              {specs.map(
                ([label, values]) =>
                  values &&
                  Object.values(values).some(Boolean) && (
                    <div key={label}>
                      <h3>{label}</h3>
                      <dl>
                        {Object.entries(values)
                          .filter(([, value]) => value)
                          .map(([key, value]) => (
                            <div key={key}>
                              <dt>
                                {
                                  {
                                    os: "ОС",
                                    cpu: "Процессор",
                                    gpu: "Видеокарта",
                                    memory: "Память",
                                    storage: "Место на диске",
                                  }[key]
                                }
                              </dt>
                              <dd>{value}</dd>
                            </div>
                          ))}
                      </dl>
                    </div>
                  ),
              )}
            </div>
            {req?.requirements.notes && <p>{req.requirements.notes}</p>}
            {req?.requirements.source && (
              <p className="muted">Источник: {req.requirements.source}</p>
            )}
          </section>
        )}
        {!!req?.sourceRequirements.length && (
          <section className="project-section">
            <h2>Для начала игры</h2>
            <ul>
              {req.sourceRequirements.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </section>
        )}
        {!!req?.dependencies.length && (
          <section className="project-section">
            <h2>Зависимости</h2>
            <ul>
              {req.dependencies.map((d, i) => (
                <li key={i}>
                  {d.name}
                  {!d.required && " (необязательно)"}
                </li>
              ))}
            </ul>
          </section>
        )}
        {!!install?.install.steps.length && (
          <details className="project-section">
            <summary>Инструкция</summary>
            <ol>
              {install.install.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
            {install.install.notes && <p>{install.install.notes}</p>}
          </details>
        )}
        {!!install?.knownIssues.length && (
          <details className="project-section">
            <summary>Известные проблемы</summary>
            <ul>
              {install.knownIssues.map((s, i) => (
                <li key={i}>
                  {s.title}
                  {s.details && `: ${s.details}`}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
      {!!currentProject.officialLinks.length && (
        <section className="project-section">
          <h2>От разработчиков проекта</h2>
          <div className="hub-project-links">
            {currentProject.officialLinks.map((link) => (
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
          {linkError && <p role="alert">{linkError}</p>}
        </section>
      )}
    </article>
  );
}
