# PORT visual design

[Figma foundation board](https://www.figma.com/design/UcQWJ0RjgsgaW9O5YgJjbC). Editable palette and typography direction; full application screens are implemented directly in React. Figma board uses Inter as a concept font; shipped Windows UI uses locally installed Segoe UI Variable/Segoe UI. No font downloads.

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
