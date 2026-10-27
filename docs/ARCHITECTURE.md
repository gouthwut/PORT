# Architecture

PORT is an offline-first Tauri 2 Windows application. Vite builds React/TypeScript into static assets embedded in the native executable. Web preview is for frontend development, not the desktop deliverable.

## Components

| Location                     | Responsibility                                                                   |
| ---------------------------- | -------------------------------------------------------------------------------- |
| src/App.tsx                  | Screens, navigation, dialogs, search, state                                      |
| src/components/ui.tsx        | Small shadcn-style Radix primitives, CVA buttons                                 |
| src/components/Landscape.tsx | Original resolution-independent artwork                                          |
| src/domain.ts                | CatalogService, InstallerCore, GameAdapter, Installation, InstallEvent contracts |
| src/services/settings.ts     | Native IPC / explicit browser-preview storage boundary                           |
| src-tauri/src/main.rs        | Tauri commands, validated settings, SQLite                                       |
| tests/                       | Playwright frontend behavior and screenshots                                     |
| .github/workflows/           | Windows checks and optional Pages deployment                                     |

## Persistence and IPC

`load_settings() -> Settings`, `save_settings({settings}) -> ()`, `reset_settings() -> Settings` are the only application IPC commands. JSON uses camelCase. SQLite lives at Tauri's app_data_dir()/port.db (Windows: %APPDATA%/app.port.launcher/port.db), schema user_version=1, one validated settings JSON record, serialized with a Mutex and atomic SQLite upsert. A failed save does not change visible settings; errors are shown, never silently replaced with a browser fallback. Native startup returns an error if the database cannot open; it does not silently replace the database. Browser preview uses localStorage key port.settings.v1 and is labelled WEB PREVIEW.

Settings include dark/system theme, future install directory, reduced motion and compact cards. Folder picker uses the native dialog plugin, then stores only an absolute path. No game files are read or moved. Reset only deletes PORT's settings record. There is no pretend installed-library database: installation records will arrive with Stage 02/03 migrations.

## Future installer boundary (not implemented)

CatalogService currently resolves a static local collection. No network is required. InstallerCore is an interface with no concrete implementation; no UI button invokes it. The Uncharted adapter describes one shared installation group with three title IDs, `Uncharted.exe` as documented entry point, and unverified individualLaunch/packageSupport. API types do not imply verified compatibility.

Before implementation: introduce a reviewed compatibility manifest pinned to a release/revision; validate trusted HTTPS download sources, asset size and digests; stream to a staging directory; reject traversal, drive/UNC/ADS paths, symlinks/reparse points and archive bombs; verify canonical destinations remain inside staging. Keep extraction exclusively local, never upload packages. Installation should atomically swap verified content, preserve saves/settings, recover interruptions and log actionable errors without secrets. Never overwrite user files during upgrade or recursively delete an unchecked computed path. Pause/cancel need explicit lifecycle semantics and cleanup before UI activation. Do not infer launch flags from display title IDs.

## Security

Tauri embeds local content, uses CSP and minimal capabilities. No general filesystem or shell API is exposed to frontend. Opener is scoped to the upstream GitHub project; native dialog allows folder selection. No analytics, accounts, remote image fetches, automatic updates or package execution. WebView2 debugging used only in test process environment must not become a production launch default.
