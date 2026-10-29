# Stage 15 — client upgrade and beta readiness

Local work authorized on 2026-10-29, from Stage 14B `a9723a8`.
Only C:\PORT changed. No CMS/content repository edits, contract changes, push,
publication, installer build, game execution or archive extraction.

## Delivered

| Area               | Actual behavior                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Downloads          | Navigation entry, active/completed/cancelled/failed/interrupted rows, real byte counts, average speed and approximate ETA when measurable; integrity-verification phase.                                                                                                                                                                                                                                                                |
| History            | Separate native SQLite `hub_downloads` table. Start/validated metadata/terminal state are journaled; restart marks unfinished operations interrupted. Remove deletes only the row. Native reveal resolves the saved canonical path by record ID and checks the file exists.                                                                                                                                                             |
| Download safety    | One active transfer; native CMS revalidation, original safe filename, interactive folder picker, pinned public HTTPS/redirect policy, size/digest gates, owned temporary file and no-clobber finalization retained. Completed existing files reject an accidental repeat; an explicit history retry starts from zero and asks for a destination again.                                                                                  |
| Closing            | Normal close is prevented while a transfer or picker is active, with a localized explanation. Finish/cancel first. Forced exit may retain an owned `.part`, never a completed-history claim; there is no resume control. Launcher-update handoff also reserves the Hub downloader.                                                                                                                                                      |
| Favorites / recent | Separate native SQLite `hub_preferences` table; browser preview uses labelled localStorage. Stable IDs, unique favorites, twelve recent IDs; refreshed catalog resolves current names/media. Unpublished IDs stay saved and do not render broken cards.                                                                                                                                                                                 |
| Discovery          | Original-game/project search, source console, technology, lifecycle, real Windows availability, name sorting, combined filters/reset and favorites reuse the existing catalog. At most four concurrent approved-build queries; targetPlatforms never proves a downloadable file. Missing build evidence stays unknown.                                                                                                                  |
| Releases           | Existing version selector preserves unavailable/prerelease labels and download guards. Numeric stable versions are ordered conservatively. A project-page update notice requires a newer available approved Windows archive of the same known architecture than every matching successful download. Unknown tags, dates, prereleases, unknown architectures and equal/newer downloaded versions produce no notice.                      |
| Languages / UX     | Russian, English, Spanish and French for navigation, Home, catalog, project, favorites, downloads, settings, gallery and window labels. Language uses existing settings; older settings default to Russian. CMS prose, project/release names and files stay unchanged. Back/Escape preserve origin and filters. Missing art, wrapping, visible focus, empty/error/offline states and separate notification positions retained/polished. |

Native data uses the existing app-data location; installation schema remains **4**.
New tables do not replace installation registration. Reset settings does not clear
favorites, history, archives, games or saves. Stage 14B success notice still hides
after seven unpaused seconds; hover/focus/folder action pause it and errors remain
until dismissed. The notification links to Downloads and is suppressed while that
screen is already open; dismissal never clears native state. History-write
failures stay visible until dismissed; a completed file keeps its native reveal
action even if its history write failed. The native updater reservation leaves
window-status reads available during handoff; its release/error path is tested.

## Verification

PASS: npm ci (0 reported vulnerabilities), TypeScript/frontend build (existing
bundle-size warning above 500 kB), **42 Playwright tests**, **85 Rust tests / 8
opt-in ignored**, Clippy all targets with warnings denied, Rust fmt and changed-file
formatting/whitespace. Checks ran in the preserved working tree, including the
pre-existing unrelated dirty work; this is not a clean public-checkout build.
The relevant suites are `hub-api-v2`, `hub-downloads`, `stage14b-project`,
`stage15`, `stage15-downloads`, `titlebar` and launcher updater checks. Historical
v1/installer UI entry points remain disconnected by Stage 13A and are not the
current UI acceptance suite. Rust's full regression suite includes the retained
Bloodborne/PKG/update/recipe/library/shortcut guards; the owner's actual game,
installation database, runtime and saves were not operated on.

Windows debug QA uses exact identity **app.port.cms-qa**, its existing feature and
a fresh `.local/stage15/app-data` directory. The local configuration points to
the already running read-only local CMS API. It does not read or modify neighbor
repository files. No production TLS, CSP or authentication policy changes.

Actual official Zelda ZIP:

- `Zelda64Recompiled-v1.2.2-Windows.zip`, **28,940,501 bytes**.
- SHA-256 `d02b95f1cf5e4d44d6587fa6136c6db521f61aa41ba8700c05f91bea8b0a26d0`.
- Live cancel left the new operation folder without a partial or final file;
  retry downloaded from zero and independent hashing matched CMS.
