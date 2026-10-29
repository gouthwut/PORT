# PORT// — instructions for future sessions

Stage 19B completed 2026-10-30: isolated installed Windows download E2E, including
picker/Cyrillic path/Explorer, cancellation, connection drop/retry, bad SHA-256,
partial cleanup and durable history. See docs/PORT_STAGE19B_DOWNLOAD_E2E.md and
.local/evidence/stage19b/INDEX.md. Fictional loopback transport requires the explicit
download-e2e-qa feature and app.port.stage19b-qa; beta builds reject that feature
at compile time, ordinary release binary excludes its code. Project detail now
also ignores dev API override in release. Local commit only; preserve prior dirty
work/user data. No CMS, production API, design, push/release or automatic next stage.
Public beta still has the separately documented Stage 19A distribution gates.

Stage 19A authorized 2026-10-29: local Windows NSIS installer and public-beta
readiness acceptance. Build with scripts/build-windows-beta.ps1: fixed production
v2, reviewed frontend allowlist, no optional local PKG worker, unsigned/unconfigured
updater, standard WebView2 bootstrapper. Candidate is local/undistributed; see
docs/PORT_STAGE19A_WINDOWS_BETA.md and .local/evidence/stage19a/INDEX.md. Actual QA
install/upgrade/uninstall uses PORT Stage19A QA/app.port.stage19a-qa, separate
.local/stage19a data. Production anonymous v2 is still 401; positive ZIP/picker/
Explorer E2E, complete third-party notices, CMS media rights, signing/channel and
clean-machine checks remain gates. User/legacy data and prior dirty work retained.
Local commit only; no publication/push, CMS neighbor changes or automatic next stage.

Stage 18E authorized 2026-10-29: uniform large Home/catalog cards for every media
state. Optional validated v2 detail media.banner has priority over hero/gallery;
dedicated banners use centered cover on cards, Home carousel and project heroes.
Missing/invalid banners retain Stage 18D fallback; portrait covers stay contained
inside the same large card region. See docs/PORT_STAGE18E_BANNERS.md and
.local/evidence/stage18e/INDEX.md. Native QA uses fresh app.port.cms-qa storage
under .local/stage18e/app-data and live local API. No CMS/neighbor/API/Rust/schema
changes, generated production artwork, push/deploy/release or automatic next stage.
Preserve downloader gates, user/legacy data and prior dirty work. Local commit.

Stage 18D authorized 2026-10-29: universal ProjectHero for project pages and real
CMS featured carousel on Home. Shared validated artwork selection prefers optional
future hero/banner, then suitable gallery frame, cover composition, then PORT.
No game-specific layouts; six slides in stable CMS order, seven-second crossfade,
manual controls, preload, focus/hover/visibility pause and reduced motion. See
docs/PORT_STAGE18D_HEROES.md and .local/evidence/stage18d/INDEX.md. Native QA uses
fresh isolated app.port.cms-qa storage under .local/stage18d/app-data and live local
API. Keep downloader gates, Stage 15, schema 4, user/legacy data and previous dirty
work. No CMS/API changes, push/deploy/release or automatic next stage; local commit.

Stage 18C authorized 2026-10-29: real React/Tauri redesign toward the supplied
Home/catalog/project layout reference, preserving Gemini Liquid Glass. Shared
artwork-led cards obtain validated gallery media through existing API v2 detail;
wide frames use conservative resolution/aspect selection, otherwise compact cover
rows. Home hero copy integrated, Sonic full frame at desktop, compact Zelda,
uncropped gallery. See docs/PORT_STAGE18C_REDESIGN.md and
.local/evidence/stage18c/INDEX.md. Browser before/after and live local native QA at
800x600, 1280x720, 1600x900; separate app.port.cms-qa storage under
.local/stage18c/app-data. Preserve downloader gates, Stage 15, schema 4, all user
and legacy data and pre-existing dirty work. No CMS/production changes, push,
deploy, release or automatic Stage 19; local commit only.

