import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Compass,
  Download,
  ExternalLink,
  Folder,
  GitBranch as Github,
  Grid2X2,
  HardDrive,
  Home,
  Info,
  Library,
  Monitor,
  Package,
  Pause,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  SlidersHorizontal,
  WifiOff,
  X,
} from "lucide-react";
import { collection, type GameTitle } from "./domain";
import {
  defaults,
  native,
  settingsService,
  type Settings,
} from "./services/settings";
import { Button, Modal, Switch } from "./components/ui";
import { Landscape } from "./components/Landscape";

type Page =
  "home" | "catalog" | "details" | "library" | "downloads" | "settings";
const navigation = [
  { id: "home", label: "Главная", icon: Home },
  { id: "catalog", label: "Каталог", icon: Compass },
  { id: "library", label: "Библиотека", icon: Library },
  { id: "downloads", label: "Загрузки", icon: ArrowDownToLine },
] as const;
const pageNames: Record<Page, string> = {
  home: "Главная",
  catalog: "Каталог",
  details: "Uncharted",
  library: "Библиотека",
  downloads: "Загрузки",
  settings: "Настройки",
};
function Badge({
  children,
  green = false,
}: {
  children: React.ReactNode;
  green?: boolean;
}) {
  return <span className={`badge ${green ? "green" : ""}`}>{children}</span>;
}
function SectionTitle({
  eyebrow,
  title,
  action,
  onAction,
}: {
  eyebrow?: string;
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2>{title}</h2>
      </div>
      {action && (
        <button className="text-link" onClick={onAction}>
          {action}
          <ArrowRight size={16} />
        </button>
      )}
    </div>
  );
}
function GameCard({
  title,
  onClick,
}: {
  title: GameTitle;
  onClick: () => void;
}) {
  return (
    <button
      className={`game-card ${title.art}`}
      onClick={onClick}
      aria-label={`Подробнее: ${title.name} — ${title.subtitle}`}
    >
      <div className="game-cover">
        <Landscape kind={title.art} />
        <span className="cover-number">{title.number}</span>
        <span className="cover-edition">THE NATHAN DRAKE COLLECTION</span>
        <div className="cover-wordmark">
          UNCHARTED
          <span>
            {title.id === "u1"
              ? "DRAKE’S FORTUNE"
              : title.id === "u2"
                ? "AMONG THIEVES"
                : "DRAKE’S DECEPTION"}
          </span>
        </div>
        <span className="cover-arrow">
          <ArrowUpRight size={18} />
        </span>
      </div>
      <div className="game-meta">
        <div>
          <h3>{title.name}</h3>
          <p>{title.subtitle}</p>
        </div>
        <span>{title.year}</span>
      </div>
      <div className="game-status">
        <span className="status-dot" />В составе коллекции<span>PC</span>
      </div>
    </button>
  );
}

