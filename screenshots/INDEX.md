# Screenshot index

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