Stage 18B authorized 2026-10-29: repair the existing Stage 18 composition while
preserving Gemini Liquid Glass. Sonic uses a suitable validated CMS gallery frame;
projects without wide artwork use a compact cover row. Wider responsive catalog,
compact Home, contrast and reduced-motion dialog positioning repaired. See
docs/PORT_STAGE18B_UI_REPAIR.md and .local/evidence/stage18b/INDEX.md. Native QA uses
fresh app.port.cms-qa storage under .local/stage18b/app-data and live local API v2;
production /v2/projects still returns anonymous 401. Stage 18 screenshot metadata
was synthetic test-only and is now explicitly labelled QA. Keep downloader gates,
Stage 15 functionality, schema 4 and all user/legacy data. Local commit only;
no push/deploy/release or automatic next stage.

Stage 18 authorized 2026-10-29: implement Direction A / Premiere Compact and
Apple-inspired Liquid Glass across desktop launcher React UI. Main styling
implemented in src/hub/stage18-liquid.css with multi-elevation specular highlights,
backdrop saturation boost, surface reflection sweep, floating sidebar, glass search
capsule, wide game cards with inset box art, cinema hero, and unified downloads/settings.
First-screen density verified at 1280x720 (Hero and cards visible without scrolling).
See docs/PORT_STAGE18_LIQUID_GLASS.md and visual evidence in .local/evidence/stage18/.
TypeScript, Playwright suites, and cargo check pass. Keep all native Rust downloaders,
SQLite schema 4, CMS contracts, and user data intact. Local commit only; no push/release.

Stage 17A.1 authorized 2026-10-29: owner selected A / Premiere as the final design
direction. One local Home-only Liquid Glass sample is complete beside Stage 17A:
premiere-liquid.html/css, 1280x720 screenshot and PREMIERE-LIQUID.md tokens.
See docs/PORT_STAGE17A1_LIQUID.md. No main React/Tauri implementation authorized;
stop here until a separate request. Existing nine prototypes and dirty work preserved.

Stage 17A authorized 2026-10-29: project-local design toolchain setup and three
standalone UI concepts (Home/catalog/project), no main React/Tauri changes.
See docs/PORT_STAGE17A_DESIGN.md and .local/design-exploration/17a/REPORT.md.
Nine primary layouts and browser evidence are local/ignored; owner must choose
the final direction. Figma tools exist but whoami requires reauthentication;
no Figma creation/edit access or Starter capability was verified. Project-local
skills installed and read; Playwright MCP actually verified via stdio and existing
Chromium. Preserve all dirty work, CMS/API/native guards/user data. No automatic
implementation/next stage, push, deploy, release or paid services.

Stage 16 authorized 2026-10-29: local visual parity with the original approved
PORT design pack across Home, catalog, project, sidebar, Downloads and Settings.
This supersedes earlier screen-styling restrictions only within that visual scope.
Keep Stage 15 preferences/history/localization, Stage 13F picker/HTTPS/no-clobber
and Stage 14B notification timing. CMS media stays validated; no invented games,
ratings, compatibility or installation. See docs/PORT_STAGE16_VISUAL.md and latest
PROGRESS for before/after evidence and native/live limits. Work only in C:\PORT,
preserve dirty/legacy work and user data. Local commits only; no CMS/API/neighbor
changes, push/release/installer or automatic next stage.

Stage 15 authorized 2026-10-29: local Downloads Center/history, favorites/recent
project IDs, approved-build discovery, conservative archive-version notices and
Russian/English/Spanish/French catalog-path localization. See docs/HUB_STAGE15.md
and latest PROGRESS for actual checks and public beta blockers. Keep one active
native download, Stage 13F picker/HTTPS/no-clobber guards and Stage 14B notification
timing. SQLite hub_downloads/hub_preferences are separate from schema-4 game
registration; clearing history never deletes archives. No partial resume, fake
installation, automatic archive execution/install or background update downloads.
Preserve disconnected legacy engines/data and existing dirty work. Production
API v2 returned anonymous HTTP 401 in final QA; do not bypass authentication or
edit CMS neighbors. Local commits only; no push/release/installer/next stage.

