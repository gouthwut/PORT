import { t } from "./i18n";
import {
  CircleHelp,
  Compass,
  Home,
  Settings,
  Gamepad2,
  Download,
  Library,
} from "lucide-react";

export type HubPage =
  "home" | "catalog" | "details" | "library" | "downloads" | "settings";
const links = [
  { id: "home", label: "Главная", icon: Home },
  { id: "catalog", label: "Каталог", icon: Compass },
  { id: "library", label: "Библиотека", icon: Library },
  { id: "downloads", label: "Загрузки", icon: Download },
] as const;

export function HubSidebar({
  page,
  navigate,
  onAbout,
  update,
}: {
  page: HubPage;
  navigate: (page: HubPage) => void;
  onAbout: () => void;
  update: boolean;
}) {
  return (
    <aside className="port-sidebar">
      <button
        className="port-brand"
        aria-label={t("PORT — главная")}
        onClick={() => navigate("home")}
      >
        <span className="port-brand-mark">
          <Gamepad2 size={20} />
        </span>
        PORT<span>//</span>
      </button>
      <p className="port-nav-caption">{t("ОБЗОР")}</p>
      <nav aria-label={t("Основная навигация")}>
        {links.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className="port-nav-link"
            aria-label={t(label)}
            title={t(label)}
            aria-current={
              page === id || (id === "catalog" && page === "details")
                ? "page"
                : undefined
            }
            onClick={() => navigate(id)}
          >
            <Icon size={18} strokeWidth={1.7} />
            <span>{t(label)}</span>
            {id === "home" && <i />}
          </button>
        ))}
      </nav>
      <div className="port-sidebar-art" aria-hidden="true">
        <div className="port-cartridge">
          <Gamepad2 size={34} />
          <b>PORT//</b>
          <span>PLAY BEYOND</span>
          <i />
        </div>
        <span className="port-sidebar-coordinate">EST. 2026 / PC</span>
      </div>
      <div className="port-sidebar-bottom">
        <button
          className="port-nav-link"
          aria-label={t("Настройки")}
          title={t("Настройки")}
          aria-current={page === "settings" ? "page" : undefined}
          onClick={() => navigate("settings")}
        >
          <Settings size={18} />
          <span>{t("Настройки")}</span>
          {update && (
            <small aria-label={t("Доступно обновление PORT")}>●</small>
          )}
        </button>
        <button
          className="port-nav-link"
          aria-label={t("О PORT")}
          title={t("О PORT")}
          onClick={onAbout}
        >
          <CircleHelp size={18} />
          <span>{t("О PORT")}</span>
        </button>
      </div>
    </aside>
  );
}
