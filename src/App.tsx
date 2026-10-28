import { useEffect, useRef, useState } from "react";
import interLicense from "./assets/fonts/Inter-OFL.txt?raw";
import manropeLicense from "./assets/fonts/Manrope-OFL.txt?raw";
import {
  AnimatePresence,
  motion,
  MotionConfig,
  useReducedMotion,
} from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Download,
  ExternalLink,
  Folder,
  GitBranch as Github,
  Grid2X2,
  HardDrive,
  Library,
  Search,
  ShieldCheck,
  WifiOff,
  X,
} from "lucide-react";
import { collection } from "./domain";
import {
  defaults,
  native,
  settingsService,
  type Settings,
} from "./services/settings";
import { Button, Modal, Switch, gameCount } from "./components/ui";
import { GameArt, Gallery } from "./components/BloodborneMedia";
import { FolderImport } from "./components/FolderImport";
import { RecipeInstall, type RecipeSummary } from "./components/RecipeInstall";
import { invoke } from "@tauri-apps/api/core";
import { setRecipeCollections } from "./services/adapters";
import { InstallerPanel, DownloadPanel } from "./components/Installer";
import { emptyMedia, mediaService, type MediaSet } from "./services/media";
import { resolveMedia } from "./services/bundled-media";
import { InstalledLibrary } from "./components/InstalledLibrary";
import { LauncherUpdates } from "./components/LauncherUpdates";
import { appVersion, useUpdater } from "./services/updater";

import { useGameState } from "./services/game-state";
import { GameAction } from "./components/GameAction";
import {
  useCatalog,
  catalogMedia,
  supportsInstall,
  type PublishedGame,
} from "./services/catalog";
import { CatalogDetail, CatalogSettings } from "./components/OnlineCatalog";

import { useV1Projects } from "./hub/catalog-source";
import { HubCatalog } from "./hub/HubCatalog";
import { defaultCatalogQuery, type CatalogQuery } from "./hub/catalog-model";
import { HubLanding } from "./hub/HubLanding";
import { HubSidebar } from "./hub/HubSidebar";
import "./hub/home.css";