Stage 14B authorized 2026-10-29: project-only storefront redesign and download
notification polish. See docs/HUB_PROJECT_REDESIGN.md and latest PROGRESS. Keep
Home/catalog/titlebar and Stage 13F native guards. Success notification hides
after seven unpaused seconds; hover/focus/folder action pause it, errors persist
until dismissed. Canonical file path remains in Rust; hiding never removes it
or the file. CMS-only validated images, no fake binary action for source archives;
optional structured fields only. Local commit only, no release/push/next stage.

Stage 13F authorized 2026-10-29: native destination picker for each interactive
release download, original safe filename, no-clobber/conflict choice, actual Rust
file path in UI and exact Explorer reveal. See docs/HUB_DOWNLOAD_DESTINATION.md
and latest PROGRESS for checks and remaining manual dialog acceptance. QA skips
the picker only with explicit -NoDownloadDialog and the existing dedicated debug
identity/feature; normal PORT must always ask. Preserve CMS/catalog/hero/titlebar,
legacy backend and existing files. Local commit only; no release/push/next stage.

Stage 13E authorized 2026-10-29: isolated local CMS HTTPS QA only within C:\PORT.
See docs/HUB_LOCAL_CMS_QA.md and latest PROGRESS. Dedicated debug app.port.cms-qa,
optional local-cms-qa feature and per-client local certificate trust; production
config/TLS/CSP remain unchanged. Availability unknown still blocks download even
with approved review. No CMS neighbor changes, security bypass, ZIP execution,
production release/push or automatic next stage. Live positive ZIP E2E is blocked.

Stage 13C authorized 2026-10-29: local custom 40px Tauri title bar and scoped
window controls/drag-region. Preserve Home/catalog/project/hero, Stage 13B
downloads, EXE/installer icons, legacy engines and user data. See
docs/HUB_TITLEBAR.md for isolated QA preview, native evidence and Windows
Snap/DPI/manual verification limits. No custom CSS Snap imitation, CMS/neighbor
access, production release/push or automatic next stage. This supersedes prior
window-styling restrictions only within this title-bar scope.

Stage 13B authorized 2026-10-29: one active native download of an approved,
available Windows GitHub Release asset from CMS v2. Rust re-fetches builds from
the fixed public CMS endpoint by project/build IDs; no frontend-supplied URL.
Preserve Home/catalog/hero/window styling and all legacy installers/data. See
docs/HUB_DOWNLOADS.md and latest PROGRESS for validation and live API limits.
No automatic execution/install/extraction, queue, pause/resume, persistent jobs,
production release/push or next stage. No CMS/content neighbor access or changes.
This supersedes Stage 13A's read-only asset/download-manager restriction only
within this scope.

Stage 13A authorized 2026-10-29: client UI now uses CMS API v2 for Home,
catalog and project detail, with no v1 fallback. Product name is PORT. Preserve
approved Home/catalog/hero/window styling. Main navigation contains Home and
Catalog; Settings/About remain. Legacy library/download/PKG/folder/ISO/recipe
installation screens and v1 endpoint controls are disconnected from App, not
removed from their component/service/backend files. Compatibility-runtime
projects are excluded from the new catalog. Keep all native installer code,
SQLite migrations/registrations, profiles, game files and existing dirty work.
Official project/release links are read-only; no download manager yet. Work only
in C:\PORT; do not access CMS/content neighbors, change CMS contracts, publish,
push, build a production installer or begin the next stage. Use economical
frontend build/targeted tests; legacy UI suites describe retired entry points.
See latest PROGRESS and docs/HUB_API_V2_CLIENT.md.

