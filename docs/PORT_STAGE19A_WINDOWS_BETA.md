# Stage 19A — local Windows installer acceptance

2026-10-29. Based on Stage 18E (`11bf8d8`), tested on the existing dirty working
tree. Local acceptance only: no push, publication, CMS access/change or release.
**The installer works; the public beta is not ready.**

## Artifacts and installation

- Candidate: `C:\PORT\.local\stage19a\PORT_0.1.0_x64-setup.exe`.
- Size: **5,909,392 bytes (5.64 MiB)**.
- SHA-256: `c58547004125373edebfb6ae98c925d6e07b331cc66843fde5390f507237abc1`.
- Product/window: PORT; package version 0.1.0; identifier `app.port.launcher`.
- Standard Tauri NSIS, current-user installation, app/installer/uninstaller ICO.
  Windows executable metadata and generated NSIS definitions were checked.
- Unsigned Authenticode (`NotSigned`), no updater signature/key/channel. No Windows
  protections were changed and no signing key was generated.

Build locally with `pwsh -NoProfile -File scripts/build-windows-beta.ps1`.
It uses the installed Tauri bundler and rejects inherited Vite/updater/Tauri
overrides. `PORT_BETA_BUILD=1` excludes the optional local PKG worker. The ordinary
personal build retains its existing optional worker behavior. No local inputs are
deleted or moved. The frontend allowlist/hash check runs before native bundling.

The actual installation test used the same release source/assets with product
`PORT Stage19A QA`, identifier `app.port.stage19a-qa`, installation directory
`.local/stage19a/installed`, and separate `.local/stage19a/app-data`. Its window
still says PORT. Only QA adds permission to resize its window for the size matrix.
Build with `-Isolated`, then `-Isolated -QaVersion 0.1.1` for the upgrade test.
These QA version overrides do not change package.json or the candidate's version.

Actual NSIS install 0.1.0, first launch, upgrade to QA 0.1.1 and uninstall returned
exit 0. Windows' uninstall registry entry had the correct QA name, version, icon,
path and uninstaller. The installed executable loaded `http://tauri.localhost/`
assets without a frontend server or Node/npm/Rust at runtime. Settings, French
language, reduced-motion preference, favorites and a real rejected-download
history entry survived the upgrade. Empty QA game registration stayed empty.

Uninstallation removed the QA executable/resources/Windows registration and
retained its data. Reinstall/uninstall with the app closed preserved **all three
SQLite DB/WAL/SHM hashes**. A read through SQLite after uninstall confirms schema
4, integrity `ok`, settings, favorite and history. An early before-hash attempt
raced process shutdown; the complete app-closed repeat is acceptance evidence.
The QA copy and its debug listener are closed/uninstalled; retained QA data and
installers remain local. The main candidate was not installed over the owner's
identity. Existing user AppData files and both registration rows are unchanged
by hash/record comparison; no game, runtime or save operation was performed.

## Runtime and packaging

