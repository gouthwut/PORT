import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
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
import { GameArt, Gallery, MediaEditor } from "./components/BloodborneMedia";
import { InstallerPanel, DownloadPanel } from "./components/Installer";
import { emptyMedia, mediaService, type MediaSet } from "./services/media";
import { resolveMedia } from "./services/bundled-media";
import { InstalledLibrary } from "./components/InstalledLibrary";

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
  details: "Bloodborne",
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
  cover,
}: {
  title: GameTitle;
  onClick: () => void;
  cover?: string;
}) {
  return (
    <button
      className="game-card bloodborne"
      onClick={onClick}
      aria-label={`Подробнее: ${title.name}`}
    >
      <div className="game-cover">
        <GameArt src={cover} label="Обложка Bloodborne" />
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
        <span className="status-dot" />
        Совместимость проверяется<span>Windows</span>
      </div>
    </button>
  );
}

export default function App() {
  const [mediaOverrides, setMedia] = useState<MediaSet>(emptyMedia);
  const media = resolveMedia(mediaOverrides);
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
  useEffect(() => {
    mediaService
      .load()
      .then(setMedia)
      .catch(() => setToast("Не удалось загрузить оформление"));
  }, []);
  async function saveMedia(next: MediaSet) {
    await mediaService.save(next);
    setMedia(next);
  }
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
    `${collection.title} ${collection.titles.map((t) => `${t.name} ${t.subtitle}`).join(" ")} SuperMedo FromSoftware RPG Ярнам охота`
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
                <GameArt src={media.hero} />
              </span>
              <span>
                Bloodborne<small>FromSoftware · 2015</small>
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
              STAGE 02
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
                        <GameArt src={media.hero} />
                        <div className="hero-shade" />
                        <div className="hero-content">
                          <div className="hero-kicker">
                            <span className="tiny-line" />
                            ИГРА В ФОКУСЕ
                            <span className="pill">
                              СОВМЕСТИМОСТЬ PS4 → WINDOWS
                            </span>
                          </div>
                          <div className="hero-wordmark">
                            BLOODBORNE<span>HUNT YOUR NIGHTMARES</span>
                          </div>
                          <p>
                            Тайны Ярнама ждут своего охотника.
                            <br />
                            Переживите ночь охоты.
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
                              Подробнее
                            </Button>
                          </div>
                          <div className="hero-caption">
                            <Info size={13} />
                            Собственные игровые файлы · без передачи в сеть
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
                        <span className="art-label">
                          ВАШЕ ЛОКАЛЬНОЕ ОФОРМЛЕНИЕ
                        </span>
                      </section>
                      <SectionTitle
                        eyebrow="ОХОТА НАЧИНАЕТСЯ ЗДЕСЬ."
                        title="Bloodborne"
                        action="Об игре"
                        onAction={() => navigate("details")}
                      />
                      <div className="game-grid">
                        {collection.titles.map((title) => (
                          <GameCard
                            key={title.id}
                            title={title}
                            cover={media.cover}
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
                                Каталог начинается с Bloodborne.
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
                        <span className="quiet-label">01 игра</span>
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
                          <div className="game-grid">
                            <GameCard
                              title={collection.titles[0]}
                              cover={media.cover}
                              onClick={() => navigate("details")}
                            />
                          </div>
                          <p className="catalog-note">
                            <Info size={15} />
                            Установка из собственной папки или совместимого
                            основного PKG. Windows-runtime загружается отдельно;
                            данные игры не скачиваются.
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
                        <GameArt
                          src={media.banner}
                          label="Широкий баннер Bloodborne"
                        />
                        <div className="hero-shade" />
                        <div>
                          <Badge>FROM SOFTWARE · 2015 · PS4</Badge>
                          <h1>BLOODBORNE</h1>
                          <p>HUNT YOUR NIGHTMARES</p>
                        </div>
                      </section>
                      <div className="detail-layout">
                        <div>
                          <p className="eyebrow">
                            ACTION RPG / ГОТИЧЕСКИЙ ХОРРОР
                          </p>
                          <h2 className="detail-title">
                            Станьте охотником.
                            <br />
                            Переживите ночь.
                          </h2>
                          <p className="body-copy">
                            В древнем Ярнаме ищут исцеления — и находят кошмар.
                            Пройдите по улицам, где за каждой дверью прячется
                            тайна, а за каждым поворотом ждёт новая охота.
                            Узнайте, какая цена стоит за чудесной кровью.
                          </p>
                          <div className="detail-tags">
                            <Badge>FromSoftware</Badge>
                            <Badge>Sony Computer Entertainment</Badge>
                            <Badge>Оригинал: PlayStation 4 · 2015</Badge>
                          </div>
                          <section className="game-features">
                            <h2>Искусство охоты</h2>
                            <h3>Рискните, чтобы выжить</h3>
                            <p className="body-copy">
                              Стремительные бои, огнестрельное парирование и
                              возвращение здоровья ответными ударами поощряют
                              решительные действия.
                            </p>
                            <h3>Оружие с двумя характерами</h3>
                            <p className="body-copy">
                              Трансформируйте оружие посреди схватки и
                              подбирайте стиль против чудовищ, охотников и
                              боссов.
                            </p>
                            <h3>Город, который хранит секреты</h3>
                            <p className="body-copy">
                              Исследуйте переплетённые улицы и соборы Ярнама.
                              Срезы пути, потайные встречи и подземелья Чаш
                              углубляют каждое возвращение.
                            </p>
                          </section>
                          <Gallery images={media.gallery} />
                          <details className="media-customization">
                            <summary>Заменить оформление на своё</summary>
                            <MediaEditor
                              media={mediaOverrides}
                              onSave={saveMedia}
                            />
                          </details>
                          <SectionTitle title="Bloodborne на Windows" />
                          <p className="body-copy">
                            Выбран SuperMedo / bloodborne_pc, windows-v1.9.4.
                            Неофициальный проект на основе bbport и shadPS4:
                            x86-64 код игры выполняется на CPU, графика
                            переводится в Vulkan. PORT не представляет это как
                            официальный нативный PC-релиз.
                          </p>
                          <SectionTitle title="Системные требования" />
                          <p className="muted small">
                            По README SuperMedo · проверено 27 октября 2026 · не
                            измерения PORT
                          </p>
                          <div className="requirements">
                            <div>
                              <span>Система</span>
                              <strong>Windows 10 1903+ / 11 · x64</strong>
                            </div>
                            <div>
                              <span>Процессор</span>
                              <strong>
                                Intel Core 4-го поколения+ / AMD Ryzen
                              </strong>
                            </div>
                            <div>
                              <span>Графика</span>
                              <strong>Vulkan 1.3 · актуальный драйвер</strong>
                            </div>
                            <div>
                              <span>Свободная память</span>
                              <strong>
                                RAM + page file: ~6 ГБ; 1440p/4K: ~10 ГБ
                              </strong>
                            </div>
                          </div>
                          <SectionTitle title="Совместимые файлы и ограничения" />
                          <p className="body-copy">
                            Собственный расшифрованный дамп CUSA03173. Для
                            патчей требуется 1.09. Данные игры не входят в
                            загрузку. Зашифрованные retail PKG не поддерживаются
                            автоматически. На некоторых AMD GPU возможны сбои;
                            сетевой режим — beta. На старых Intel CPU перевод
                            инструкций работает без гарантии; CPU без AVX не
                            поддерживаются. Upstream поддерживает импорт
                            сохранений, но PORT не проверял его на игровых
                            данных.
                          </p>
                          <button
                            className="text-link"
                            onClick={() =>
                              external(`${collection.upstream}#requirements`)
                            }
                          >
                            Требования и известные проблемы upstream
                            <ExternalLink size={14} />
                          </button>
                        </div>
                        <aside className="install-panel">
                          <div className="install-panel-icon">
                            <Download size={24} />
                          </div>
                          <Badge>CUSA03173 · СВОИ ФАЙЛЫ</Badge>
                          <h2>
                            Следующая
                            <br />
                            ночь охоты.
                          </h2>
                          <p>
                            Подготовьте свои игровые файлы. PORT покажет
                            доступные действия и ограничения.
                          </p>
                          <Button onClick={() => setInstaller(true)}>
                            <Download size={17} />
                            Установить
                          </Button>
                          <div className="panel-rule" />
                          <div className="author-row">
                            <span>Windows-проект</span>
                            <strong>SuperMedo</strong>
                          </div>
                          <div className="author-row">
                            <span>Версия</span>
                            <strong>windows-v1.9.4</strong>
                          </div>
                          <Button
                            variant="secondary"
                            onClick={() => external()}
                          >
                            <Github size={17} />
                            Проект на GitHub
                            <ArrowUpRight size={16} />
                          </Button>
                          <div className="file-notice">
                            <ShieldCheck size={18} />
                            <p>
                              Нужны ваши игровые файлы. Результат запуска
                              зависит от версии дампа, оборудования и драйверов.
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
                      </div>
                      <InstalledLibrary
                        cover={media.cover}
                        onCatalog={() => navigate("catalog")}
                      />
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
                        <Badge>КОМПОНЕНТЫ WINDOWS</Badge>
                      </div>
                      <p className="body-copy">
                        Компоненты Windows-проекта загружаются отдельно от ваших
                        игровых данных. Проверенный архив останется в локальном
                        кэше PORT.
                      </p>
                      <DownloadPanel />
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
                            Независимый лаунчер Windows-проектов для консольных
                            игр.
                          </p>
                          <div className="panel-rule" />
                          <p className="small">
                            Stage 02 · Bloodborne
                            <br />
                            Доступны собственная папка и совместимые основные
                            PKG. Патч 1.09 не применяется автоматически;
                            загрузка игры проверяется отдельно.
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
                      Независимый проект<small>·</small>Stage 03 / Bloodborne
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
          title="Установка Bloodborne"
          description="Подготовка собственных игровых файлов. Ничего не устанавливается без проверенной совместимости."
        >
          <InstallerPanel installDir={settings.installDir} />
        </Modal>
        <Modal
          open={about}
          onOpenChange={setAbout}
          title="Миры становятся ближе."
          description="PORT// — независимый Windows-лаунчер. Версия 0.1.0, Stage 03."
        >
          <div className="about-dialog-content">
            <Compass size={46} strokeWidth={1} />
            <p>
              Мы создаём удобный дом для независимых Windows-проектов. Каждый
              порт остаётся работой его авторов. PORT не распространяет
              оригинальные игры.
            </p>
            <p className="muted">
              Bloodborne PC — проект SuperMedo (Mohammed Albarghouthi). PORT не
              связан с Sony или FromSoftware.
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