Stage 11.1-C Lite authorized 2026-10-28: local basic project page from catalog,
using existing components and validated v1 presentation adapter. Cover, title,
description, source platforms, port technology and existing official project
link; return preserves in-app catalog query/filter/sort/page state. Missing
fields remain explicit. Public v2 summary stays inactive and does not invent
detail data. This supersedes the earlier project-page prohibition only for
this basic scope. No CMS/SQLite/installations changes, push/deploy or subsequent
stage. Owner requests targeted tests and one TypeScript check only; no native
release build, screenshots, Computer Use, Imagegen or subagents for this task.

Stage 11.1-B Premium Catalog authorized 2026-10-28: local catalog screen,
reusable ProjectCard and typed public-data presentation layer in the approved
Home visual system. This supersedes the Home-only restriction for this catalog
scope. Keep v1 validation/cache/installer contracts; v2 is not deployed or
auto-selected. Neighbor C:\PORT-CMS and C:\PORT-HUB-CONTENT are read-only;
research content is not a production catalog. No project-page redesign, deploy,
push, publication, migration or writes to existing installations/SQLite.
Native QA uses an isolated app.port.catalog-qa identity. See
docs/HUB_CATALOG_REVIEW.md and latest PROGRESS.

Stage 11.1 Visual Rebuild authorized by the attached 2026-10-28 request: local
React/Tauri Home and shared shell/sidebar only, using the supplied design pack
and original generated hero art. This supersedes the 11.0 implementation ban
only for this visual scope; the numbered migration/API/storage stages in the
blueprint remain proposed. Preserve existing catalog/detail/library/installer
contracts, schema-4 port.db, installations, profiles, backups and dirty work.
No CMS changes, production deploy/publication, accounts/reviews/workshop or other
screen redesign. See docs/HUB_HOME_REVIEW.md and latest PROGRESS.

Stage 11.0 authorized 2026-10-28: Hub product migration planning and architecture ONLY.
Read docs/HUB_BLUEPRINT.md, docs/HUB_COMPATIBILITY.md and docs/HUB_REDESIGN_BRIEF.md
plus latest PROGRESS. Target: games/projects/releases catalog + community, shared
web/Windows API, official project downloads; legacy installer becomes secondary.
This supersedes older Stage 11 prohibitions only for research/documentation.
Stage 11.1–11.6 remain proposed, not authorized implementation. No new functionality,
design system/UI implementation, production deploy/publication or data migration.
Preserve dirty work, installations, schema-4 port.db, profiles, backups and all
legacy engines. New Hub storage must not replace existing registration authority.

Stage 10.4 authorized 2026-10-28: local one-game CMS auto setup, official runtime inspection with explicit consent, local ISO/TU metadata inspection and separately consented isolated upstream trial. Reuse recipe engine/schema 1/2; no game-specific conditions or production deployment/publication. `recipe_owner.rs` is an explicit local CLI before Tauri/SQLite startup, never an installation/compatibility certificate. Preserve all trial folders, profiles, dirty work and existing installations. Legacy STFS metadataVersion 0 is supported with descriptor/table bounds; header checks do not authenticate payloads. Read docs/RECIPES.md and latest PROGRESS. This supersedes older prohibitions on local source inspection/consented owner trials only within this scope.

Stage 10.3 authorized 2026-10-28: local Smart Recipe Builder in PORT-CMS, keeping schema 1/2 and native Stage 10.2 safety contracts. Local ZIP/result inspection computes real hashes; owner trial evidence never certifies compatibility automatically. Native runtime/result verification is unchanged. Preserve existing drafts/dirty work/backups; no Sonic-specific adapter or draft mutation, player ISO/TU launch/upload, production deploy/publication, visibility change or Stage 11. Read docs/RECIPES.md and latest PROGRESS.

Stage 10.2 authorized by the 2026-10-28 attached request: extend universal recipes locally in PORT and PORT-CMS. Read docs/RECIPES.md and latest PROGRESS. Schema 1 remains supported; schema 2 adds supplemental inputs and consented verified upstream setup with hashed result gates. Preserve entire started setup staging on failure/recovery. No game-specific adapters, Sonic draft/card mutation or installation, Cloudflare deploy, publication, visibility change or Stage 11. This supersedes historical Stage 09 prohibitions only within that scope.

