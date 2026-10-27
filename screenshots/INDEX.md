# Screenshot index

## Stage 02 Bloodborne — 2026-10-27

Current screenshots contain **no redistributed Bloodborne artwork**. Empty art slots indicate local import is required. `qa-fixture` images contain labelled synthetic test cards, never gameplay. Earlier screenshots below are preserved as Stage 01 history.

| File                                                             | Evidence                                                                               |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 02a-01-home-1440.png                                             | Chromium preview: Bloodborne home, original shell/palette                              |
| 02a-02-catalog.png                                               | Chromium preview: one vertical Bloodborne card                                         |
| 02a-03-bloodborne.png                                            | Chromium preview: detailed game page                                                   |
| 02a-04-library.png                                               | Chromium preview: honest empty library                                                 |
| 02a-05-downloads.png                                             | Chromium preview: native-only download controls unavailable                            |
| 02a-06-settings.png                                              | Chromium preview: settings                                                             |
| 02a-07-installer.png                                             | Chromium preview: metadata/download entry point and extraction blocker                 |
| 02a-08-home-1024.png / 02a-08-home-800.png / 02a-08-home-480.png | Browser responsive checks; not native resize proof                                     |
| 02a-09-settings-system-light.png                                 | Browser system/light theme                                                             |
| 02a-10-offline.png                                               | Browser offline navigation                                                             |
| 02a-gallery-qa-fixture.png                                       | Fullscreen gallery with labelled synthetic QA cards; keyboard/wrap/focus verified      |
| 02-native-home.png                                               | Built release exe's real WebView; not Vite                                             |
| 02-native-inspector.png                                          | Native PKG picker entry point, no real user's game metadata                            |
| 02-native-verified-download.png                                  | Real native backend: official 189268960-byte runtime ZIP, SHA-256 and ZIP CRC verified |

Native evidence uses temporary loopback CDP set only in the launched test process. Computer Use also activated and visually inspected PORT's actual Windows window/title bar. WebView screenshots omit the OS chrome. Native metadata fixtures contain header bytes only, not game data. User PKG selection and gameplay remain unverified unless recorded in PROGRESS.md.

## Stage 01 historical evidence

Browser frontend screenshots produced by Playwright, Chromium, Windows, Russian locale. These do not on their own prove native execution. Main content scrolls inside the viewport; shots show the initial visible region.

| File                         | Contents                                       |
| ---------------------------- | ---------------------------------------------- |
| 01-home-1440.png             | Main screen at 1440×1000                       |
| 02-catalog.png               | Catalog with one planned collection            |
| 03-uncharted.png             | Collection details and installation state      |
| 04-library.png               | Empty library                                  |
| 05-downloads.png             | Empty queue and explicitly labelled 0% mock    |
| 06-settings.png              | Settings in browser preview                    |
| 07-installer-plan.png        | Honest future installer dialog                 |
| 08-home-1024.png             | Compact desktop 1024×768                       |
| 08-home-800.png              | Native minimum-size content equivalent 800×600 |
| 08-home-480.png              | Narrow browser stress check 480×850            |
| 09-settings-system-light.png | System theme in light color scheme             |
| 10-offline.png               | Offline library                                |

Native evidence from the built release executable (real Tauri WebView, not Vite):

| File                   | Contents                                                        |
| ---------------------- | --------------------------------------------------------------- |
| 11-native-home.png     | Native home after real executable launch                        |
| 12-native-settings.png | Native SQLite settings after save and WebView reload            |
| 13-native-resized.png  | Real native WebView resized to 1042×782; no horizontal overflow |

Computer Use additionally inspected the Windows title bar and native folder dialog. These WebView captures omit OS title bars. See PROGRESS.md for full-process restart validation and tool limitations.
