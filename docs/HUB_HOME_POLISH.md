# PORT// HUB — Stage 11.1-A2 polish

Date: 2026-10-28. Owner-authorized local Home and shared-shell polish in `C:\PORT`.
Implementation commit: **cf65f56** (local only).
The approved original castle/swordsman artwork, orange atmosphere, large heading,
yellow CTA and three real CMS covers remain. No new generation or dependency.

## Changes

The existing `home.css` owns the implementation. No additional CSS overlay was
connected. Removed unused hero-slogan rules and the old conditional card-grid
override; extended the existing responsive rules instead.

Full review: React/TypeScript and existing plain CSS, Home/sidebar/search only.
Existing catalog, details, library, installer and native service contracts remain
outside the redesign scope.

| Category    | Evidence inspected                                                     | Result                                                                                            |
| ----------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Typography  | Hero, project titles, metadata, shelves at 1440/1024/800/480           | Larger card titles, readable technology labels, no title ellipsis; mobile uses one column         |
| Surfaces    | Sidebar, search, controls, card edges and shelf containers             | Directional reflections, translucent fills, layered shadows and concentric corners                |
| Animations  | Hero at 10% speed, hover/focus, CTA press, OS reduced motion           | One 550 ms entrance, 3 px card lift, 0.96 CTA press, no running idle animation                    |
| Icons       | Installed Lucide imports, Better Icons search, icon rail               | Consistent 1.7 stroke, persistent card arrow, rail tooltips and accessible names                  |
| Performance | CSS inspection, actual WebView, build output, resized browser captures | Blur limited to search/sidebar; none on repeated cards, shelves or platform chips; no new library |

| Severity | Location                                                | Before                                                                          | After                                                                                                        | Why                                                                     |
| -------- | ------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| MEDIUM   | `src/hub/home.css` project grid/captions                | Three cards capped at 860 px; small 14 px titles and 8–9 px metadata            | Full-width three-column grid; 18–23 px titles; 11 px technology metadata; single-column mobile               | Reading hierarchy and full names                                        |
| MEDIUM   | `src/hub/HubLanding.tsx` project captions               | Technology on the image; OS string in a cramped footer                          | Build availability on the image, technology in the footer; full Xbox name                                    | Separates metadata without implying installed or verified compatibility |
| MEDIUM   | `src/hub/home.css` platform nav                         | Wrapped rows; per-button blur produced a resize capture artifact in iteration 2 | Horizontal overflow with visible selection/counts; reflective fills without chip blur; inset-safe focus ring | Stable rendering and keyboard access                                    |
| LOW      | `src/hub/home.css` hero                                 | Taller composition pushed card names below the first desktop viewport           | Smaller vertical gaps, 55 px maximum heading, stronger text-side shade; removed decorative live slogan       | Retains cinematic art while bringing project names into view            |
| LOW      | `src/hub/home.css`, `src/hub/HubSidebar.tsx` shell      | Flatter surfaces and small icon-rail targets without tooltips                   | Highlighted active surface, lit edge, 12 px sidebar/search blur, rail tooltips                               | Material depth and discoverable controls                                |
| LOW      | `src/hub/HubLanding.tsx`, `src/hub/home.css` lower Home | Ended after the editorial grid                                                  | Two compact data-driven shelves and a full-catalog entry, with distinct violet/warm surfaces                 | Useful discovery without repeating large card grids                     |
| LOW      | `src/hub/home.css` interaction states                   | Hidden card arrow, quieter border response                                      | Persistent arrow, keyboard/hover edge response, specific transitions and one-shot hero entrance              | Static affordances remain visible without motion                        |
| LOW      | `src/hub/HubLanding.tsx` copy                           | Decorative slogan/footer copy                                                   | Functional descriptions and source-copy requirement reminder                                                 | Short, concrete product copy                                            |

## Real data and boundaries

“Выбор редакции” retains the existing explicit CMS catalog order, capped at six
records. Platform controls derive solely from the published records and filter all
Home sections. Counts represent projects in the received catalog.

“Сборки для Windows” uses `windowsBuild === "available"`, capped at three links.
The v1 API provides no release list/version/date; this is deliberately described as
catalog build availability. It does not promise installation or certify a build.
“Экспериментальные проекты” uses `compatibility.status === "experimental"`, capped
at three links. It does not invent a development lifecycle. Each shelf explains
its meaning and has a filtered-empty state. All links reuse the existing project
navigation. The existing activity slot and loading/error/cache/retry states remain.