Stage 08: official Tauri updater 2.14.1 + NSIS and version-bound signatures. Read docs/UPDATER.md and latest PROGRESS before changes. Production updater-channel.json is deliberately unconfigured; no production keys or public binary channel exist yet. Never create production keys without owner-approved secure storage, publish releases, change repository visibility, or use CMS/PATs for delivery. Build-time isolated-test channels/custom QA CA are rejected for app.port.launcher. Preserve shared installer/download guards and schema 4. Real isolated Windows 0.8.0→0.8.1 NSIS handoff/restart passed; this does not promise binary rollback or detection of externally started unregistered games.

Stage 09 explicitly authorized 2026-10-28: GitHub project metadata analysis in PRIVATE C:\PORT-CMS only, with owner-reviewed selective apply and private draft save; no automatic publication or runtime integration. Client algorithms/schema/installations remain untouched. Reports distinguish API data, upstream claims and inferred candidates, never certify a Windows asset or auto-assign adapters. See CMS README/PROGRESS. No new adapters/importers (Stage 10) or user submissions/Community Hub (Stage 11) are authorized.

Stage 05C: production CMS and automatic client integration verified on 2026-10-27. Stable anonymous API: https://port-catalog-cms.port-catalog-cms.workers.dev/v1/catalog.json. Owner reports successful GitHub OAuth/publication; real Rust HTTPS and native release independently verify published Bloodborne and six hashed WebP assets. CMS is separate PRIVATE C:\PORT-CMS, Workers Free + SQLite Durable Object; read its README/PROGRESS. Default endpoint is shared in src/catalog-endpoint.json; absent/empty native config resolves to it without rewriting existing configuration. Preserve custom config, offline cache, installation schema 4 and Bloodborne 01.09. Manual endpoint changes/raw errors are developer-build only. Live update/unpublish was not performed on the owner's card: read latest PROGRESS for isolated-test boundaries. No paid products/R2/temporary account, OAuth requirement for players or automatic new installer adapters.

Read AGENTS.md and PROGRESS.md first in every session.

Stage 06 adds only a compiled Skate 3 adapter; CMS/admin/Cloudflare/publication must remain untouched. Owner alone publishes exact id/collectionId/adapterId skate3, implementation recompilation, sourceConsole Xbox 360. See docs/SKATE3.md: pinned v2.0.2 Windows binary requires TU3 despite the ISO-first README. The owner personally accepted the official TU download and reports working gameplay. Future installs open the official user-driven wizard in staging and wait for game exit, then verify both pinned xexp payloads before registration. Never automate download consent or acquire commercial game/update payloads through tools. Preserve setup-created profiles on cancellation/recovery. Hold the original executable without write/delete sharing while running to prevent upstream's icon self-patch from changing immutable hashes/process paths. License is undeclared in upstream tag; do not invent redistribution permission. Actual one-time Skate prototype reconciliation and final checks are in PROGRESS; Bloodborne is protected.

PORT is a Windows launcher for independently developed console game runtimes. Describe bbport/shadPS4-derived execution and Vulkan translation accurately; do not imply an official native PC release. Stage 03 is authorized by the 2026-10-27 requests, including actual prepared-folder/compatible base-PKG installation, runtime/library/launch. Both supplied PKGs passed bounded fake-PKG mechanism/tree diagnostics; their encryption bit was not a conclusive blocker. Original bounded PFS/PFSC readers plus the existing writer are integrated through an optional pinned-source worker; see tools/pkg-worker/README.md. No arbitrary encrypted/retail PS4 PKG support or update application is promised. Inspect docs/UPSTREAM.md and actual native results in PROGRESS.md before continuing or claiming gameplay.

