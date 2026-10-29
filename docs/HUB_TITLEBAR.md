# Stages 13C–13D — custom title bar and Windows QA

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

## Stage 13D — Windows QA, 2026-10-29

Base: `359ddc1`. The Stage 13C implementation, production window configuration,
40px design, capability permissions and isolated QA configuration are unchanged.
No confirmed application defect requiring a production code change was found.
This is a **partial Windows acceptance result**, not certification of Snap,
every diagonal resize gesture or mixed-monitor DPI.

### Environment and isolation

- Actual Windows debug executable, built without bundling or an installer:
  `npm run tauri build -- --debug --no-bundle --config src-tauri/tauri.titlebar-qa.conf.json`.
- Checked actual IPC identity `app.port.titlebar-qa`, empty isolated installations,
  decorations disabled and resizing enabled before native tests. No production
  registration, profile, game file, download or installation was operated on.
- Monitor reported by Tauri: 1920×1080, working area 1920×1032, scale factor 1.0.
  Initial QA client size: 1440×960. For accessible edge testing, a second debug
  build merged an ignored `.local/stage13d-small.conf.json` **after the same QA
  config**, overriding only starting window size/position to 1000×720 at (80,80)
  and skipping the already completed frontend build. All original window flags
  and the 800×600 minimum were retained. No additional window permissions.
- Computer Use supplied physical mouse gestures. Native IPC state/geometry was
  read separately through the QA WebView's temporary loopback debugging port 9237. DOM-dispatched events and Playwright clicks are identified separately.
  Port and process end with QA; they are not production configuration.
- Ignored reports, read-only observer and native test scripts, temporary config
  and WebView screenshots: `.local/stage13d-*`, `.local/evidence/13d/`.
  Screenshot images of WebView content alone do not prove desktop snapping.

### Results

| Check                              | Result and evidence                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Drag empty bar                     | **PASS, physical gesture.** Native outer position (156,111) → (256,161); client size remained 1440×960.                                                                                                                                                                                                                                                                    |
| Drag PORT text                     | **PASS, physical gesture.** Position (256,161) → (316,172); size unchanged.                                                                                                                                                                                                                                                                                                |
| Double click empty bar             | **PASS, physical gesture.** `is_maximized=true`, client 1920×1032, matching the monitor working area.                                                                                                                                                                                                                                                                      |
| Double click PORT / restore        | Injected Tauri handler passed with synthetic `mousedown(detail=2)` on both regions. A physical PORT double click was followed by restored 1000×720 at (80,80), but the helper also reported concurrent user input; deterministic physical acceptance remains manual.                                                                                                       |
| Maximize / restore buttons         | **PASS, native WebView clicks and actual IPC state**, including restore-label changes. Not solely mocked browser commands.                                                                                                                                                                                                                                                 |
| Minimize                           | **PASS, native WebView click and `is_minimized=true`.** Foreground activation restored the first minimized QA window.                                                                                                                                                                                                                                                      |
| Close                              | Actual scoped close and QA process exit verified. This does not test closing during an active download.                                                                                                                                                                                                                                                                    |
| Top / left / right / bottom resize | **PASS, physical gestures.** Client sizes in order: 1000×720 → 1000×680 → 960×680 → 920×680 → 920×640. Position changes matched top/left resizing; bar remained 40 CSS px.                                                                                                                                                                                                 |
| Top-left corner                    | **PASS, physical diagonal gesture.** 920×640 → 910×630; position (120,120) → (130,130).                                                                                                                                                                                                                                                                                    |
| Other three corners                | **PARTIAL.** Top-right attempts changed height only (630 → 620 → 610); bottom-left changed width only (910 → 900); bottom-right did not change size. The bounded capture/input path did not establish diagonal nonclient hit testing. Do not mark passed or infer a Tauri defect from these attempts.                                                                      |
| Drag-to-edge Snap                  | **UNCONFIRMED.** Approached left edge, moving the QA window partly off-screen to (-360,150). Subsequent release attempts did not establish a snap. Clipped-window coordinates/captures became inconsistent and sometimes contained other foreground content. Stop at this limit; neither success nor an application failure is established. Right/top edges remain manual. |
| Windows 11 hover Snap Layouts      | **Unsupported by the current HTML maximize button.** Drag-to-edge Snap is a separate behavior. No CSS flyout or custom Win32 hit testing added.                                                                                                                                                                                                                            |
| Native DPI 125% / 150%             | **NOT TESTED.** Only scale factor 1.0 was available in this run; Windows display settings were not changed. Browser device scale 1.25/1.5 is separate rendering evidence below.                                                                                                                                                                                            |
| Content / navigation / dialogs     | Native Home/bar and About bounds passed. Browser layout checks cover shell/sidebar, Home/catalog navigation and About at minimum size and fractional rendering scales. Existing v2 tests cover project navigation. Live native project content was unavailable due to the existing catalog failure.                                                                        |
| Download panel                     | Browser mocked-status checks pass at 1440×960 and 800×600: panel stays below the bar and within all viewport bounds; remains visible after dialog dismissal. No real transfer started or downloader implementation changed.                                                                                                                                                |

