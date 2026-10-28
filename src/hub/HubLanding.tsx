import { useState, type ReactNode } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Gamepad2,
  Grid2X2,
  ImageOff,
  RotateCw,
} from "lucide-react";
import type { CatalogState, PublishedGame } from "../services/catalog";
import type { MediaSet } from "../services/media";
const typeLabel = {
  "native-port": "Нативный порт",
  recompilation: "Рекомпиляция",
  "compatibility-runtime": "Среда совместимости",
};
const platformShort = (platform: string) =>
  platform.replace("PlayStation ", "PS").replace("Xbox 360", "X360");
import hero from "./assets/hub-hero.webp";

export function HubLanding({
  catalog,
  media,
  onOpen,
  onCatalog,
  activity,
}: {
  catalog: CatalogState;
  media: (game: PublishedGame) => MediaSet;
  onOpen: (project: PublishedGame) => void;
  onCatalog: () => void;
  activity?: ReactNode;
}) {
  const [platform, setPlatform] = useState("");
  // Only published CMS records belong on Home, including in development.
  const projects = catalog.snapshot.catalog.games;
  const platforms = [
    ...new Map(
      projects.map((p) => [p.sourceConsole, p.sourceConsole]),
    ).entries(),
  ];
  const selected = platforms.some(([key]) => key === platform) ? platform : "";
  const visible = projects
    .filter((p) => !selected || p.sourceConsole === selected)
    .slice(0, 6);
  return (
    <div className="port-home">
      <section className="port-hero" aria-labelledby="hub-title">
        <img className="port-hero-art" src={hero} alt="" fetchPriority="high" />
        <div className="port-hero-shade" />
        <div className="port-hero-copy">
          <p className="port-kicker">
            <span />
            PORT// HUB <i /> CONSOLE TO PC
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
        <div className="port-hero-note" aria-hidden="true">
          <span>SAME GAMES.</span>
          <span>NEW POSSIBILITIES.</span>
          <i />
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
            </button>
          ))}
        </nav>
        {activity && (
          <section className="port-home-activity" aria-label="Текущая операция">
            {activity}
          </section>
        )}
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
          {(catalog.error || catalog.snapshot.warning) && (
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
                <HomeProject
                  key={p.id}
                  project={p}
                  media={media(p)}
                  onOpen={() => onOpen(p)}
                />
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
        <footer className="port-home-footer">
          <span>Сделано сообществом. Открыто для исследования.</span>
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
  media,
  onOpen,
}: {
  project: PublishedGame;
  media: MediaSet;
  onOpen: () => void;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <button
      className="port-project"
      onClick={onOpen}
      aria-label={`Открыть проект ${p.title}`}
    >
      <div className="port-project-image">
        {media.cover && !failed ? (
          <img
            src={media.cover}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
          />
        ) : (
          <div className="port-image-missing">
            <ImageOff size={26} />
            <span>Обложка недоступна</span>
          </div>
        )}
        <span className="port-project-platform">
          {platformShort(p.sourceConsole)}
        </span>
        <span className="port-project-open">
          <ArrowUpRight size={18} />
        </span>
        <div className="port-project-caption">
          <span>{typeLabel[p.implementation]}</span>
          <h3>{p.title}</h3>
        </div>
      </div>
      <div className="port-project-meta">
        <span>{p.requirements.os || "ОС не указана"}</span>
        <span>
          О проекте <ArrowRight size={13} />
        </span>
      </div>
    </button>
  );
}