No invented projects, popularity, dates, ratings or reviews. No CMS/backend/API,
SQLite schema, game payload or profile edits. Other repositories were not modified.
No deploy, push, publication or visibility change.

## Visual iterations and evidence

Reference ZIP and its extracted approved Home were inspected locally. Original
hero asset SHA-256 remains
`80aad049db204fb264b4d61b9d2c47c4bfcebf467213dea1b9ca7f3b61d6ae76`.

Local ignored folder: `design/reviews/stage-11.1-polish/`.
Captures contain the existing restricted catalog artwork and are not committed.

- `before-native-window.jpg`: current pre-change executable through Computer Use.
- `home-{1440,1024,800,480}.png`: copied previous Stage 11.1 baseline captures.
- `iteration1-*.png`, `iteration1-sections-*.png`: first material/card/section pass.
- `iteration2-*.png`, `iteration2-sections-*.png`: tighter hero and wider card ratio;
  review caught the per-chip blur artifact before the final captures.
- `after-{1440,1024,800,480}.png`, `after-sections-*.png`: final real-CMS browser views.
- `after-projects-1440.png`, `after-hover.png`, `after-focus.png`,
  `after-cta-focus.png`, `after-platform-xbox.png`: cards and interaction states.
- `motion-10-percent.png`: actual production hero animation slowed to 10%.
- `native-viewport-{1440,1024,800,480}.png`, `native-sections-*.png`:
  built release WebView with CDP viewport emulation, actual Rust catalog IPC.
- `native-final-home.png`, `after-native-window.jpg`: final WebView and actual
  Windows frame at its ordinary size.

The four responsive native captures use viewport emulation, not four resized
Windows frames. The production native minimum remains 800 px; 480 px checks the
responsive content in browser/WebView emulation. A Windows border-drag attempt did
not establish a new window size and is not evidence of physical resizing.

## Verification

- `npm ci`: pass, zero reported vulnerabilities.
- TypeScript/Vite production build and changed-file Prettier: pass.
- `npm test`: final **46/46 pass**, including preserved legacy regression tests.
  New fixture coverage verifies positive/negative shelf membership, platform
  selection, missing art, a long title at 480 px and keyboard project navigation.
  Initial new fixture used invalid empty compatibility notes; corrected the
  fixture. Keyboard focus assertion now enters keyboard modality before focusing.
- Rust fmt and `cargo test`: **74 pass / 8 explicitly ignored**. No Rust changes.
- Final Windows `npm run tauri build -- --no-bundle`: pass. EXE SHA-256
  `e1c5e65ad893f9420c7797cb36065fc618beaafa17517732ff884bc0812bdafd`.
- Native release actually launched. Actual IPC read two installed registrations,
  three CMS projects and no active operation. Xbox filtering and shelf membership,
  keyboard project entry, enabled Bloodborne Play control and both library cards
  passed. No game or installation operation was started. Zero observed page errors.
- Release restarted normally without temporary WebView debugging and left running.
- Browser and native content scrollWidth equals clientWidth at all four widths.
  Real images loaded; placeholders also pass the synthetic missing-art scenario.
- Motion observation: `port-arrive` has one iteration/550 ms; after slowing and
  waiting it is finished. OS reduced motion returns animation `none`. CTA keyboard
  focus is a 2 px outline; settled press scale is 0.96. Cards have no backdrop filter.
- Consistent SQLite backup and read-only integrity check precede native launch.
  All protected table values remain exact; only normal `catalog_cache` refreshed.
  All four pre-existing tracked dirty diffs remain byte-identical, SHA-256
  `6c5afb85f771e9ea31997dd7a4c8c111b64a7740ff0979b03ba0dfbc7a868cfb`.

Skills applied: Make Interfaces Feel Better, Better Icons (installed Lucide plus
CLI search), Ponytail, No AI Slop, Stop Slop, Computer Use. No external design
service, image generation, new dependency or subagent was needed.

Considered and rejected: replacing the approved hero (no art defect), blur on each
card/shelf (unnecessary composition cost), another repeated cover grid (only three
real records), and “recent releases” copy (v1 has no dates/releases).

Verdict: no remaining actionable findings in the inspected Home scope; owner
visual acceptance remains. Not verified: full screen-reader audit, calibrated GPU
benchmark, physical 480 px native window, gameplay or full payload/profile rehash.
The existing approximately 597 kB JavaScript chunk warning remains. No public
release or installer bundle was produced.
