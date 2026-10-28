# PORT// HUB — Home visual rebuild

Date: 2026-10-28. Local implementation authorized by the attached Visual Rebuild request. This is a Home/shell task; it does not implement the storage/API migration numbered 11.1 in the earlier blueprint.

Follow-up: [Stage 11.1-A2 premium polish](HUB_HOME_POLISH.md) records the local
Home/shell refinements, two visual iterations, real-data sections and final checks.

## Delivered scope

- `src/hub/HubLanding.tsx`: illustrated hero, catalog CTA, platform selection over published records, editorial CMS order, project cards, missing-image/loading/empty/error/retry states and current legacy operation slot.
- `src/hub/HubSidebar.tsx`: compact glass navigation with accessible names, active state, library/downloads/settings/About access and an original decorative cartridge.
- `src/hub/home.css`: replacement composition and shell styling. The previous `hub-glass.css` layer is disconnected, rather than covered by another glass layer. At 800px the sidebar becomes an icon rail. Motion respects both the OS preference and the saved setting.
- Existing React/Tauri services, checked v1 catalog media, SQLite settings, installation registry, guarded legacy actions, updater and recipe engines remain authoritative. No Rust, SQLite schema, CMS implementation, production deployment or publication changes.
- Catalog uses the pre-Hub `PublishedCards` and filters from Git HEAD. The previous agent's unapproved `HubViews.tsx`, `model.ts` and three CSS files remain on disk, disconnected and preserved. Before-state copies/patch/status are in ignored `.local/stage111-sol/`.

## Art and data

The supplied `00-ORIGINAL-APPROVED-STYLE.png` and `01-home-original.png` were visually inspected locally. They informed composition only; the reference was not stretched into a background.

Hero: original artwork generated with the built-in image generator, without sending source files, CMS/private data or reference images. Source PNG stays in the generator's output directory. Optimized project asset: `src/hub/assets/hub-hero.webp` (1672×941, about 269 kB). The illustration is brand art, not a screenshot of a listed project. Its in-app credit says so.

Generation prompt:

> Create an original cinematic dark fantasy artwork for a desktop gaming catalog homepage, wide 16:9 landscape. NO TEXT, NO LETTERING, NO LOGOS, NO UI. An immense intricate ruined gothic castle with slender spires towers over a rocky valley, blazing burnt orange and crimson sunset behind it, smoky clouds, glowing embers, deep midnight blue and purple shadows. A lone original cloaked swordsman seen from behind stands in the RIGHT half of the foreground, with a long practical greatsword slung diagonally across the back, surveying the distant castle. Original character, no recognizable franchise character. Painterly high fidelity game key art, confident composition, tactile rocks and ruins, volumetric haze, elegant restrained detail. Castle occupies center and upper right; swordsman around 70 percent horizontal position. LEFT THIRD is very dark atmospheric negative space with faint ruined silhouettes, suitable for readable white headline overlay. Bright red-orange atmosphere in right half, black navy ground. Edge to edge illustration, no frames, no interface, no embedded text. Designed as independent PORT HUB brand artwork, not as a representation or screenshot of any existing game.

Project names/media come from the existing anonymous CMS catalog and its existing SHA-256-checked image cache. The live read-only review found Bloodborne, Skate 3 and Sonic Unleashed, revision `9cd3a762-e438-468d-9cfe-f9d1357e0bc6`. No new game art is bundled or copied into tracked source. Existing private local Bloodborne fallback remains unchanged. Public redistribution permission for CMS/game art is not newly established by this task.

No popularity statistics, ratings, compatibility percentages or invented games appear on Home. The label is “Выбор редакции”, with the explicit catalog order; the three real records are not duplicated to imitate six reference cards. Platforms derive from published source consoles. Technology labels preserve Bloodborne as a compatibility runtime.

## Skills

Applied Ponytail (reuse existing services/actions, no dependencies), Make Interfaces Feel Better (type/spacing, specific transitions, image outlines, focus and reduced motion), Better Icons (Lucide inventory/search and consistent installed Lucide components), No AI Slop and Stop Slop (short functional copy), Imagegen (original raster hero), and Computer Use (actual Windows window inspection). Superdesign was read; its unreviewed cloud CLI/context-upload workflow was not run under its local security boundary and the user's no-upload restriction. No Figma or third-party design cloud received project content.

## Evidence

Review captures are local and ignored because they contain existing restricted artwork:

- `design/reviews/stage-11.1-sol/home-1440.png`
- `design/reviews/stage-11.1-sol/home-1024.png`
- `design/reviews/stage-11.1-sol/home-800.png`
- `design/reviews/stage-11.1-sol/home-480.png`
- `design/reviews/stage-11.1-sol/home-platform-xbox.png`
- `design/reviews/stage-11.1-sol/native-home.png` (actual WebView)
- `design/reviews/stage-11.1-sol/native-window.jpg` (actual Windows frame via Computer Use)

Browser visual captures use real published data, not density demos or mocked ratings. Automated browser regression cases use explicitly synthetic existing fixtures and are not native evidence. Before native launch, SQLite was opened read-only, integrity checked and consistently backed up to `.local/stage111-sol/before-native.sqlite`. Native checks only read registrations, navigate and inspect controls; no game launch/install/remove/update is performed.

## Deliberate limits

Only Home and the shared shell are rebuilt. Catalog, details, library, downloads and settings retain their existing feature contracts and content. The rest of the approved reference screens, official-download migration, accounts, compatibility reports, reviews and workshop remain outside scope. Small catalog size and original image resolution limit the density/fidelity of the reference comparison. No public release/deploy/push. Final verification and local commit are recorded in PROGRESS.md.
