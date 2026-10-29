import { CircleHelp, Compass, Home, Settings, Gamepad2 } from "lucide-react";

export type HubPage = "home" | "catalog" | "details" | "settings";
const links = [
  { id: "home", label: "Главная", icon: Home },
  { id: "catalog", label: "Каталог", icon: Compass },
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
        aria-label="PORT — главная"
        onClick={() => navigate("home")}
      >
        <span className="port-brand-mark">
          <Gamepad2 size={20} />
        </span>
        PORT<span>//</span>
      </button>
      <p className="port-nav-caption">ОБЗОР</p>
      <nav aria-label="Основная навигация">
        {links.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className="port-nav-link"
            aria-label={label}
            title={label}
            aria-current={
              page === id || (id === "catalog" && page === "details")
                ? "page"
                : undefined
            }
            onClick={() => navigate(id)}
          >
            <Icon size={18} strokeWidth={1.7} />
            <span>{label}</span>
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
          aria-label="Настройки"
          title="Настройки"
          aria-current={page === "settings" ? "page" : undefined}
          onClick={() => navigate("settings")}
        >
          <Settings size={18} />
          <span>Настройки</span>
          {update && <small aria-label="Доступно обновление PORT">●</small>}
        </button>
        <button
          className="port-nav-link"
          aria-label="О PORT"
          title="О PORT"
          onClick={onAbout}
        >
          <CircleHelp size={18} />
          <span>О PORT</span>
        </button>
      </div>
    </aside>
  );
}
