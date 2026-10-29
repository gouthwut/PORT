# Stage 15F — Windows QA

2026-10-29, starting from `198671f`, workspace `C:\PORT`.
No confirmed application defect was found in the accepted checks below, so no
application source was changed. This is a QA report, not full Windows sign-off.
One local documentation commit; no push, installer or production release.

## Environment and isolation

Actual Tauri debug executable, dedicated `app.port.cms-qa` identity, fresh storage
under `.local/stage15f/app-data`. Verified identity through native IPC and an empty
installation registry. The existing read-only local HTTPS CMS transport and its
reviewed certificate were reused. No CMS files, production API, neighboring
repositories, normal PORT storage, Bloodborne/game/runtime/profile/save data were
operated on. Existing dirty work was preserved and excluded from the commit.
No ZIP was opened, extracted or executed. No dialog-bypass switch was used.

## Desktop interaction and live download

Computer Use initially failed twice with `failed to activate captured window` and
captured the running game instead of PORT. After the owner brought PORT forward,
real Windows mouse/keyboard interaction was possible for these checks:

- Opened the project and the native folder picker through the visible app.
- Selected `C:\PORT\.local\stage15f\Загрузки PORT — 日本語 é Ω` in the system
  picker. Cyrillic, spaces, Japanese, accented Latin and Greek characters were
  retained. Real Rust transfer completed to the selected directory.
- Downloaded `Zelda64Recompiled-v1.2.2-Windows.zip`: **28,940,501 bytes**,
  independently checked SHA-256
  `d02b95f1cf5e4d44d6587fa6136c6db521f61aa41ba8700c05f91bea8b0a26d0`.
- Used Downloads → Open folder. Explorer displayed the exact Unicode directory,
  exact ZIP name and **one selected item**; saved screenshot and accessibility tree.
- Used History → Retry, selected the same directory, and observed the real
  existing-file warning. Chose another folder, observed the picker reopening,
  then cancelled it. Native state became cancelled with zero payload bytes;
  the completed ZIP retained its expected hash. A separate native start without
  explicit repeat was rejected as already downloaded.
- Double-clicked the custom titlebar through Windows input and observed native
  maximization. Maximize/restore/minimize also passed the automated native checks.

The attempted Windows-input cancellation of the first ZIP was too late: it had
already completed and its success notification disappeared. This attempt is not
counted as a transfer cancellation. Its incidental gallery opening was closed
with Escape, with no downloaded-file operation.

The final cancellation check used the actual system picker (the owner selected
`C:\PORT\.local\stage15f\cancel test` after Computer Use input failed). A
native automation cancelled immediately after **49,152 received bytes**. Rust
published cancelled state, cleared the path and removed the partial file; the
selected directory was empty. The settled French Downloads row showed cancelled
with Retry enabled. This is a real transfer with manual picker selection and
automated cancellation, not a manual click on the Cancel button.

## Automated checks in the real Tauri process

These used CDP on the actual app WebView and real native IPC, not browser mocks:

- Main Home/Catalog/Downloads/Settings views and About dialog at **800x600** and
  **1280x720**. Screenshots inspected; no horizontal document overflow or titlebar
  overlap. Small-window content uses scrolling. Native project download action
  remained visible at 800x600. Back and Escape returned to the catalog.
- Maximize and restore buttons, titlebar double-click and minimize invoked real
  native window operations. Checked `is_maximized` / `is_minimized` and dimensions.
  CDP's child-WebView `windowState` remained `normal` even when Rust reported
  maximized; it was not used as the acceptance oracle. Initial harness assertions
  against that field and stale child-window geometry were corrected.
- Missing-build failure and retry produced two distinct persisted error jobs.
  These intentionally invalid build IDs test failure/retry, not a successful
  recovery from an upstream network outage.
- Normal process close and a new executable process retained exact SQLite
  settings, French language, favorites/recent IDs and all four then-existing
  history rows, including the successful Unicode-path download and picker cancel.
  Native readback and visible French UI were both checked. The debug frontend
  server was restarted too; an initial WebView connection-error page was reloaded
  after that server was ready. This development-server dependency is not a
  packaged-app failure.

Actual Windows display scale was left unchanged; WebView reported
`devicePixelRatio=1` throughout. No device emulation was used for native evidence.

## Automated regression suites

- `npx playwright test tests/titlebar.spec.ts tests/stage15.spec.ts
tests/stage15-downloads.spec.ts tests/hub-downloads.spec.ts
tests/stage14b-project.spec.ts`: **25 passed**, 0 failed.
- `cargo test --manifest-path src-tauri/Cargo.toml hub_download`:
  **9 passed**, 0 failed (84 filtered out).
- QA debug compilation and actual executable launch passed. No production build
  or installer. No fresh full-suite/clean-checkout or gameplay acceptance claim.

Browser suites include simulated 125%/150% device scale. Those are automated
rendering regressions and do **not** establish actual Windows OS DPI acceptance.

## Remaining manual limits

- Dragging and Windows Snap are **not accepted**. A titlebar drag did not yield a
  reliable observable move; later Computer Use reported a 16x16 window bound,
  then `foreground window did not report a process id` on ordinary dialog input,
  including after reselecting the window. These tool failures do not establish an
  application drag bug. No CSS Snap simulation or Windows-key shortcut was used.
- Actual Windows **125% and 150% DPI were not tested**. Only the unchanged 100%
  session is covered. No OS settings were changed through an alternative API.

## Evidence

Ignored, local only: `C:\PORT\.local\evidence\15f\`.

- `zip-hash-after-conflict.json`: independent file hash after the observed conflict.
- `manual-explorer-selected.jpg`, `manual-explorer-selected.txt`.
- `native-maximized.png`, `native-doubleclick.png`, `native-error-retry.png`.
- `native-*-800.png`, `native-*-1280.png`, `native-project.png`.
- `native-checks.json`, `before-cold-restart.json`, `native-cold-restart.json`.
- `native-transfer-cancelled.png`, `native-transfer-cancelled.json`, `native-final-state.json`.
- `test-results.txt`; local QA scripts/configuration in `.local/stage15f/`.

Screenshots taken immediately after navigation can show a transition frame;
structured assertions and settled screenshots, rather than a selected sidebar
item alone, determine the stated results. Do not reuse unrelated game/other-app
captures as PORT evidence.

Final evidence audit found that Computer Use's returned `state.screenshots[].url`
had retained an old game image even while its automatically displayed image
blocks showed PORT/picker correctly. Four attempted desktop saves were renamed
`rejected-stale-*` and are **excluded** from acceptance evidence. The Explorer
capture and native WebView screenshots were independently opened and verified.
The system picker was reopened and observed again, but its displayed images
were not returned as savable image blocks on that call. No accepted local
desktop-picker image is claimed; the native WebView and Explorer images remain.
The earlier conflict/Unicode desktop results above are observed interactions
with native file/status corroboration, not claims about the rejected images.
The final evidence-only picker again could not receive tool input; its dedicated
QA process was stopped with zero transfer bytes. Its journal may recover as
interrupted on the next QA launch. This happened after the successful normal
cold-restart and cancellation acceptance checks; test data was retained.
