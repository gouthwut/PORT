import { t, downloadMessage, useLanguage } from "./i18n";
import { compareVersions, newerDownload } from "./releases";
import { FavoriteButton } from "./preferences";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowUpRight, Copy, Download } from "lucide-react";
import { Gallery } from "../components/BloodborneMedia";
import { useV2Media } from "./v2-media";
import { ProjectHero } from "./ProjectHero";
import {
  projectTitle,
  technologyLabels,
  lifecycleLabels,
} from "./catalog-model";
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
  backLabel = "Назад в каталог",
  downloads,
}: {
  project: CatalogProject;
  onBack: () => void;
  backLabel?: string;
  downloads: DownloadState;
}) {
  const language = useLanguage();
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
          import.meta.env.DEV && import.meta.env.VITE_HUB_SOURCE_JSON
            ? JSON.parse(import.meta.env.VITE_HUB_SOURCE_JSON)
            : sourceConfig,
        );
        if (config.version !== "v2")
          throw Error(t("Источник проекта v2 не настроен"));
        return createV2Client(config.baseUrl).detail(project.id);
      })
      .then((result) => {
        if (active) setData(result);
      })
      .catch(() => {
        if (active)
          setError(
            t(
              "Не удалось загрузить проект. Проверьте подключение и повторите попытку.",
            ),
          );
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [project.id, attempt, language]);
  const currentProject = data?.project ?? project;
  const media = useV2Media(currentProject.media);
  const [linkError, setLinkError] = useState("");
  const [copyStatus, setCopyStatus] = useState<"" | "copied" | "error">("");
  useEffect(() => {
    setCopyStatus("");
  }, [project.id, language]);
  useEffect(() => {
    if (!copyStatus) return;
    const timer = setTimeout(() => setCopyStatus(""), 2500);
    return () => clearTimeout(timer);
  }, [copyStatus]);
  const title = currentProject.name || projectTitle(currentProject);
  const windows =
    data?.builds
      .filter(
        (b) =>
          b.os === "windows" &&
          (!b.url ||
            !/^https:\/\/github\.com\/[^/]+\/[^/]+\/archive\//.test(b.url)),
      )
      .sort((a, b) => compareVersions(b.version, a.version) ?? 0) ?? [];
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
    [t("Минимальные"), req?.requirements.minimum],
    [t("Рекомендуемые"), req?.requirements.recommended],
  ] as const;
  const hasSpecs = specs.some(
    ([, values]) => values && Object.values(values).some(Boolean),
  );
  const hasRequirements = !!(
    hasSpecs ||
    req?.requirements.notes ||
    req?.requirements.source
  );
  return (
    <article className="hub-project-page">
      <button className="back-link" onClick={onBack}>
        <ArrowLeft size={16} aria-hidden="true" />
        {t(backLabel)}{" "}
      </button>
      <ProjectHero
        media={media}
        title={title}
        label={t("О проекте")}
        className="project-hero"
      >
        <div className="project-badges">
          {currentProject.platforms.map((platform) => (
            <span key={platform}>{platform}</span>
          ))}
          <span>{t(technologyLabels[currentProject.kind])}</span>
          {currentProject.lifecycle !== "unknown" && (
            <span>{t(lifecycleLabels[currentProject.lifecycle])}</span>
          )}
        </div>
        <div className="project-title-row">
          <h1>{title}</h1>
          <FavoriteButton id={project.id} />
        </div>
        {currentProject.description && (
          <p className="project-summary">{currentProject.description}</p>
        )}
        <section
          id="project-download"
          className="project-download"
          aria-label={t("Сборки")}
        >
          <h2 className="project-eyebrow">{t("Сборки")}</h2>
          {busy ? (
            <p role="status">{t("Загрузка проекта…")}</p>
          ) : error ? (
            <p role="alert">
              {t(error)}{" "}
              <button
                className="text-link"
                onClick={() => setAttempt((n) => n + 1)}
              >
                {t("Повторить")}{" "}
              </button>
            </p>
          ) : build ? (
            <>
              {windows.length > 1 && (
                <label className="project-build-choice">
                  {t("Версия для Windows")}{" "}
                  <select
                    aria-label={t("Версия для Windows")}
                    value={build.id}
                    onChange={(e) => setSelectedBuild(e.target.value)}
                  >
                    {windows.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.version}
                        {downloadUnavailable(b) ? t(" · Недоступна") : ""}
                        {b.arch !== "unknown" ? ` · ${b.arch}` : ""}
                        {b.channel === "prerelease"
                          ? t(" · Предварительная")
                          : ""}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {newerDownload(build, downloads.history) && (
                <p className="project-update-note" role="status">
                  {t(
                    "Доступна новая версия. Скачайте новый официальный архив; файлы игры не заменяются.",
                  )}{" "}
                </p>
              )}
              <div className="project-download-row">
                <Button
                  className="project-download-button"
                  disabled={!native || downloads.busy || !!reason}
                  onClick={() => void downloads.start(build, title)}
                >
                  <Download size={20} aria-hidden="true" />
                  {t("Скачать для Windows")}{" "}
                </Button>
                <div className="project-release-meta">
                  <strong>
                    {t("Версия")} {build.version}
                  </strong>
                  <span>
                    {[
                      build.size != null
                        ? `${(build.size / 1024 ** 2).toFixed(1)} ${t("МиБ")}`
                        : null,
                      build.channel === "prerelease"
                        ? t("Предварительная версия")
                        : t("Стабильная версия"),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  {!reason && (
                    <span>
                      {t("Официальный файл проекта · GitHub Releases")}
                    </span>
                  )}
                </div>
              </div>
              <p className="project-download-note">
                {(reason ? t(reason) : null) ??
                  (!native
                    ? t("Скачивание доступно в приложении PORT для Windows")
                    : t(
                        "Выберите папку сохранения. Установка и запуск — вручную.",
                      ))}
              </p>
              {downloads.status?.projectId === project.id &&
                downloads.status.message && (
                  <p className="project-download-status" role="status">
                    {downloadMessage(downloads.status.message)}
                  </p>
                )}
            </>
          ) : (
            <p className="project-unavailable">
              {t(
                "Одобренные сборки для Windows пока не опубликованы. Исходный код и новости — на странице проекта.",
              )}{" "}
            </p>
          )}
        </section>
      </ProjectHero>
      {media.gallery.length > 0 && (
        <Gallery images={media.gallery} title={title} horizontal />
      )}
      <nav className="project-section-nav" aria-label={t("О проекте")}>
        {[
          ["project-overview", t("О проекте"), true],
          ["project-download", t("Сборки"), !!build],
          [
            "project-install",
            t("Инструкция"),
            !!(install?.install.steps.length || install?.install.notes),
          ],
          ["project-requirements", t("Системные требования"), hasRequirements],
          [
            "project-issues",
            t("Известные проблемы"),
            !!install?.knownIssues.length,
          ],
          [
            "project-changelog",
            t("Что нового в") + " " + (build?.version ?? ""),
            !!build?.changelog,
          ],
        ]
          .filter(([, , visible]) => visible)
          .map(([id, label]) => (
            <a
              key={String(id)}
              href={"#" + id}
              onClick={() => {
                const section = document.getElementById(String(id));
                if (section instanceof HTMLDetailsElement) section.open = true;
              }}
            >
              {label}
            </a>
          ))}
      </nav>
      <dl id="project-overview" className="project-facts">
        {currentProject.platforms.length > 0 && (
          <div>
            <dt>{t("Оригинальная платформа")}</dt>
            <dd>{currentProject.platforms.join(" / ")}</dd>
          </div>
        )}
        <div>
          <dt>{t("Тип порта")}</dt>
          <dd>{t(technologyLabels[currentProject.kind])}</dd>
        </div>
        {systems.length > 0 && (
          <div>
            <dt>{t("Платформы проекта")}</dt>
            <dd>{systems.join(" · ")}</dd>
          </div>
        )}
        {!!currentProject.developers?.length && (
          <div>
            <dt>{t("Разработчики порта")}</dt>
            <dd>{currentProject.developers.join(" · ")}</dd>
          </div>
        )}
      </dl>

      {currentProject.description &&
        currentProject.description.length > 120 && (
          <details className="project-section">
            <summary>{t("Подробнее о проекте")}</summary>
            <p>{currentProject.description}</p>
          </details>
        )}
      {build?.changelog && (
        <details
          id="project-changelog"
          className="project-section project-changelog"
        >
          <summary>
            {t("Что нового в")} {build.version}
          </summary>
          <p>{build.changelog}</p>
        </details>
      )}
      <section
        className="project-information"
        aria-label={t("Данные проекта v2")}
      >
        {hasRequirements && (
          <section id="project-requirements" className="project-section">
            <h2>{t("Системные требования")}</h2>
            <div className="project-spec-columns">
              {specs.map(
                ([label, values]) =>
                  values &&
                  Object.values(values).some(Boolean) && (
                    <div key={t(label)}>
                      <h3>{t(label)}</h3>
                      <dl>
                        {Object.entries(values)
                          .filter(([, value]) => value)
                          .map(([key, value]) => (
                            <div key={key}>
                              <dt>
                                {
                                  {
                                    os: t("ОС"),
                                    cpu: t("Процессор"),
                                    gpu: t("Видеокарта"),
                                    memory: t("Память"),
                                    storage: t("Место на диске"),
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
              <p className="muted">
                {t("Источник:")} {req.requirements.source}
              </p>
            )}
          </section>
        )}
        {!!(
          req?.sourceRequirements.length || install?.sourceRequirements.length
        ) && (
          <section className="project-section">
            <h2>{t("Для начала игры")}</h2>
            <ul>
              {[
                ...new Set([
                  ...(req?.sourceRequirements ?? []),
                  ...(install?.sourceRequirements ?? []),
                ]),
              ].map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </section>
        )}
        {!!req?.dependencies.length && (
          <section className="project-section">
            <h2>{t("Зависимости")}</h2>
            <ul>
              {req.dependencies.map((d, i) => (
                <li key={i}>
                  {d.name}
                  {!d.required && t(" (необязательно)")}
                </li>
              ))}
            </ul>
          </section>
        )}
        {!!(install?.install.steps.length || install?.install.notes) && (
          <details id="project-install" className="project-section">
            <summary className="project-install-heading">
              <span>{t("Инструкция")}</span>
              <Button
                variant="ghost"
                className="project-copy-steps"
                onClick={async (event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  try {
                    await navigator.clipboard.writeText(
                      [
                        install.install.steps
                          .map((step, i) => `${i + 1}. ${step}`)
                          .join("\n"),
                        install.install.notes,
                        ...currentProject.officialLinks.map(
                          (link) => `${t(link.label)}: ${link.url}`,
                        ),
                      ]
                        .filter(Boolean)
                        .join("\n\n"),
                    );
                    setCopyStatus("copied");
                  } catch {
                    setCopyStatus("error");
                  }
                }}
              >
                <Copy size={15} aria-hidden="true" />
                <span aria-live="polite">
                  {t(
                    copyStatus === "copied"
                      ? "Скопировано!"
                      : "Копировать шаги",
                  )}
                </span>
              </Button>
            </summary>
            {copyStatus === "error" && (
              <p role="alert">
                {t("Не удалось скопировать. Повторите попытку.")}
              </p>
            )}
            <ol>
              {install.install.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
            {install.install.notes && <p>{install.install.notes}</p>}
          </details>
        )}
        {!!install?.knownIssues.length && (
          <details id="project-issues" className="project-section">
            <summary>{t("Известные проблемы")}</summary>
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
          <h2>{t("От разработчиков проекта")}</h2>
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
                {link.label.startsWith("Релиз ")
                  ? `${t("Релиз")} ${link.label.slice(6)}`
                  : t(link.label)}{" "}
                <ArrowUpRight size={15} aria-hidden="true" />
              </a>
            ))}
          </div>
          {linkError && <p role="alert">{t(linkError)}</p>}
        </section>
      )}
    </article>
  );
}