- Native duplicate rejection and history-ID reveal passed. Windows Explorer
  independently showed the exact directory, filename and one selected item.
- Cold restart retained history, favorites, recents and French. Removing the
  completed history row left archive bytes/hash intact.
- Normal close was prevented during the real folder picker, with zero payload
  bytes. Forced QA termination recovered its journal as interrupted on restart.
- Current local-CMS Sonic page decoded its real cover and four screenshots and
  offered available Windows **v1.0.3**. Zelda/Sonic deterministic browser fixtures
  separately test gallery, trust gates, responsive layouts and focus/Escape.

Transfers explicitly used the existing **QA-only no-dialog switch**. A separate
run without the switch displayed the actual system picker with the French PORT
title and QA default directory. Computer Use could read PORT/picker/Explorer
accessibility, but PORT input activation failed twice with
`failed to activate captured window`. Interactive select/cancel/conflict and a
manually selected Unicode/spaced destination are therefore **not accepted** by
these automated checks. Native WebView screenshots are actual debug-app evidence,
not browser mocks; browser fixture shots are labelled separately. Actual native
800x600 French project CTA and no-overflow checks also pass (`native-800.json`).

Reproduction: launch the isolated debug QA configuration following
[the local QA contract](HUB_LOCAL_CMS_QA.md), with dev URL 1422 and optional CDP 9238. `scripts/native-stage15.mjs` requires that identity and an explicit QA
no-dialog launch; its `restart` mode checks durable state after a real cold start.
It never executes the downloaded ZIP. Do not run it against normal PORT data.

## Evidence (ignored, local only)

Directory: **C:\PORT\.local\evidence\15**.

- `native-zelda.png`, `native-sonic-current.png`, `native-sonic-800.png`, `native-downloads.png`.
- `native-settings-fr.png`, `native-history-after-restart.png`.
- `native-interrupted-after-restart.png`, `native-picker-accessibility.txt`.
- `native-transfer.json`, `native-restart.json`, `native-forced-restart.json`,
  `native-close-guard.json`, `explorer-selected-file.txt`.
- `browser-downloads.png`, `browser-catalog-{ru,en,es,fr}-320.png`.
- Stage 14B browser gallery/responsive fixtures remain under `.local/evidence/14b`.

Layout review: no remaining actionable findings in the inspected 320–1440 px
four-language browser views and the actual 800x600 native view. Inspected layout:
Approve. 200% zoom and RTL mirror: Not verified; actual OS DPI/Snap remain manual.

## Intentional limits and remaining beta gates

No queue, partial resume, automatic install/extract/execute, background archive
updates or compatibility certification. Updates mean another official archive;
they do not touch Bloodborne PKG patches or installed game files. Game-update
notices are on the project page. Catalog data survives an in-session refresh
failure; a cold offline start shows explicit unavailable/retry state, while local
history and saved IDs remain readable. No fabricated offline catalog is supplied.

Disconnected legacy screens (InstalledLibrary, Installer, FolderImport,
RecipeInstall, old OnlineCatalog/ProjectOverview) and their native diagnostic
texts were not comprehensively localized. This does not expose a second active
catalog or alter the legacy engines. OS-owned picker controls follow Windows'
language; PORT supplies its own localized dialog titles/messages.

Public beta is **not release-ready** until:

1. The owner makes intended public API v2 routes anonymously available. A direct
   production GET `/v2/projects?limit=1` on 2026-10-29 returned **HTTP 401** with
   `{"error":"Требуется вход"}`. Local QA success does not prove production access.
2. The Stage 13F manual destination-picker acceptance above is completed on
   Windows, including conflict preservation and Unicode/spaced paths. Windows
   Snap and actual OS DPI acceptance from Stage 13C also remain manual.
3. A separately authorized public packaging/release pass resolves distributable
   artwork/notices, reviews the existing unrelated dirty work, selects a release
   version and verifies the clean public artifact. No installer was produced here.
   If automatic PORT updates are part of beta, their production channel/key
   custody/feed must also be configured; they intentionally remain unconfigured.

No claim of a fresh Bloodborne gameplay test, fully translated legacy UI, native
interactive picker acceptance, production installer validation or public rollout.

## Local implementation commits

- 15A: `7a601f7f77f559bc858f78f7feec9ec54d5c53cc`.
- 15B: `9dd867a6e3a8bd395e4877229b04f7002bb6f6ad`.
- 15C: `c8bf95e58d1c48154a51d2f404c12dc01c285618`.
- 15D: `fb92db1826ac30198dfe76696cb261f954dc6ad8`.
- 15E: the final `test(hub): complete Stage 15 regression and beta readiness report`
  commit containing this report; exact hash is in the delivered final answer / git log.