export default function App() {
  const [page, setPage] = useState<Page>("home");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [settings, setSettings] = useState<Settings>(defaults);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [choosingFolder, setChoosingFolder] = useState(false);
  const folderDialogOpen = useRef(false);
  const [installer, setInstaller] = useState(false);
  const [about, setAbout] = useState(false);
  const [reset, setReset] = useState(false);
  const [toast, setToast] = useState("");
  const [online, setOnline] = useState(navigator.onLine);
  const mainRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let active = true;
    settingsService
      .load()
      .then((s) => {
        if (active) setSettings(s);
      })
      .catch(() => {
        if (active) setStorageError(true);
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [page]);
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, []);
  async function update(patch: Partial<Settings>) {
    if (saving) return;
    const next = { ...settings, ...patch };
    setSaving(true);
    try {
      await settingsService.save(next);
      setSettings(next);
      setStorageError(false);
      setToast("Настройки сохранены");
    } catch {
      setToast("Не удалось сохранить настройки. Повторите попытку.");
    } finally {
      setSaving(false);
    }
  }
  async function chooseFolder() {
    if (folderDialogOpen.current) return;
    if (!native) {
      setToast("Выбор папки доступен в Windows-приложении");
      return;
    }
    folderDialogOpen.current = true;
    setChoosingFolder(true);
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const dir = await open({
        directory: true,
        multiple: false,
        title: "Папка для будущих установок PORT",
      });
      if (typeof dir === "string") await update({ installDir: dir });
    } catch {
      setToast("Не удалось открыть выбор папки");
    } finally {
      folderDialogOpen.current = false;
      setChoosingFolder(false);
    }
  }
  async function external(url = collection.upstream) {
    try {
      if (native) {
        const { openUrl } = await import("@tauri-apps/plugin-opener");
        await openUrl(url);
      } else window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      setToast("Не удалось открыть ссылку");
    }
  }
  function navigate(next: Page) {
    setPage(next);
    if (next !== "catalog") setQuery("");
  }
  const matches =
    !query ||
    `${collection.title} ${collection.titles.map((t) => `${t.name} ${t.subtitle}`).join(" ")} SuperMedo приключение`
      .toLowerCase()
      .includes(query.toLowerCase());
  const showResult = matches && filter !== "available";
  const isLight = settings.theme === "system";
  return (
    <MotionConfig reducedMotion={settings.reducedMotion ? "always" : "user"}>
      <div
        className={`app-shell ${settings.compactCards ? "compact" : ""} ${settings.reducedMotion ? "reduced-motion" : ""} ${isLight ? "system-theme" : ""}`}
      >
        <a className="skip-link" href="#main">
          К содержимому
        </a>
        <aside className="sidebar">
          <button
            className="brand"
            onClick={() => navigate("home")}
            aria-label="PORT — главная"
          >
            PORT<span>//</span>
          </button>
          <div className="workspace-label">ВАШИ НОВЫЕ ГОРИЗОНТЫ</div>
          <nav aria-label="Основная навигация">
            {navigation.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                className={`nav-item ${page === id || (id === "catalog" && page === "details") ? "active" : ""}`}
                onClick={() => navigate(id)}
                aria-current={page === id ? "page" : undefined}
              >
                <Icon size={19} strokeWidth={1.7} />
                <span>{label}</span>
                {id === "downloads" && <span className="nav-count">0</span>}
              </button>
            ))}
          </nav>
          <div className="sidebar-collection">
            <p className="eyebrow">В ФОКУСЕ</p>
            <button
              onClick={() => navigate("details")}
              className="sidebar-feature"
            >
              <span className="small-cover">
                <Landscape />
              </span>
              <span>
                Uncharted<small>The Nathan Drake Collection</small>
              </span>
              <ChevronRight size={14} />
            </button>
          </div>
          <div className="sidebar-bottom">
            <div className="local-note">
              <ShieldCheck size={19} />
              <div>
                Ваши игры. Ваш компьютер.
                <small>Игровые файлы остаются у вас.</small>
              </div>
            </div>
            <button
              className={`nav-item ${page === "settings" ? "active" : ""}`}
              onClick={() => navigate("settings")}
              aria-current={page === "settings" ? "page" : undefined}
            >
              <SettingsIcon size={19} strokeWidth={1.7} />
              <span>Настройки</span>
            </button>
            <button className="profile" onClick={() => setAbout(true)}>
              <span className="profile-icon">
                P<span />
              </span>
              <span>
                Локальный профиль<small>PORT// · 0.1.0</small>
              </span>
              <CircleHelp size={17} />
            </button>
          </div>
        </aside>
        <div className="content-shell">
          <header className="topbar">
            <div className="breadcrumb">
              Обзор <ChevronRight size={13} />
              <span>{pageNames[page]}</span>
            </div>
            <form
              className="search-box"
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                setPage("catalog");
              }}
            >
              <Search size={17} />
              <input
                ref={searchRef}
                aria-label="Поиск игр"
                placeholder="Поиск игр и коллекций"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage("catalog");
                }}
              />
              {query ? (
                <button
                  type="button"
                  aria-label="Очистить поиск"
                  onClick={() => setQuery("")}
                >
                  <X size={15} />
                </button>
              ) : (
                <kbd>Ctrl K</kbd>
              )}
            </form>
            <div className="build-label">
              <span className="status-dot" />
              {native ? "WINDOWS" : "WEB PREVIEW"}
              <span className="build-divider" />
              PREVIEW 01
            </div>
          </header>
          {!online && (
            <div role="status" className="offline-banner">
              <WifiOff size={15} />
              Нет сети. Каталог и локальные настройки доступны.
            </div>
          )}
          {storageError && (
            <div role="alert" className="offline-banner">
              Не удалось прочитать настройки. Проверьте локальные данные или
              сбросьте настройки.
            </div>
          )}
          <main id="main" tabIndex={-1} ref={mainRef} aria-busy={!ready}>
            {!ready ? (
              <div className="skeleton" aria-label="Загрузка интерфейса" />
            ) : (
              <AnimatePresence mode="wait">
                <motion.div
                  key={page}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.16 }}
                >
                  {page === "home" && (
                    <>
                      <div className="page-heading">
                        <div>
                          <p className="eyebrow">
                            ЗНАКОМЫЕ МИРЫ. НОВЫЕ ВОЗМОЖНОСТИ.
                          </p>
                          <h1>
                            За пределами консоли
                            <span className="accent">.</span>
                          </h1>
                        </div>
                        <span className="quiet-label">
                          <Monitor size={14} />
                          Создано для Windows
                        </span>
                      </div>
                      <section className="hero">
                        <Landscape />
                        <div className="hero-shade" />
                        <div className="hero-content">
                          <div className="hero-kicker">
                            <span className="tiny-line" />
                            КОЛЛЕКЦИЯ В ФОКУСЕ
                            <span className="pill">НАТИВНЫЙ ПОРТ</span>
                          </div>
                          <div className="hero-wordmark">
                            UNCHARTED<span>THE NATHAN DRAKE COLLECTION</span>
                          </div>
                          <p>
                            Три легендарных приключения.
                            <br />
                            Один новый горизонт.
                          </p>
                          <div className="hero-actions">
                            <Button onClick={() => setInstaller(true)}>
                              <Download size={17} />
                              Установить
                              <ArrowRight size={17} />
                            </Button>
                            <Button
                              variant="secondary"
                              onClick={() => navigate("details")}
                            >
                              О коллекции
                            </Button>
                          </div>
                          <div className="hero-caption">
                            <Info size={13} />
                            Установка появится на следующем этапе
                          </div>
                        </div>
                        <div className="hero-bottom">
                          <span>
                            01 <span>/ 01</span>
                          </span>
                          <div className="hero-progress" />
                          <span>ИССЛЕДУЙТЕ НЕИЗВЕДАННОЕ</span>
                          <Compass size={22} />
                        </div>
                        <span className="art-label">PORT ORIGINAL ARTWORK</span>
                      </section>
                      <SectionTitle
                        eyebrow="ТРИ ИСТОРИИ. ОДНО ПРИКЛЮЧЕНИЕ."
                        title="Коллекция Натана Дрейка"
                        action="Вся коллекция"
                        onAction={() => navigate("details")}
                      />
                      <div className="game-grid">
                        {collection.titles.map((title) => (
                          <GameCard
                            key={title.id}
                            title={title}
                            onClick={() => navigate("details")}
                          />
                        ))}
                      </div>
                      <div className="home-bottom">
                        <section className="new-ports">
                          <SectionTitle title="Новые порты" />
                          <div className="new-ports-content">
                            <span className="outline-icon">
                              <Package size={25} strokeWidth={1.4} />
                            </span>
                            <div>
                              <h3>Большие открытия впереди</h3>
                              <p>
                                Каталог начинается с одной коллекции.
                                <br />
                                Новые порты появятся после проверки
                                совместимости.
                              </p>
                            </div>
                            <Badge>СКОРО</Badge>
                          </div>
                        </section>
                        <section className="manifesto">
                          <span className="eyebrow">
                            ПРОСТРАНСТВО ДЛЯ ВАШИХ ИГР
                          </span>
                          <h3>
                            Легенды обретают
                            <br />
                            новый дом<span className="accent">.</span>
                          </h3>
                          <button
                            className="text-link"
                            onClick={() => setAbout(true)}
                          >
                            Познакомиться с PORT
                            <ArrowUpRight size={16} />
                          </button>
                          <span className="manifesto-mark">//</span>
                        </section>
                      </div>
                    </>
                  )}
                  {page === "catalog" && (
                    <>
                      <div className="page-heading">
                        <div>
                          <p className="eyebrow">
                            ОТКРОЙТЕ СЛЕДУЮЩЕЕ ПРИКЛЮЧЕНИЕ
                          </p>
                          <h1>
                            Каталог<span className="accent">.</span>
                          </h1>
                        </div>
                        <span className="quiet-label">01 коллекция</span>
                      </div>
                      <div className="filter-bar">
                        <div>
                          <SlidersHorizontal size={16} />
                          <span>Доступность</span>
                          {[
                            { id: "all", label: "Все" },
                            { id: "planned", label: "Запланировано" },
                            { id: "available", label: "Готовы к установке" },
                          ].map((f) => (
                            <button
                              key={f.id}
                              className={`filter-chip ${filter === f.id ? "selected" : ""}`}
                              aria-pressed={filter === f.id}
                              onClick={() => setFilter(f.id)}
                            >
                              {f.label}
                            </button>
                          ))}
                        </div>
                        <Grid2X2 size={17} />
                      </div>
                      {showResult ? (
                        <>
                          <button
                            className="collection-card"
                            onClick={() => navigate("details")}
                          >
                            <div className="catalog-cover">
                              <Landscape />
                              <div className="cover-wordmark">
                                UNCHARTED
                                <span>THE NATHAN DRAKE COLLECTION</span>
                              </div>
                              <Badge>КОЛЛЕКЦИЯ · 3 ИГРЫ</Badge>
                            </div>
                            <div className="collection-card-content">
                              <div>
                                <h2>The Nathan Drake Collection</h2>
                                <p>Uncharted · Нативный порт от SuperMedo</p>
                              </div>
                              <ArrowUpRight size={25} />
                            </div>
                            <div className="catalog-status">
                              <span className="status-dot" />
                              Интеграция запланирована{" "}
                              <span>Windows · Приключение</span>
                            </div>
                          </button>
                          <p className="catalog-note">
                            <Info size={15} />
                            PORT пока не устанавливает игры. Доступность сборок
                            проверяется на следующем этапе.
                          </p>
                        </>
                      ) : (
                        <Empty
                          icon={Search}
                          title="Ничего не найдено"
                          description="Попробуйте другой запрос или измените фильтр доступности."
                        >
                          <Button
                            variant="secondary"
                            onClick={() => {
                              setQuery("");
                              setFilter("all");
                            }}
                          >
                            Сбросить фильтры
                          </Button>
                        </Empty>
                      )}
                    </>
                  )}
                  {page === "details" && (
                    <>
                      <button
                        className="back-link"
                        onClick={() => navigate("catalog")}
                      >
                        <ArrowLeft size={16} />
                        Назад в каталог
                      </button>
                      <section className="detail-banner">
                        <Landscape />
                        <div className="hero-shade" />
                        <div>
                          <Badge>НАТИВНЫЙ ПОРТ · WINDOWS</Badge>
                          <h1>UNCHARTED</h1>
                          <p>THE NATHAN DRAKE COLLECTION</p>
                        </div>
                      </section>
                      <div className="detail-layout">
                        <div>
                          <p className="eyebrow">ПРИКЛЮЧЕНИЕ / КОЛЛЕКЦИЯ</p>
                          <h2 className="detail-title">
                            Каждая легенда
                            <br />с чего-то начинается.
                          </h2>
                          <p className="body-copy">
                            От затерянных джунглей до заснеженных вершин и
                            бескрайней пустыни. Три истории Натана Дрейка в
                            одной коллекции, для которой SuperMedo развивает
                            независимый нативный порт на Windows.
                          </p>
                          <div className="detail-tags">
                            <Badge>3 игры</Badge>
                            <Badge>Общая установка</Badge>
                            <Badge>Собственные игровые файлы</Badge>
                          </div>
                          <SectionTitle title="Внутри коллекции" />
                          <div className="detail-titles">
                            {collection.titles.map((t) => (
                              <div key={t.id}>
                                <span className="mini-art">
                                  <Landscape kind={t.art} />
                                </span>
                                <span>
                                  <strong>{t.name}</strong>
                                  <small>{t.subtitle}</small>
                                </span>
                                <span>{t.number}</span>
                              </div>
                            ))}
                          </div>
                          <SectionTitle title="Системные требования" />
                          <p className="muted small">
                            По README автора порта · проверено 27 октября 2026
                          </p>
                          <div className="requirements">
                            <div>
                              <span>Операционная система</span>
                              <strong>Windows 10 (1903+) / 11, x64</strong>
                            </div>
                            <div>
                              <span>Процессор</span>
                              <strong>
                                Intel Core 3-го поколения+ / Ryzen / AMD FX*
                              </strong>
                            </div>
                            <div>
                              <span>Видеокарта</span>
                              <strong>Vulkan 1.3 · от 6 ГБ видеопамяти</strong>
                            </div>
                            <div>
                              <span>Свободная память</span>
                              <strong>Около 8 ГБ RAM + файл подкачки</strong>
                            </div>
                          </div>
                          <p className="muted small">
                            * У старых процессоров есть ограничения. Полные
                            требования и известные проблемы — в документации
                            автора.
                          </p>
                          <button
                            className="text-link"
                            onClick={() =>
                              external(`${collection.upstream}#requirements`)
                            }
                          >
                            Требования в README
                            <ExternalLink size={14} />
                          </button>
                        </div>
                        <aside className="install-panel">
                          <div className="install-panel-icon">
                            <Download size={24} />
                          </div>
                          <Badge>ИНТЕГРАЦИЯ ЗАПЛАНИРОВАНА</Badge>
                          <h2>
                            Приключение
                            <br />
                            почти рядом.
                          </h2>
                          <p>
                            Установщик PORT появится на следующем этапе
                            разработки.
                          </p>
                          <Button onClick={() => setInstaller(true)}>
                            <Download size={17} />
                            Установить
                          </Button>
                          <span className="small muted">
                            Сейчас откроется план установки
                          </span>
                          <div className="panel-rule" />
                          <div className="author-row">
                            <span>Разработчик порта</span>
                            <strong>SuperMedo</strong>
                          </div>
                          <div className="author-row">
                            <span>Игры</span>
                            <strong>Naughty Dog / Bluepoint</strong>
                          </div>
                          <button
                            className="button secondary"
                            onClick={() => external()}
                          >
                            <Github size={17} />
                            Проект на GitHub
                            <ArrowUpRight size={16} />
                          </button>
                          <div className="file-notice">
                            <ShieldCheck size={18} />
                            <p>
                              Нужен собственный расшифрованный дамп коллекции.
                              Поддержка произвольных PKG не заявлена.
                            </p>
                          </div>
                        </aside>
                      </div>
                    </>
                  )}
                  {page === "library" && (
                    <>
                      <div className="page-heading">
                        <div>
                          <p className="eyebrow">ВСЁ ВАШЕ. В ОДНОМ МЕСТЕ.</p>
                          <h1>
                            Библиотека<span className="accent">.</span>
                          </h1>
                        </div>
                        <span className="quiet-label">0 установленных игр</span>
                      </div>
                      <Empty
                        icon={Library}
                        title="Здесь начнётся ваша история"
                        description="Установленные коллекции будут ждать вас здесь. Найдите своё первое приключение в каталоге PORT."
                      >
                        <Button onClick={() => navigate("catalog")}>
                          Открыть каталог
                          <ArrowRight size={17} />
                        </Button>
                      </Empty>
                      <div className="future-actions">
                        <span>После установки</span>
                        {[
                          "Играть",
                          "Настройки игры",
                          "Проверить файлы",
                          "Удалить",
                        ].map((s) => (
                          <span key={s} className="future-action">
                            {s}
                          </span>
                        ))}
                        <span className="small muted">Пока нет установок</span>
                      </div>
                      <div className="info-strip">
                        <ShieldCheck size={20} />
                        <div>
                          <h3>Ваша библиотека — локальная</h3>
                          <p>
                            Без обязательной учётной записи. Игровые файлы
                            остаются на вашем компьютере.
                          </p>
                        </div>
                      </div>
                    </>
                  )}
                  {page === "downloads" && (
                    <>
                      <div className="page-heading">
                        <div>
                          <p className="eyebrow">ПУТЬ К НОВЫМ МИРАМ</p>
                          <h1>
                            Загрузки<span className="accent">.</span>
                          </h1>
                        </div>
                        <Badge>ОЧЕРЕДЬ ПУСТА</Badge>
                      </div>
                      <Empty
                        icon={ArrowDownToLine}
                        title="Всё спокойно"
                        description="Активных загрузок нет. Здесь появится очередь, когда установщик PORT будет готов."
                      >
                        <Button
                          variant="secondary"
                          onClick={() => navigate("catalog")}
                        >
                          Посмотреть каталог
                          <ArrowRight size={17} />
                        </Button>
                      </Empty>
                      <section className="queue-preview">
                        <div className="section-heading">
                          <h3>Будущий вид загрузки</h3>
                          <Badge>МАКЕТ · НЕ ЗАГРУЗКА</Badge>
                        </div>
                        <div className="queue-row">
                          <span className="queue-icon">
                            <Download size={23} />
                          </span>
                          <div>
                            <strong>Коллекция Uncharted</strong>
                            <p>Ожидание реализации установщика</p>
                          </div>
                          <Button
                            variant="ghost"
                            disabled
                            aria-label="Приостановить загрузку"
                          >
                            <Pause size={18} />
                          </Button>
                          <Button
                            variant="ghost"
                            disabled
                            aria-label="Отменить загрузку"
                          >
                            <X size={18} />
                          </Button>
                        </div>
                        <div
                          className="progress-track"
                          role="progressbar"
                          aria-label="Загрузка не начата"
                          aria-valuenow={0}
                          aria-valuemin={0}
                          aria-valuemax={100}
                        >
                          <span />
                        </div>
                        <div className="queue-stats">
                          <span>0% · не начато</span>
                          <span>
                            — МБ/с <span>·</span> — / — ГБ
                          </span>
                        </div>
                      </section>
                    </>
                  )}
                  {page === "settings" && (
                    <>
                      <div className="page-heading">
                        <div>
                          <p className="eyebrow">
                            ПРОСТРАНСТВО ПО ВАШИМ ПРАВИЛАМ
                          </p>
                          <h1>
                            Настройки<span className="accent">.</span>
                          </h1>
                        </div>
                        <span className="quiet-label">
                          <CheckCircle2 size={15} />
                          {saving ? "Сохранение…" : "Локальное сохранение"}
                        </span>
                      </div>
                      <div className="settings-layout">
                        <div>
                          <SettingsSection
                            title="Внешний вид"
                            description="Небольшие детали, которые меняют ощущение."
                          >
                            <div className="setting-row">
                              <div>
                                <h3>Тема приложения</h3>
                                <p>Тёмная тема или цветовая схема Windows</p>
                              </div>
                              <select
                                aria-label="Тема приложения"
                                value={settings.theme}
                                disabled={saving}
                                onChange={(e) =>
                                  update({
                                    theme: e.target.value as Settings["theme"],
                                  })
                                }
                              >
                                <option value="dark">Тёмная</option>
                                <option value="system">Как в системе</option>
                              </select>
                            </div>
                            <div className="setting-row">
                              <div>
                                <h3>Меньше анимаций</h3>
                                <p>Спокойные переходы без движения</p>
                              </div>
                              <Switch
                                label="Меньше анимаций"
                                checked={settings.reducedMotion}
                                onCheckedChange={(v) =>
                                  update({ reducedMotion: v })
                                }
                                disabled={saving}
                              />
                            </div>
                            <div className="setting-row">
                              <div>
                                <h3>Компактные карточки</h3>
                                <p>Больше места для вашей коллекции</p>
                              </div>
                              <Switch
                                label="Компактные карточки"
                                checked={settings.compactCards}
                                onCheckedChange={(v) =>
                                  update({ compactCards: v })
                                }
                                disabled={saving}
                              />
                            </div>
                          </SettingsSection>
                          <SettingsSection
                            title="Установка и хранение"
                            description="Подготовьте место для будущих приключений."
                          >
                            <div className="setting-row folder-setting">
                              <div>
                                <h3>Папка установки</h3>
                                <p>Будет использоваться будущим установщиком</p>
                              </div>
                              <Button
                                variant="secondary"
                                onClick={chooseFolder}
                                disabled={saving || choosingFolder}
                              >
                                <Folder size={16} />
                                Выбрать папку
                              </Button>
                            </div>
                            <div className="folder-path">
                              <HardDrive size={16} />
                              <span>
                                {settings.installDir || "Папка ещё не выбрана"}
                              </span>
                              {settings.installDir && (
                                <button
                                  className="icon-button"
                                  aria-label="Убрать выбранную папку"
                                  onClick={() => update({ installDir: "" })}
                                  disabled={saving}
                                >
                                  <X size={15} />
                                </button>
                              )}
                            </div>
                            {!native && (
                              <p className="muted small">
                                Выбор папки доступен в нативном
                                Windows-приложении.
                              </p>
                            )}
                          </SettingsSection>
                          <SettingsSection
                            title="Локальные данные"
                            description={
                              native
                                ? "Настройки хранятся в SQLite на этом компьютере."
                                : "Режим браузера: настройки хранятся в localStorage."
                            }
                          >
                            <div className="setting-row">
                              <div>
                                <h3>Сбросить настройки</h3>
                                <p>Вернуть параметры интерфейса по умолчанию</p>
                              </div>
                              <Button
                                variant="secondary"
                                onClick={() => setReset(true)}
                                disabled={saving}
                              >
                                Сбросить
                              </Button>
                            </div>
                          </SettingsSection>
                        </div>
                        <aside className="about-panel">
                          <div className="brand">
                            PORT<span>//</span>
                          </div>
                          <Badge>VERSION 0.1.0</Badge>
                          <h3>
                            Знакомые миры.
                            <br />
                            Новый дом.
                          </h3>
                          <p>
                            Независимый лаунчер нативных портов для Windows.
                          </p>
                          <div className="panel-rule" />
                          <p className="small">
                            Stage 00–01 · UI Prototype
                            <br />
                            Установка и запуск игр ещё не реализованы.
                          </p>
                          <button
                            className="text-link"
                            onClick={() => external()}
                          >
                            GitHub автора порта
                            <ArrowUpRight size={15} />
                          </button>
                          <button
                            className="text-link"
                            onClick={() => setAbout(true)}
                          >
                            О проекте PORT
                            <Info size={15} />
                          </button>
                        </aside>
                      </div>
                    </>
                  )}
                  <footer>
                    <span>
                      PORT// <span>Миры становятся ближе.</span>
                    </span>
                    <span>
                      Независимый проект<small>·</small>Stage 01 / UI Prototype
                    </span>
                  </footer>
                </motion.div>
              </AnimatePresence>
            )}
          </main>
        </div>
        <Modal
          open={installer}
          onOpenChange={setInstaller}
          title="Следующая остановка — приключение"
          description="Предварительный план установки Uncharted. Функция ещё не реализована."
        >
          <div className="installer-art">
            <Landscape />
            <span className="cover-wordmark">
              UNCHARTED<span>THE NATHAN DRAKE COLLECTION</span>
            </span>
          </div>
          <div className="install-steps">
            {[
              {
                title: "Ваши игровые файлы",
                text: "Собственный совместимый расшифрованный дамп коллекции.",
              },
              {
                title: "Проверенная сборка порта",
                text: "В будущем — получение совместимой версии из GitHub Releases.",
              },
              {
                title: "Одна коллекция в библиотеке",
                text: "Общие данные и runtime. Способ запуска частей ещё предстоит проверить.",
              },
            ].map((step, i) => (
              <div key={step.title}>
                <span>{`0${i + 1}`}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="dialog-note">
            <Info size={18} />
            <span>
              PORT сейчас не выбирает PKG, не скачивает сборки и не изменяет
              игровые файлы.
            </span>
          </div>
          <Button className="full" onClick={() => setInstaller(false)}>
            Понятно
            <Check size={17} />
          </Button>
        </Modal>
        <Modal
          open={about}
          onOpenChange={setAbout}
          title="Миры становятся ближе."
          description="PORT// — независимый Windows-лаунчер. Версия 0.1.0, Stage 00–01."
        >
          <div className="about-dialog-content">
            <Compass size={46} strokeWidth={1} />
            <p>
              Мы создаём удобный дом для нативных портов. Каждый порт остаётся
              работой его авторов. PORT не распространяет оригинальные игры.
            </p>
            <p className="muted">
              Uncharted PC — проект SuperMedo (Mohammed Albarghouthi). PORT не
              связан с Sony, Naughty Dog или Bluepoint Games.
            </p>
            <Button variant="secondary" onClick={() => external()}>
              <Github size={17} />
              Открыть проект SuperMedo
            </Button>
          </div>
        </Modal>
        <Modal
          open={reset}
          onOpenChange={setReset}
          title="Сбросить настройки?"
          description="Тема, папка для будущих установок и параметры интерфейса вернутся к исходным значениям. Игровые файлы не затрагиваются."
        >
          <div className="dialog-actions">
            <Button variant="secondary" onClick={() => setReset(false)}>
              Отмена
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                setSaving(true);
                try {
                  const s = await settingsService.reset();
                  setSettings(s);
                  setStorageError(false);
                  setReset(false);
                  setToast("Настройки сброшены");
                } catch {
                  setToast("Не удалось сбросить настройки");
                } finally {
                  setSaving(false);
                }
              }}
              disabled={saving}
            >
              Сбросить настройки
            </Button>
          </div>
        </Modal>
        <AnimatePresence>
          {toast && (
            <motion.div
              className="toast"
              role="status"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <CheckCircle2 size={17} />
              <span>{toast}</span>
              <button
                aria-label="Скрыть уведомление"
                onClick={() => setToast("")}
              >
                <X size={15} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
function Empty({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Library;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="empty-state">
      <div className="empty-orbit">
        <span />
        <span />
        <div>
          <Icon size={35} strokeWidth={1.25} />
        </div>
      </div>
      <p className="eyebrow">МЕСТО ДЛЯ НОВОГО</p>
      <h2>{title}</h2>
      <p>{description}</p>
      {children}
    </section>
  );
}
function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="settings-section">
      <h2>{title}</h2>
      <p className="muted">{description}</p>
      {children}
    </section>
  );
}
