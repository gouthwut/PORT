# Stage 13C — custom title bar

The main window uses a 40 CSS-pixel title bar above the unchanged shared shell.
PORT text and a wide empty region drag the window; separate accessible buttons
minimize, maximize/restore and close it. Lucide icons reuse the installed library.
Graphite/violet surfaces, a fine border and muted red close hover need no blur,
timers or motion. EXE/installer icons and the sidebar identity are unchanged.

`decorations: false` and `resizable: true` use the normal Tauri window. Controls
call `getCurrentWindow()` methods with four main-window capability permissions.
`core:default` already permits state queries and internal double-click maximize.
`data-tauri-drag-region` uses Tauri's injected handler, including double click;
the official `app-region: drag` CSS also marks this noninteractive area for
WebView2 native dragging. Buttons are outside it. Initial and resize-time native
state queries update the restore icon after external window changes. Errors use
the existing toast; browser preview explicitly disables window controls.

The shell/sidebar consume the remaining viewport height. Dialog content is
centered in that area and height-bounded; its modal overlay intentionally covers
the window, including the bar. Download notifications retain their existing
bottom-right position, implementation and close/cancellation behavior.

## Windows limits and safe alternative

- Standard resizing, drag-to-edge Snap and Windows keyboard snapping depend on
  Tauri/WebView2/Windows and local Snap settings. There is no custom hit-testing,
  fake resize handle or simulated Snap menu in this change.
- Windows 11's **Snap Layouts flyout on maximize-button hover is not supplied**
  by an HTML button. Tauri's frameless support has an upstream limitation; do not
  present drag-to-edge snapping as proof of hover flyout support.
- For an owner who requires all system caption functions, the conservative
  alternative is to retain `decorations: true` and the real system title bar,
  removing the custom bar and its reserved height. That is a separate choice;
  this stage does not add fragile Win32 subclassing or replace the flyout in CSS.
- Sizes are logical CSS pixels, with no fixed physical-pixel hit regions. Native
  QA ran at scale factor **1.0**. Mixed-monitor 125/150/200% DPI, pen/touch and
  physical edge dragging/resizing still require manual checks.

References: [official Tauri customization](https://v2.tauri.app/learn/window-customization/),
[Tauri Windows frameless Snap issue](https://github.com/tauri-apps/tauri/issues/4531).

## Validation and preview

Frontend TypeScript/Vite build passed; final targeted Playwright **20/20** cover
window commands/state/error feedback, keyboard controls, disabled browser
controls, shell/dialog bounds at 1440×960 and 800×600, download-panel bounds,
and the existing v2 catalog/download regressions. Browser IPC mocks do not prove
native window behavior.

An actual debug Windows executable was built and run with the isolated
`app.port.titlebar-qa` identity. Actual IPC confirmed no decorations, resizing
enabled, maximize/restore, minimize, and empty isolated installations. Tauri's
double-click handler passed both synthetic DOM checks and real mouse double
click via Computer Use. Close exited the QA process. Actual drag attempts did
not establish movement; the automation returned inconsistent captures of the
selected window, so physical drag/resize/Snap is **not marked passed**. Original
user registrations, profiles and game files were not operated on. Native QA
scripts/reports stay ignored in `.local/stage13c-*`.

From `C:\PORT`, run:

```powershell
npm run tauri dev -- --config src-tauri/tauri.titlebar-qa.conf.json
```

This previews the native window with separate QA settings/data. Close any prior
QA instance first. Alternatively open `src-tauri\target\debug\port-launcher.exe`
from this session's QA build. `npm run dev` previews layout in a browser, where
window controls are intentionally disabled. No production installer is built.

Manual acceptance: drag the empty bar and PORT text; double click both;
resize each edge/corner; maximize/restore/minimize/close; drag to Windows edges
and try Win+Arrow / Win+Z; move between differently scaled monitors; open About
and navigate Home/catalog/project while a download panel is visible. The live
catalog may still show its existing API failure, independently of the title bar.