Tauri uses its standard WebView2 `downloadBootstrapper` behavior: an existing
Evergreen runtime is reused, otherwise the standard installer downloads the
Microsoft bootstrapper. Internet is needed when WebView2 is absent. No fixed
runtime, Node, Rust or .NET is required by this worker-free candidate. PE imports
are Windows system/UCRT libraries, with no VCRUNTIME/MSVCP DLL dependency found.
This machine already had WebView2; first installation without WebView2 on a clean
Windows 10/11 x64 VM remains manual acceptance. See the official
[Tauri Windows installer documentation](https://v2.tauri.app/distribute/windows-installer/).

7-Zip independently listed and extracted the final NSIS payload. The only app
payload is `port-launcher.exe` (20,382,720 bytes) and `licenses/` containing PORT's
MIT license, both complete font OFL texts and BETA-NOTICES.md. NSIS also contains
its standard wizard bitmap and five installer helper DLLs. The extracted app and
the build output differ at exactly three bytes: Tauri's bundle-type marker is
`NSS` in the installer versus restored `UNK` in the build output.

The frontend contains eight allowlisted files: index.html, PORT SVG, two JS
chunks, CSS, the original PORT hero and two fonts. Hashes match the reviewed
original hero/fonts/icon. The actual entry imports Stage 18 Liquid Glass and
Stage 18D/E heroes/cards; no HTML exploration prototype is used. The negative
audit check rejects an unexpected file. No private Bloodborne images, game/PKG
payloads, saves, SQLite, secrets/.env, test fixtures, QA media, evidence, archives
or private source inputs are in the packaged file list/frontend graph reviewed.
The scan is a scoped packaging check, not a general secret-scanning certification.

Rights inventory:

| Material                                         | Evidence / disposition                                                                         |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| PORT code and geometric icon                     | Repository MIT/original project asset                                                          |
| Original generated Home hero                     | Provenance and prompt in HUB_HOME_REVIEW.md; branded illustration, not a game screenshot       |
| Inter / Manrope                                  | Exact source hashes in src/assets/fonts/README.md; included SIL OFL notices                    |
| JavaScript / Rust dependencies, including Lucide | Metadata inventories exist; full notice/attribution bundle still incomplete — release blocker  |
| Private Bloodborne WebP files                    | Rights unconfirmed; absent from active graph/payload; original local files retained            |
| Local LGPL PKG worker                            | Deliberately excluded; compliant source/notice/relinking package needed before distributing it |
| CMS game covers/screenshots/banners              | Fetched at runtime, absent from installer; publication rights must be reviewed separately      |

PORT's/code authors' licenses do not grant rights to original console game data
or trademarks. No third-party game's runtime or commercial data was acquired.

## API and downloader boundaries

Production origin comes from `src/hub/source-config.json`:
`https://port-catalog-cms.port-catalog-cms.workers.dev`, v2, no v1 fallback.
`VITE_HUB_SOURCE_JSON` is now honored **only in dev**. The native downloader
independently fetches approval from its fixed production CMS URL by IDs.

Release assets contain no working `localhost:8787` frontend endpoint. The native
local-CMS transport requires both debug + `local-cms-qa` feature and its dedicated
identity; main rejects other identities with that feature. No TLS validation
bypass or owner token is used. The candidate is built without that feature.
The committed updater remains unconfigured, with no signed download/install path
enabled by this task.

Anonymous production GET returned **401**. In the installed WebView, the failed
request surfaced as a network/CORS failure and an honest empty state. Native
download approval also failed closed, wrote an error history entry and created no
archive/path. There is no authentication bypass. Added tests cover 401, 403, 404,
429 and network failure, with no fabricated projects, download buttons or v1 call.

Actual success download/picker/no-clobber/cancel/Explorer flow could not proceed
past production CMS approval. Rust tests exercise streaming/hash mismatch,
destination/no-overwrite, cancellation, URL/approval guards and history handling;
browser tests cover UI/notifications with mocks. These do not establish live ZIP
E2E. A standalone standard native folder dialog opened in the installed release;
the helper could not reliably target its owned modal to confirm a folder. The QA
process was stopped for cleanup. Successful selection and cancellation within
the real download flow remain manual gates. No successful history row or ZIP
was fabricated, and no archive was executed or unpacked.

Existing Bloodborne records/data remain intact without reimport. The current
Stage 13A Hub intentionally disconnects the legacy Library UI. Stage 19A does not
restore it or certify a new launch; accessible legacy-library/launch acceptance
is a product gate if required for this beta.

## Checks and actual Windows GUI

- `npm ci`: pass, zero reported vulnerabilities.
- TypeScript + Vite production build: pass.
- Playwright: **76 current Hub/titlebar/download/Stage 14B–18E regressions pass**;
  **5 new API failure tests pass** in the corrected rerun. Retired installer-era
  entry-point suites were not run. The first five failures asserted an alert
  instead of Home's existing status; only the test assertion was corrected.
- Rust: **85 pass, 8 ignored**; Clippy all targets with warnings denied and fmt pass.
- Actual installed Tauri/WebView2: 24 release screenshots, zero page exceptions,
  no horizontal overflow, all three viewport sizes. Home/carousel, catalog,
  Sonic/Zelda pages/gallery/Escape, Downloads and Settings checked.
- Real seven-second autoplay and all four language selectors pass. Reduced-motion
  About bounds at 800×600 and solid `.no-backdrop` fallback pass.
- The populated native visual matrix replays **previously saved real local CMS
  responses** at the production origin through the test harness. Native IPC and
  embedded frontend are real; this is not live/production catalog acceptance.
  A separate QA banner scenario assigns an existing validated CMS image to the
  optional banner field; no banner was published or packaged.

An early native run was interrupted/its debug connection timed out. The final
rerun restored the minimized window and corrected a QA assertion: banners use
`img.universal-banner` while `data-artwork` remains `wide`. Final evidence is
installed-visual.json/installed-qa.log, not those failed harness attempts.

Measurements on this machine (not a cross-device performance claim):

| Sample                                         | Result                                                                     |
| ---------------------------------------------- | -------------------------------------------------------------------------- |
| Warm launch to native window, one sample       | ~424 ms; not API readiness/cold startup                                    |
| Production empty state, 10 s / seven processes | 474 MiB working set, 337 MiB private; ~0.48% total 12-logical-CPU capacity |
| Populated Home idle, 10 s / seven processes    | 548 MiB working set, 369 MiB private; ~0.44% total CPU (~5.3% one core)    |
| Populated Home rAF, 180 samples                | median 13.3 ms, p95 13.4 ms, zero >50 ms                                   |
| JS main chunk                                  | 592.49 kB / 185.92 kB gzip; existing >500 kB Vite warning remains          |

The active screenshot/navigation-loop CPU sample is saved separately and is not
reported as idle. The short rAF sample does not measure GPU energy or every
transition's paint cost. No evidence justifies a broad performance rating yet.

## Public-beta blockers and manual acceptance

1. Deploy/verify production v2 anonymously, including CORS from installed Tauri,
   trusted media/banners, required detail/build routes and correct availability.
2. With the real approved available small official ZIP, select an isolated folder;
   cancel once, download, independently compare SHA-256/size, retry into the same
   folder and verify no overwrite, cancel a transfer, reveal the exact file in
   Explorer, restart and verify history. Preserve the archive; never auto-run it.
3. Complete third-party license/NOTICE/attribution packaging and CMS image rights
   review. Private Bloodborne materials/worker are not cleared for distribution.
4. Decide Authenticode publisher/signing and secure updater key/channel custody.
   The current local installer is explicitly unsigned; no SmartScreen bypass is
   part of acceptance. Unconfigured updates must remain explicit in Settings.
5. Verify clean Windows 10/11 x64 install with/without WebView2, offline/no-runtime
   behavior, Start-menu/desktop shortcuts and DPI/other-GPU performance. Use a VM
   or separate Windows user; never replace the working owner installation.
6. Confirm the beta's legacy-library scope. Existing registrations are preserved,
   but the current Hub does not expose the retired legacy Library screen.

Manual install: build `-Isolated`, run its Setup in the isolated environment,
select a QA path, launch PORT after stopping development servers, and check
Windows' Installed apps name/icon/version. Change language/reduced motion and a
favorite, close, install QA 0.1.1 over the same QA path, then verify retained data.
Inspect each screen at 800×600, 1280×720 and 1600×900, gallery Back/Escape,
carousel pause/keyboard/reduced motion and no-blur fallback. Uninstall the QA
entry with **Delete app data unchecked**; verify data remains. Do not install or
uninstall the main identity against the owner's working data for this checklist.

Evidence and reproducible local harnesses: `.local/evidence/stage19a/INDEX.md`
and `.local/stage19a/`. Nothing was published; no automatic next stage.
