# PORT visual design

## Stage 04E continuation — concise, game-neutral shell

PORT's shared interface describes the launcher/installer, not one game. Sidebar game promotion, repeated breadcrumbs/platform badges, marketing eyebrows, decorative carousel labels, footer slogans, home promotional panels and the Settings game-author panel are removed. Home uses its page name; Settings keeps only its functional groups. About describes PORT once, with font licenses retained in a disclosure. Game-specific attribution and compatibility remain on the relevant game page and operation/source details. The catalog still honestly identifies local test data and unavailable actions.

Artwork is read-only in the user interface. The image editor, upload controls, frontend save handler and image-import helper are removed. Previously saved artwork is still read without migration/deletion; bundled private inputs and catalog images work as before. Gallery navigation, keyboard focus and offline viewing remain. The prior image-import test is replaced by a retained-media fixture test proving absence of edit controls, unchanged storage and working read-only gallery behavior. Existing Figma direction frames are historical composition guidance; current React is authoritative for this copy reduction.

## Stage 04E — Dark Violet Liquid Glass

[Editable Figma direction](https://www.figma.com/design/UcQWJ0RjgsgaW9O5YgJjbC?node-id=4-2): a separate 04E page preserves the original foundation. It contains semantic color/spacing/radius variables with CSS syntax, five shared text styles, a glass effect style, seven reusable visual primitives and seven editable screen/state compositions. These are schematic direction frames with explicitly labelled art slots, not pixel-perfect application screenshots. No private game art was uploaded. Local concepts in ignored `.local/design_refs/PORT-Visual-References/` were inspected for material, depth and composition only; none became application assets.

The existing navigation and layout remain in `styles.css`; `theme.css` is the shared visual layer. Canvas #0B0911, secondary #120E1D, panel #221A33, accent #8F55F5, focus #A782FF, near-white text #F4F0FA and lavender secondary #AEA5BE are local CSS tokens. Primary gradients use slightly darker violet stops so white button labels retain at least 4.79:1 contrast at the lightest stop. Translucent fills, fine borders, static edge reflections, inset highlights and soft shadows establish depth. Backdrop blur is bounded to the sidebar and transient dialog/menu/toast surfaces; cover grids, settings rows and long lists have no blur. No continuous ambient animation or new effects setting was added.

Manrope variable is used for display/game names/headings; Inter variable for the interface. Both are bundled offline, include Cyrillic and Latin, and retain their OFL 1.1 notices. Exact source URLs and SHA-256 hashes are in `src/assets/fonts/README.md`. The About dialog embeds the full notices in the executable. No runtime font fetching or unknown font distributor is used.

Home and catalog emphasize art, Library gives each real installation a direct Play action using the existing shared guards, and selected-game management remains available. Detail pages bring the gallery forward and fold extended gameplay/runtime explanations into disclosures; requirements and actual compatibility limits remain accessible. The installer uses one continuous numbered PKG → folder → optional shortcut → confirmation/progress form, with unchanged Stage 04D handlers. Progress always comes from the existing operation data. Windows component paths, download mechanics and raw catalog errors live in disclosures. The default catalog is still visibly labelled **local test data**; endpoint configuration is under “Для разработчиков · онлайн-каталог”, after player settings. No CMS exists or is implied.

The native minimum remains 800×600. Short windows reduce sidebar spacing so Settings and the local profile remain reachable; narrow preview layouts retain explicit accessible navigation names. Keyboard focus, Radix modal/menu semantics, system light theme, saved compact layout and reduced motion remain supported. Reduced motion also covers body-level portals. No changes to Rust, schema 4, installation/profile data, runtime, PKG/update algorithms, paths or shortcut handling.

Private before/after screenshots and QA are in ignored `.local/evidence/04e/`; browser/mocked and native evidence are labelled separately. See PROGRESS.md for actual checks and remaining limits; screenshots alone are not installation/gameplay evidence.

## Historical Stage 01 foundation

The following sections record the earlier design and implementation stages. Stage 04E above supersedes their palette, font and presentation choices.

[Original Figma foundation](https://www.figma.com/design/UcQWJ0RjgsgaW9O5YgJjbC?node-id=1-2) used Inter as a concept font and shipped Segoe UI Variable/Segoe UI.

Palette: canvas #101116, surfaces #191A21, cards #20212A, text #F5F5F7, secondary #A0A0AA, accent #A78BFA. Restrained lavender focus and actions. UI theme follows Windows only when selected. Branding, curved 12–16px surfaces and editorial typography establish PORT's identity without copying another launcher.

Desktop: fixed 242px navigation, 83px toolbar, 42px content gutter; hero establishes hierarchy, a responsive catalog grid and quiet supporting panels. At 800px the sidebar/gutters tighten; at narrow browser sizes a labelled accessible icon rail and single-column cards take over. Native minimum size 800×600. Content scrolls inside main, leaving navigation stable.

Segoe UI body; Georgia collection wordmark; no licensed game logo asset. Geometric SVG landscapes in Landscape.tsx and the vector icon in public/port-icon.svg are original placeholder artwork authored for this project, not depictions taken from games. Replace only with artwork whose redistribution rights are documented.

States: persistent selected navigation, keyboard outlines, search empty results, offline notice, startup skeleton, accessible Radix dialogs with focus trapping/Escape, feedback toasts, destructive settings reset confirmation. Library is empty until real installation exists. The install dialog now exposes read-only PKG inspection and an actual runtime downloader, with unavailable installation explained.

Motion: 160ms page entrance, subtle cover scale and button hover, prefers-reduced-motion support plus saved user setting. No auto-scrolling carousel, blinking promotion or fake loading progress.

## Stage 02 Bloodborne update

The shell, navigation, toolbar, original palette and typography are retained. Bloodborne replaces the three demo titles. One vertical 2:3 catalog card shows 2015, Action RPG, FromSoftware, original PS4 and unverified Windows compatibility. Details distinguish the original game from SuperMedo's console compatibility runtime, with Russian copy, features, source-attributed requirements, version/data requirements and known limits.

Artwork slots are deliberately distinct: home hero, cover, wide details banner, 6–10 recommended gallery screenshots (up to 10 accepted). Redistribution permission for official Bloodborne art was not established; no official assets or generated lookalike landscapes ship. Labelled empty slots lead to local import on the details page. Raster inputs are limited to PNG/JPEG/WebP, <=12 MiB input, 200px minimum, <=40 MP decoded, resized to <=1920px (cover <=1000px), encoded to WebP and capped at 900000 characters each. This checks dimensions after browser decode; it is not a hardened untrusted-image decoder. Browser quota failures are visible. Native images persist separately from settings in SQLite.

Gallery thumbnails are lazy-loaded; fullscreen-style Radix viewer has focus trapping, previous/next controls, ArrowLeft/ArrowRight wraparound, Escape close, and explicit focus return to the opening thumbnail. No auto advance. Missing/failed hero art falls back to a labelled placeholder. Responsive details maintain the original installation sidebar and stack on small widths.

The install dialog is a real metadata/preparation entry point, not a fake seven-step success animation. Native PKG inspection reports what was read and why installation remains unavailable. Runtime downloader reports actual bytes/speed/backend state, retry, pause/resume/cancel and verified-cache status. Empty library remains honest. No Play action is enabled without a verified install/launch contract. The current extractor blocker is visible in the dialog and documented, not hidden behind an indefinite progress indicator.

## Continuation — private defaults and one multi-picker

The existing layout/palette remain. Personal builds show provided Bloodborne art immediately: scr3 hero, title cover, scr1 wide banner and four original gallery frames. No logos are duplicated in the banner, no fabricated screenshots or upscaled low-resolution inputs. Built-in files work offline in the actual release executable. Empty persisted slots resolve to these defaults; the additional customization editor is collapsed under «Заменить оформление на своё». A clean public build retains explicit missing-art states because redistribution rights remain unconfirmed. Private art screenshots stay outside public Git.

«Установить» opens one Windows multi-select PKG dialog immediately. Ctrl/Shift or standard multi-selection can choose base and update in either order. The panel automatically labels detected gd/base and gp/update components and shows version, size, IDs, PFS encryption, errors and metadata-only compatibility. An absent update is not itself an error. Conflicts/malformed/unknown packages cannot proceed. Closing/cancelling a picker permits another selection. Installation progress/completion and library cards remain absent until real data integration clears the remaining decoder/payload gates.

## Stage 04A — library and shared game state

Stage 04B continuation preserves one installation/card during updates. «Управление игрой» → «Установить обновление» selects the confirmed PKG; the existing card/paths/ID remain, and its version changes only after verification/commit. Actual per-phase progress and cancellation are shared across Home/details/library; cancellation is disabled after the commit boundary. Updates stage only their changed files and keep undo backups until success. They do not clone the game or runtime and do not rewrite normal user-data. The temporary «Объединить версии» path handles earlier duplicate installations, preserves the current 1.09 profile and an old-profile backup, and removes the duplicate row/game payload only after success. Native recovery blocks launch/removal while an undo journal is unresolved.

Installed games use a responsive cover grid with keyboard-selectable cards and a selected-game artwork/action panel. Management actions live in a native disclosure; removal still requires the existing Radix confirmation. Paths, installation identity, game version, manifest digest and detailed operation reports are collapsed under «Техническая информация». Game artwork is resolved by collection ID; unknown collections receive a labelled placeholder rather than Bloodborne art.

Home/focus, game details and library use the same application-level SQLite installation state and primary action. Runtime downloads and mere folder presence never register a game. Installation progress/cancellation uses real native status; errors expose the supported installer retry rather than fabricated repair. Native running IDs reuse the existing process-path guard across PORT restarts. Frontend guards prevent repeat clicks while native launch/removal remain authoritative. State refreshes every second and after management actions/dialog close. The current installer has one global operation; future concurrent adapters will need collection-specific operation status.