type Page =
  "home" | "catalog" | "details" | "library" | "downloads" | "settings";
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
export default function App() {
  const systemReducedMotion = useReducedMotion();
  const updater = useUpdater();
  const games = useGameState();
  const catalog = useCatalog();
  const projectCatalog = useV1Projects(catalog);
  const [selectedGame, setSelectedGame] = useState<PublishedGame | null>(null);
  const [mediaOverrides, setMedia] = useState<MediaSet>(emptyMedia);
  const media = resolveMedia(mediaOverrides);
  const [page, setPage] = useState<Page>("home");
  const [catalogQuery, setCatalogQuery] = useState<CatalogQuery>({
    ...defaultCatalogQuery,
  });
  const query = catalogQuery.search;
  const setQuery = (search: string) =>
    setCatalogQuery((q) => ({ ...q, search, page: 1 }));
  const [settings, setSettings] = useState<Settings>(defaults);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [choosingFolder, setChoosingFolder] = useState(false);
  const folderDialogOpen = useRef(false);
  const [installer, setInstaller] = useState(false);
  const [installAdapter, setInstallAdapter] = useState("bloodborne");
  const [recipes, setRecipes] = useState<RecipeSummary[]>([]);
  useEffect(() => {
    if (!native) return;
    // Cached recipes first (offline), then a refresh from the CMS endpoint.
    const apply = (r: RecipeSummary[]) => {
      setRecipeCollections(
        r.filter((x) => x.supported).map((x) => x.collectionId),
      );
      setRecipes(r);
    };
    void invoke<RecipeSummary[]>("list_recipes")
      .then(apply)
      .catch(() => {});
    void invoke<RecipeSummary[]>("sync_recipes")
      .then(apply)
      .catch(() => {});
  }, []);
  const recipeFor = (collectionId?: string) =>
    recipes.find((r) => r.collectionId === collectionId);
  const installable = supportsInstall;
  const beginInstall = (id = "bloodborne") => {
    setInstallAdapter(id);
    setInstaller(true);
  };
  const activeRecipe =
    installAdapter === "bloodborne" || installAdapter === "skate3"
      ? undefined
      : recipeFor(installAdapter);
  const [about, setAbout] = useState(false);
  const [reset, setReset] = useState(false);
  const [toast, setToast] = useState("");
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    mediaService
      .load()
      .then(setMedia)
      .catch(() => setToast("Не удалось загрузить изображения"));
  }, []);
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
  }
  function openGame(game: PublishedGame) {
    setSelectedGame(game);
    navigate("details");
  }
  const gameMedia = (g: PublishedGame) => {
    const remote = catalogMedia(g, catalog.snapshot.images);
    if (g.id !== "bloodborne") return remote;
    return {
      cover: mediaOverrides.cover || remote.cover || media.cover,
      banner: mediaOverrides.banner || remote.banner || media.banner,
      hero: mediaOverrides.hero || remote.hero || media.hero,
      gallery: mediaOverrides.gallery.length
        ? mediaOverrides.gallery
        : remote.gallery.length
          ? remote.gallery
          : media.gallery,
    };
  };
  const selectedPublished =
    selectedGame &&
    catalog.snapshot.catalog.games.find((g) => g.id === selectedGame.id);
  const detailGame = selectedPublished || selectedGame;
  const isLight = settings.theme === "system";
  const reduceMotion = settings.reducedMotion || systemReducedMotion;
  return (
    <MotionConfig reducedMotion={settings.reducedMotion ? "always" : "user"}>
      <div
        className={`app-shell port-shell ${page === "home" ? "port-home-active" : ""} ${settings.compactCards ? "compact" : ""} ${settings.reducedMotion ? "reduced-motion" : ""} ${isLight ? "system-theme" : ""}`}
      >
        <a className="skip-link" href="#main">
          К содержимому
        </a>
        <HubSidebar
          page={page}
          navigate={navigate}
          onAbout={() => setAbout(true)}
          update={!!updater.status.version}
        />
        <div className="content-shell">
          <header className="topbar">
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
                placeholder="Поиск игр, проектов, платформ…"
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
            {!native && <div className="build-label">WEB PREVIEW</div>}
          </header>
          {!online && (
            <div role="status" className="offline-banner">
              <WifiOff size={15} />
              Нет подключения к интернету.
            </div>
          )}
          {storageError && (
            <div role="alert" className="offline-banner">
              Не удалось прочитать настройки. Проверьте локальные данные или
              сбросьте настройки.
            </div>
          )}
          {games.operation?.recoveryError && (
            <div role="alert" className="offline-banner">
              {games.operation.recoveryError}
            </div>
          )}
          <main id="main" tabIndex={-1} ref={mainRef} aria-busy={!ready}>
            {!ready ? (
              <div className="skeleton" aria-label="Загрузка интерфейса" />
            ) : (
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={page}
                  initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduceMotion ? undefined : { opacity: 0 }}
                  transition={{ duration: reduceMotion ? 0 : 0.16 }}
                >
                  {games.error && (
                    <p role="alert" className="installer-error">
                      {games.error}
                      <Button
                        variant="ghost"
                        onClick={() => void games.refresh().catch(() => {})}
                      >
                        Повторить загрузку состояния
                      </Button>
                    </p>
                  )}
                  {page === "home" && (
                    <HubLanding
                      catalog={catalog}
                      media={gameMedia}
                      onOpen={openGame}
                      activity={
                        (games.operation?.active ||
                          games.operation?.phase === "error") && (
                          <GameAction
                            state={games}
                            collectionId={
                              games.operation?.collectionId || installAdapter
                            }
                            onInstall={() =>
                              beginInstall(
                                games.operation?.collectionId || installAdapter,
                              )
                            }
                          />
                        )
                      }
                      onCatalog={() => {
                        setPage("catalog");
                      }}
                    />
                  )}
                  {page === "catalog" && (
                    <HubCatalog
                      catalog={projectCatalog}
                      query={catalogQuery}
                      onQuery={setCatalogQuery}
                      media={(p) =>
                        p.legacy ? gameMedia(p.legacy) : emptyMedia
                      }
                      onOpen={(p) => {
                        const g = p.legacy;
                        if (!g) return;
                        catalog.snapshot.source === "demo" &&
                        g.id === "bloodborne"
                          ? (setSelectedGame(null), navigate("details"))
                          : openGame(g);
                      }}
                    />
                  )}
                  {page === "details" && detailGame && (
                    <CatalogDetail
                      published={!!selectedPublished}
                      game={detailGame}
                      state={games}
                      media={gameMedia(detailGame)}
                      onBack={() => navigate("catalog")}
                      onInstall={() =>
                        beginInstall(
                          recipeFor(detailGame.collectionId)
                            ? detailGame.collectionId
                            : detailGame.adapterId,
                        )
                      }
                    />
                  )}
                  {page === "details" && !detailGame && (
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
                          <Gallery images={media.gallery} />
                          <details className="game-features technical-info">
                            <summary>Искусство охоты</summary>
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
                          </details>
                          <details className="technical-info runtime-info">
                            <summary>
                              Как Bloodborne работает на Windows
                            </summary>
                            <p className="body-copy">
                              Выбран SuperMedo / bloodborne_pc, windows-v1.9.4.
                              Неофициальный проект на основе bbport и shadPS4:
                              x86-64 код игры выполняется на CPU, графика
                              переводится в Vulkan. PORT не представляет это как
                              официальный нативный PC-релиз.
                            </p>
                          </details>
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
                            {games.items.some(
                              (i) => i.collectionId === collection.id,
                            )
                              ? "Игра готова к запуску."
                              : "Выберите свои файлы игры. PORT проверит совместимость перед установкой."}
                          </p>
                          <GameAction
                            state={games}
                            collectionId={collection.id}
                            onInstall={() => beginInstall()}
                          />
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
                          <h1>
                            Библиотека<span className="accent">.</span>
                          </h1>
                        </div>
                      </div>
                      <InstalledLibrary
                        media={{
                          ...Object.fromEntries(
                            [
                              ...catalog.snapshot.known,
                              ...catalog.snapshot.catalog.games,
                            ].map((g) => [g.collectionId, gameMedia(g)]),
                          ),
                          [collection.id]: media,
                        }}
                        names={Object.fromEntries(
                          [
                            ...catalog.snapshot.known,
                            ...catalog.snapshot.catalog.games,
                          ].map((g) => [g.collectionId, g.title]),
                        )}
                        state={games}
                        onCatalog={() => navigate("catalog")}
                      />
                    </>
                  )}
                  {page === "downloads" && (
                    <>
                      <div className="page-heading">
                        <div>
                          <h1>
                            Загрузки<span className="accent">.</span>
                          </h1>
                        </div>
                        <Badge>КОМПОНЕНТЫ WINDOWS</Badge>
                      </div>
                      <DownloadPanel />
                    </>
                  )}
                  {page === "settings" && (
                    <>
                      <div className="page-heading">
                        <div>
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
                          <SettingsSection title="Внешний вид">
                            <div className="setting-row">
                              <div>
                                <h3>Тема приложения</h3>
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
                          <SettingsSection title="Установка и хранение">
                            <div className="setting-row folder-setting">
                              <div>
                                <h3>Папка установки</h3>
                                <p>По умолчанию для новых установок</p>
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
                                ? undefined
                                : "Режим браузера: настройки хранятся в localStorage."
                            }
                          >
                            <div className="setting-row">
                              <div>
                                <h3>Сбросить настройки</h3>
                                <p>Игры и сохранения останутся</p>
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
                          <CatalogSettings state={catalog} />
                          <LauncherUpdates state={updater} />
                        </div>
                      </div>
                    </>
                  )}
                </motion.div>
              </AnimatePresence>
            )}
          </main>
        </div>
        <Modal
          open={installer}
          onOpenChange={(open) => {
            setInstaller(open);
            if (!open) void games.refresh().catch(() => {});
          }}
          title={
            activeRecipe
              ? `Установка ${activeRecipe.title}`
              : installAdapter === "skate3"
                ? "Установка Skate 3"
                : "Установка Bloodborne"
          }
          description="Выберите файлы игры и папку установки."
        >
          {activeRecipe ? (
            <RecipeInstall
              recipe={activeRecipe}
              defaultParent={settings.installDir}
            />
          ) : installAdapter === "skate3" ? (
            <FolderImport
              sourceKind="xbox360-iso"
              defaultParent={settings.installDir}
            />
          ) : (
            <InstallerPanel
              installDir={settings.installDir}
              artwork={media.banner || media.hero || media.cover}
            />
          )}
        </Modal>
        <Modal
          open={about}
          onOpenChange={setAbout}
          title="О PORT"
          description={`Лаунчер и установщик независимых Windows-проектов для консольных игр. Версия ${appVersion}.`}
        >
          <div className="about-dialog-content">
            <p>
              PORT не распространяет игровые файлы. Совместимость и способ
              запуска указаны на странице каждой игры.
            </p>
            <details className="technical-info font-notices">
              <summary>Шрифты и лицензии</summary>
              <p>
                Manrope · The Manrope Project Authors. Inter · The Inter Project
                Authors. SIL Open Font License 1.1.
              </p>
              <h3>Manrope</h3>
              <pre>{manropeLicense}</pre>
              <h3>Inter</h3>
              <pre>{interLicense}</pre>
            </details>
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
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="settings-section">
      <h2>{title}</h2>
      {description && <p className="muted">{description}</p>}
      {children}
    </section>
  );
}