Stage 04B authorizes only the confirmed cumulative CUSA03173 01.09 update contract in tools/pkg-worker/README.md. The user's continuation explicitly replaces the earlier separate-copy design: updates run IN PLACE, keep the installation ID/paths and one library card, reserve only replaced files for undo, and commit 01.09 only after verification. Schema 4 update_jobs journals rollback/recovery and blocks launch/removal while unresolved. During one-time consolidation preserve the working separate 1.09 profile/progress, retain the old profile as a backup, and retire only the duplicate's inventoried game payload after commit. Never discard saves or settings. No general delta/deletion support is promised. Initial base+update remains two steps. Read actual results in PROGRESS.md.

Stage 04C adds published metadata only: docs/CATALOG.md and docs/catalog.schema.json define the future CMS API. Catalog config/cache/retained installed metadata use separate SQLite tables, without changing installation schema 4. No remote commands, scripts, runtime downloads or launch arguments; only compiled adapter identities enable installation. Unpublication never mutates installations/profiles. Stage 04C fixture remains explicitly opt-in local development/test data; Stage 05C production uses the real CMS. Preserve the actual Bloodborne 1.09 record/files/runtime/profile. Inspect Stage 04C native restart evidence in PROGRESS.md before claiming persistence or changing recovery behavior.

Stack: Tauri 2, Rust, SQLite (rusqlite), React, TypeScript, Tailwind 4, Radix/shadcn-style components, Motion, Playwright. Frontend is in src/, native backend in src-tauri/, service contracts in src/domain.ts. One collection may own multiple display titles and one shared runtime. Do not invent launch arguments.

Quality: accessible keyboard navigation, explicit unavailable states, no fake downloads/installations, responsive layouts, bundle only original or redistribution-authorized artwork in public builds. The continuation request authorizes private local artwork packaging (docs/LOCAL_ART.md); ignored src/assets/bloodborne-local/ is embedded in personal builds, never committed or hotlinked. Screenshots containing it stay in ignored .local/evidence/. Native settings use SQLite in the Tauri app-data directory; browser preview uses clearly identified localStorage. Keep persistence implementations consistent.

PORT is a general launcher/installer for multiple independently developed console-game Windows projects. Keep game/author/runtime specifics within the relevant game card/details or actual operation, never in shared Settings/About/navigation branding. Prefer functional labels over slogans and repeated explanations. Catalog/game artwork is read-only to users: no upload/customization editor or frontend media-write path. Preserve existing media records and bundled/private inputs without deleting them. The user made gouthwut/PORT PRIVATE on 2026-10-27 until a stable release; do not make it public without a new explicit request.

Checks: npm ci; npm run build; npm test; cargo fmt --manifest-path src-tauri/Cargo.toml -- --check; cargo test --manifest-path src-tauri/Cargo.toml; npm run tauri build -- --no-bundle. Launch the actual native exe after backend changes. Tests run in Chromium; they are not proof of native behavior. Save screenshots and distinguish browser/native evidence.

Stage 04D retains the installer/PKG/update algorithms and schema 4. Destination preflight returns an exact stable-ID child path; the native installer rechecks system/overlap/no-overwrite/space boundaries. Optional shortcuts are created only after commit, target PORT with a strict ID, and use separate app-data path/hash receipts; failures never invalidate an installed game. The official single-instance plugin forwards warm launches; cold/warm requests reuse library/launch guards. Installed-card context menus reuse shared actions; Explorer accepts only a locally resolved installation ID. Keep the real Bloodborne 1.09 untouched; new native actions use isolated labelled fixtures. See actual evidence/limits in PROGRESS.md. Stage 05C supersedes the earlier endpoint gate; see the current production integration above.

Use small meaningful Git commits. Do not commit game data, packages, secrets, build outputs or downloaded upstream code. Ask the user about repository visibility before creating a GitHub repository. Do not assume connector authentication authenticates git/gh.

Update PROGRESS.md after significant tasks; it records checks, limitations and the next step. ROADMAP.md defines stage gates. docs/ARCHITECTURE.md and docs/DESIGN.md explain contracts and design. docs/UPSTREAM.md is dated upstream research; reverify before integration. Future extraction must remain local with traversal/symlink/bomb checks and verified download origins/checksums.
