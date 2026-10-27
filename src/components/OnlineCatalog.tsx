import { useEffect, useState } from "react";
import { ArrowLeft, ArrowUpRight, RefreshCw } from "lucide-react";
import type { GameState } from "../services/game-state";
import {
  supportsInstall,
  developerMode,
  type CatalogState,
  type PublishedGame,
} from "../services/catalog";
import type { MediaSet } from "../services/media";
import { GameArt, Gallery } from "./BloodborneMedia";
import { GameAction } from "./GameAction";
import { Button } from "./ui";
import { native } from "../services/settings";

export const compatibilityLabels = {
  experimental: "Экспериментальная",
  playable: "Играбельно",
  verified: "Проверено",
  unavailable: "Недоступно",
};
export function CatalogStatus({ state }: { state: CatalogState }) {
  const s = state.snapshot;
  return (
    <section className="catalog-sync" aria-label="Состояние каталога">
      <div>
        <strong>
          {s.source === "demo"
            ? "Локальные тестовые данные"
            : s.source === "empty"
              ? "Каталог ещё не загружен"
              : s.source === "cache"
                ? "Каталог сохранён на компьютере"
                : "Каталог обновлён"}
        </strong>
        {(s.syncedAt || !native) && (
          <p className="muted small">
            {s.syncedAt
              ? `Синхронизация: ${new Date(s.syncedAt * 1000).toLocaleString("ru-RU")}`
              : ""}
            {!native && " · WEB PREVIEW: кэш в localStorage"}
          </p>
        )}
        {state.error && (
          <div role="alert" className="catalog-error">
            Не удалось обновить каталог. Последние данные сохранены.
            {developerMode && (
              <details>
                <summary>Подробности ошибки</summary>
                <p>{state.error}</p>
              </details>
            )}
          </div>
        )}
        {s.warning && (
          <p role="status">
            {developerMode
              ? s.warning
              : "Некоторые изображения пока недоступны."}
          </p>
        )}
      </div>
      <Button
        variant="secondary"
        disabled={state.busy}
        onClick={() => void state.refresh()}
      >
        <RefreshCw size={16} />
        {state.busy ? "Обновление…" : "Обновить каталог"}
      </Button>
    </section>
  );
}
export function CatalogSettings({ state }: { state: CatalogState }) {
  const [endpoint, setEndpoint] = useState(state.snapshot.endpoint);
  useEffect(
    () => setEndpoint(state.snapshot.endpoint),
    [state.snapshot.endpoint],
  );
  if (!developerMode) return null;
  return (
    <details className="settings-section catalog-settings">
      <summary>Для разработчиков · онлайн-каталог</summary>
      <p className="muted">
        Переопределение адреса для разработки. Пустое поле включает локальные
        тестовые данные в браузерной разработке; нативный клиент использует
        постоянный адрес.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void state.refresh(endpoint.trim());
        }}
      >
        <label htmlFor="catalog-endpoint">HTTPS API каталога</label>
        <input
          id="catalog-endpoint"
          type="url"
          placeholder="https://catalog.your-domain.com/v1/catalog.json"
          value={endpoint}
          onChange={(e) => setEndpoint(e.target.value)}
          disabled={state.busy}
        />
        <Button type="submit" disabled={state.busy}>
          Сохранить и синхронизировать
        </Button>
      </form>
      <CatalogStatus state={state} />
    </details>
  );
}
export function PublishedAction({
  game,
  state,
  onInstall,
}: {
  game: PublishedGame;
  state: GameState;
  onInstall: () => void;
}) {
  const installed = state.items.some(
    (i) => i.collectionId === game.collectionId,
  );
  // A foreign card cannot borrow Bloodborne's launch/install identity.
  if (
    !supportsInstall(game) &&
    !(
      installed &&
      game.id === "bloodborne" &&
      game.collectionId === "bloodborne"
    )
  )
    return (
      <p className="unavailable-action">
        Установка недоступна:{" "}
        {game.windowsBuild === "unavailable"
          ? "нет Windows-сборки"
          : "поддержка этой игры ещё не добавлена"}
        .
      </p>
    );
  return (
    <GameAction
      state={state}
      collectionId={game.collectionId}
      onInstall={onInstall}
    />
  );
}
export function PublishedCards({
  games,
  state,
  media,
  onOpen,
}: {
  games: PublishedGame[];
  state: GameState;
  media: (g: PublishedGame) => MediaSet;
  onOpen: (g: PublishedGame) => void;
}) {
  return (
    <div className="game-grid">
      {games.map((g) => (
        <button
          key={g.id}
          className="game-card"
          onClick={() => onOpen(g)}
          aria-label={`Подробнее: ${g.title}`}
        >
          <div className="game-cover">
            <GameArt src={media(g).cover} label={`Обложка ${g.title}`} />
            <span className="cover-arrow">
              <ArrowUpRight size={18} />
            </span>
          </div>
          <div className="game-meta">
            <div>
              <h3>{g.title}</h3>
              <p>{g.genres.join(" · ")}</p>
            </div>
          </div>
          <div className="game-status">
            <span className="status-dot" />
            {state.items.some((i) => i.collectionId === g.collectionId)
              ? "В библиотеке"
              : supportsInstall(g)
                ? "Доступна установка"
                : "Установка недоступна"}
          </div>
          <p className="muted small">
            {g.sourceConsole} → Windows ·{" "}
            {compatibilityLabels[g.compatibility.status]}
          </p>
        </button>
      ))}
    </div>
  );
}
export function CatalogDetail({
  game,
  state,
  media,
  onBack,
  onInstall,
  published = true,
}: {
  game: PublishedGame;
  state: GameState;
  media: MediaSet;
  onBack: () => void;
  onInstall: () => void;
  published?: boolean;
}) {
  const [linkError, setLinkError] = useState("");
  return (
    <>
      <button className="back-link" onClick={onBack}>
        <ArrowLeft size={16} />
        Назад в каталог
      </button>
      <section className="detail-banner">
        <GameArt
          src={media.banner || media.hero}
          label={`Баннер ${game.title}`}
        />
        <div className="hero-shade" />
        <div>
          <span className="badge">{game.sourceConsole} → Windows</span>
          <h1>{game.title}</h1>
          <p>{game.genres.join(" / ")}</p>
        </div>
      </section>
      {!published && (
        <p role="status" className="catalog-sync">
          Игра снята с публикации. Локальная библиотека сохранена.
        </p>
      )}
      <div className="detail-layout">
        <div>
          <p className="eyebrow">
            {game.implementation === "compatibility-runtime"
              ? "КОНСОЛЬНЫЙ RUNTIME / WINDOWS"
              : game.implementation === "recompilation"
                ? "ПЕРЕКОМПИЛЯЦИЯ / WINDOWS"
                : "НЕЗАВИСИМЫЙ ПОРТ / WINDOWS"}
          </p>
          <h2>Об игре</h2>
          <p className="body-copy catalog-description">{game.description}</p>
          <div className="detail-tags">
            {game.tags.map((t) => (
              <span key={t} className="badge">
                {t}
              </span>
            ))}
          </div>
          <h2>
            Совместимость · {compatibilityLabels[game.compatibility.status]}
          </h2>
          <p className="body-copy">{game.compatibility.notes}</p>
          <Gallery images={media.gallery} title={game.title} />
          <h2>Системные требования</h2>
          <div className="requirements">
            {[
              ["Система", game.requirements.os],
              ["Процессор", game.requirements.cpu],
              ["Графика", game.requirements.gpu],
              ["Память", game.requirements.memory],
              ["Хранение", game.requirements.storage],
            ].map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <p className="muted">{game.requirements.notes}</p>
          <h2>Требуемые оригинальные файлы</h2>
          <ul>
            {game.requiredFiles.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </div>
        <aside className="install-panel">
          <h2>{game.title}</h2>
          <p>{game.sourceConsole} → Windows</p>
          {published ||
          state.items.some((i) => i.collectionId === game.collectionId) ? (
            <PublishedAction game={game} state={state} onInstall={onInstall} />
          ) : (
            <p>Установка недоступна: карточка снята с публикации.</p>
          )}
          <div className="panel-rule" />
          <h3>Авторы Windows-проекта</h3>
          <p>{game.project.authors.join(", ")}</p>
          <p className="muted">{game.project.license}</p>
          <a
            className="text-link"
            href={game.project.github}
            target="_blank"
            rel="noopener noreferrer"
            onClick={
              native
                ? async (e) => {
                    e.preventDefault();
                    try {
                      const { openUrl } =
                        await import("@tauri-apps/plugin-opener");
                      await openUrl(game.project.github);
                    } catch {
                      setLinkError("Не удалось открыть GitHub-проект");
                    }
                  }
                : undefined
            }
          >
            Проект на GitHub <ArrowUpRight size={15} />
          </a>
          {linkError && <p role="alert">{linkError}</p>}
        </aside>
      </div>
    </>
  );
}
export function DynamicHome({
  catalog,
  state,
  media,
  onOpen,
  onInstall,
}: {
  catalog: CatalogState;
  state: GameState;
  media: (g: PublishedGame) => MediaSet;
  onOpen: (g: PublishedGame) => void;
  onInstall: () => void;
}) {
  const g = catalog.snapshot.catalog.games[0];
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>
            Главная<span className="accent">.</span>
          </h1>
        </div>
      </div>
      <CatalogStatus state={catalog} />
      {g ? (
        <section className="hero">
          <GameArt src={media(g).hero || media(g).banner} label={g.title} />
          <div className="hero-shade" />
          <div className="hero-content">
            <p className="eyebrow">{g.sourceConsole} → WINDOWS</p>
            <h1>{g.title}</h1>
            <p>{g.description.slice(0, 220)}</p>
            <div className="hero-actions">
              <PublishedAction game={g} state={state} onInstall={onInstall} />
              <Button variant="secondary" onClick={() => onOpen(g)}>
                Подробнее
              </Button>
            </div>
          </div>
        </section>
      ) : (
        <p className="empty-state">
          Опубликованных игр пока нет. Установленные игры доступны в библиотеке.
        </p>
      )}
      <PublishedCards
        games={catalog.snapshot.catalog.games}
        state={state}
        media={media}
        onOpen={onOpen}
      />
    </>
  );
}
