import { useEffect, useRef, useState } from "react";
import interLicense from "./assets/fonts/Inter-OFL.txt?raw";
import manropeLicense from "./assets/fonts/Manrope-OFL.txt?raw";
import {
  AnimatePresence,
  motion,
  MotionConfig,
  useReducedMotion,
} from "motion/react";
import { CheckCircle2, Search, WifiOff, X } from "lucide-react";
import {
  defaults,
  native,
  settingsService,
  type Settings,
} from "./services/settings";
import { Button, Modal, Switch } from "./components/ui";
import { emptyMedia } from "./services/media";
import { LauncherUpdates } from "./components/LauncherUpdates";
import { TitleBar } from "./components/TitleBar";
import { appVersion, useUpdater } from "./services/updater";

import { useProjectCatalog } from "./hub/catalog-source";
import { V2Project } from "./hub/V2Project";
import { usePreferences } from "./hub/preferences";
import { CompactProjectCard } from "./hub/ProjectCard";
import { useDownload } from "./hub/downloads";
import { DownloadsCenter } from "./hub/DownloadsCenter";
import { DownloadPanel } from "./hub/DownloadPanel";
import { HubCatalog } from "./hub/HubCatalog";
import {
  defaultCatalogQuery,
  type CatalogQuery,
  type CatalogProject,
} from "./hub/catalog-model";
import { HubLanding } from "./hub/HubLanding";
import { HubSidebar } from "./hub/HubSidebar";
import "./hub/home.css";

type Page = "home" | "catalog" | "details" | "downloads" | "settings";
export default function App() {
  const systemReducedMotion = useReducedMotion();
  const updater = useUpdater();
  const preferences = usePreferences();
  const downloads = useDownload();
  const projectCatalog = useProjectCatalog();
  const [selectedV2, setSelectedV2] = useState<CatalogProject | null>(null);
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
  function navigate(next: Page) {
    setPage(next);
  }
  function openProject(project: CatalogProject) {
    preferences.visit(project.id);
    setSelectedV2(project);
    navigate("details");
  }
  const isLight = settings.theme === "system";
  const reduceMotion = settings.reducedMotion || systemReducedMotion;
  return (
    <MotionConfig reducedMotion={settings.reducedMotion ? "always" : "user"}>
      <div className="port-window">
        <TitleBar onError={setToast} />
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
            {preferences.error && (
              <div role="alert" className="offline-banner">
                {preferences.error}
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
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={page}
                    initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduceMotion ? undefined : { opacity: 0 }}
                    transition={{ duration: reduceMotion ? 0 : 0.16 }}
                  >
                    {page === "home" && (
                      <HubLanding
                        catalog={projectCatalog}
                        onOpen={openProject}
                        onCatalog={() => {
                          setPage("catalog");
                        }}
                      />
                    )}
                    {page === "home" &&
                      preferences.recent.some((id) =>
                        projectCatalog.projects.some((p) => p.id === id),
                      ) && (
                        <section className="recent-projects">
                          <h2>Недавно просмотренные</h2>
                          <div className="hub-catalog-grid">
                            {preferences.recent
                              .map((id) =>
                                projectCatalog.projects.find(
                                  (p) => p.id === id,
                                ),
                              )
                              .filter((p): p is CatalogProject => !!p)
                              .slice(0, 6)
                              .map((p) => (
                                <CompactProjectCard
                                  key={p.id}
                                  project={p}
                                  onOpen={() => openProject(p)}
                                />
                              ))}
                          </div>
                        </section>
                      )}
                    {page === "catalog" && (
                      <HubCatalog
                        catalog={projectCatalog}
                        query={catalogQuery}
                        onQuery={setCatalogQuery}
                        media={(p) => p.media ?? emptyMedia}
                        onOpen={openProject}
                      />
                    )}
                    {page === "details" && selectedV2 && (
                      <V2Project
                        key={selectedV2.id}
                        project={selectedV2}
                        downloads={downloads}
                        onBack={() => navigate("catalog")}
                      />
                    )}
                    {page === "downloads" && (
                      <DownloadsCenter state={downloads} />
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
                                      theme: e.target
                                        .value as Settings["theme"],
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
          <DownloadPanel state={downloads} />
          <Modal
            open={about}
            onOpenChange={setAbout}
            title="О PORT"
            description={`Бесплатный Windows-лаунчер нативных ПК-портов и рекомпиляций консольных игр. Версия ${appVersion}.`}
          >
            <div className="about-dialog-content">
              <p>
                PORT не распространяет игровые файлы. Совместимость и способ
                запуска указаны на странице каждой игры.
              </p>
              <details className="technical-info font-notices">
                <summary>Шрифты и лицензии</summary>
                <p>
                  Manrope · The Manrope Project Authors. Inter · The Inter
                  Project Authors. SIL Open Font License 1.1.
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
            description="Настройки PORT вернутся к исходным значениям. Игровые файлы не затрагиваются."
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
      </div>
    </MotionConfig>
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
