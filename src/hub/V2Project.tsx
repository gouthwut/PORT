import { useEffect, useState } from "react";
import { Gallery } from "../components/BloodborneMedia";
import { useV2Media } from "./v2-media";
import { projectTitle } from "./catalog-model";
import type { CatalogProject } from "./catalog-model";
import { createV2Client, parseSourceConfig, type V2Detail } from "./api-v2";
import sourceConfig from "./source-config.json";
import { ProjectOverview } from "./ProjectOverview";

/** Read-only v2 detail. Legacy IDs never become an installation identity. */
export function V2Project({
  project,
  onBack,
}: {
  project: CatalogProject;
  onBack: () => void;
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
            "Не удалось загрузить проект из API v2. Данные v1 не подставляются.",
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
  const req = data?.requirements;
  const install = data?.instructions;
  return (
    <>
      <ProjectOverview project={currentProject} media={media} onBack={onBack} />
      <Gallery images={media.gallery} title={projectTitle(currentProject)} />
      {busy && <p role="status">Загрузка проекта…</p>}
      {error && (
        <p role="alert">
          {error}{" "}
          <button onClick={() => setAttempt((n) => n + 1)}>Повторить</button>
        </p>
      )}
      {data && (
        <section aria-label="Данные проекта v2">
          <h2>Сборки</h2>
          {data.builds.length ? (
            <ul>
              {data.builds.map((b) => (
                <li key={b.id}>
                  {b.version} · {b.os} · {b.arch} ·{" "}
                  {b.channel === "stable" ? "Стабильная" : "Предварительная"} ·{" "}
                  {b.availability === "available"
                    ? "Доступна"
                    : b.availability === "unavailable"
                      ? "Недоступна"
                      : "Доступность не указана"}
                </li>
              ))}
            </ul>
          ) : (
            <p>Одобренные сборки не указаны.</p>
          )}
          <p className="muted">
            Автоматическая установка из API v2 не подключена. Наличие сборки не
            подтверждает совместимость.
          </p>
          <h2>Системные требования</h2>
          {(
            [
              ["Минимальные", req?.requirements.minimum],
              ["Рекомендуемые", req?.requirements.recommended],
            ] as const
          ).map(([label, specs]) => (
            <div key={label}>
              <h3>{label}</h3>
              {specs ? (
                <dl className="requirements">
                  {(
                    [
                      ["ОС", specs.os],
                      ["Процессор", specs.cpu],
                      ["Видеокарта", specs.gpu],
                      ["Память", specs.memory],
                      ["Место на диске", specs.storage],
                    ] as const
                  ).map(([name, value]) => (
                    <div key={name}>
                      <dt>{name}</dt>
                      <dd>{value ?? "Не указано"}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p>Не указаны.</p>
              )}
            </div>
          ))}
          {req?.requirements.notes && <p>{req.requirements.notes}</p>}
          {req?.requirements.source && (
            <p>Источник: {req.requirements.source}</p>
          )}
          <h2>Зависимости</h2>
          {req?.dependencies.length ? (
            <ul>
              {req.dependencies.map((d, i) => (
                <li key={i}>
                  {d.name} · {d.required ? "Обязательная" : "Необязательная"}
                </li>
              ))}
            </ul>
          ) : (
            <p>Не указаны.</p>
          )}
          <h2>Исходные файлы</h2>
          {req?.sourceRequirements.length ? (
            <ul>
              {req.sourceRequirements.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          ) : (
            <p>Требования не указаны.</p>
          )}
          <h2>Инструкция</h2>
          {install?.install.steps.length ? (
            <ol>
              {install.install.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          ) : (
            <p>Инструкция не указана.</p>
          )}
          {install?.install.notes && <p>{install.install.notes}</p>}
          <h2>Известные проблемы</h2>
          {install?.knownIssues.length ? (
            <ul>
              {install.knownIssues.map((s, i) => (
                <li key={i}>
                  {s.title}
                  {s.details && `: ${s.details}`}
                </li>
              ))}
            </ul>
          ) : (
            <p>Сведения не указаны.</p>
          )}
        </section>
      )}
    </>
  );
}