### Targeted automated checks

- TypeScript/Vite build PASS; isolated debug builds PASS, no installer. Existing
  frontend bundle warning above 500 kB remains.
- Existing v2 regressions **15/15 PASS** and download UI regressions **3/3 PASS**.
- Final `tests/titlebar.spec.ts`: **4/4 PASS**. Added fractional device scale
  1.25/1.5 cases at 1024×688 and 800×600, logical bar/control/shell bounds,
  catalog navigation and About-dialog bounds. Extended mocked download-panel
  bounds to the minimum window size and checked modal DOM hit interception
  over the bar. DOM interception does not prove native nonclient interception.
- The first combined run passed 20 tests and failed the two newly added scale
  cases because their catalog selector used `.port-catalog` instead of the actual
  `.hub-catalog`. Corrected the selector; final four title-bar tests passed.
  No production behavior or assertion was weakened to hide a failure.
- Changed-file formatting and whitespace checks PASS. No Rust source changed;
  no full legacy UI/Rust suite, production release, push or next stage.

### Remaining manual acceptance

Use the committed isolated QA config above. Record Windows version, monitor,
scale, Snap settings and actual results rather than filling these as passed:

1. At 100%, resize **all four corners diagonally in both directions** using the
   native border, including the three inconclusive corners. Check the 800×600
   logical minimum, buttons and content after repeated resize/restore cycles.
2. Drag the empty bar to the **left, right and top screen edges**, hold for the
   real Windows preview, release and verify the resulting placement. Drag away
   to restore. Repeat from maximized and snapped windows; confirm icon state.
   Try Win+Arrow and Win+Z manually. These shortcuts were not automated.
3. Double click PORT text to maximize and restore without concurrent input;
   repeat on the empty bar. Check minimize → taskbar restore and close normally.
4. At **Windows DPI 125% and 150%**, repeat drag, all edges/corners, maximize,
   restore and Snap. Check 50/60 physical-pixel rendering of the 40 logical-pixel
   bar, crisp icons and hit targets. Move between monitors with different DPI;
   confirm no clipped buttons, stale restore icon or content under the bar.
5. Navigate Home → catalog → a real project, open About and an ordinary native
   dialog when available. With an independently available download panel, check
   minimum-size and maximized layouts. While a modal is open, verify its overlay
   blocks title-bar controls/dragging as intended; dismissing it restores input.
   Do not create a transfer, change user data or start an installer for this QA.

The HTML button cannot promise the native hover Snap Layouts flyout. The upstream
issue linked above remains open when checked for this stage. If full native
caption behavior becomes a requirement, evaluate real window decorations as a
separately authorized change; this QA does not replace system behavior in CSS.
