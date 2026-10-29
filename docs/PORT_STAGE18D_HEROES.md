# PORT — Stage 18D: universal project heroes and featured carousel

2026-10-29. Actual React/Tauri implementation over Stage 18C. Gemini / Liquid Glass,
dark colors and Premiere Compact tokens remain in use. No CMS, API contract, Rust
downloader, schema or user storage changes.

## Artwork selection

`useProjectArtwork` is shared by `ProjectCard` and the reusable `ProjectHero`.
The latter renders both the project page and Home slides. There are no slug,
game-name or console-specific layout branches.

Only existing trusted immutable CMS WebP URLs pass `parseV2Media`, the bounded
loader and SHA-256 validation. Browser decoding/geometry then select, in order:

1. An optional, suitable dedicated `hero`, then `banner`.
2. A suitable gallery frame: width ≥960, height ≥540, aspect ratio 1.5–2.4.
   Score is width capped at 1920 divided by `1 + abs(ratio - 16/9)`; ties retain
   CMS order. This is a geometric quality gate, not semantic subject recognition
   or a sharpness measurement. Low-resolution N64 frames remain in the gallery.
3. A cover composition: the full original cover uses `contain`, with a dark violet
   foundation and a low-opacity blurred copy behind it. Only the decorative copy
   is enlarged. The actual project hero stays wide; cards use the compact cover
   row in the same existing visual system.
4. A PORT wordmark and explicit image-unavailable state on a branded background.
   Decode/render failures fall back instead of leaving a blank image rectangle.

Wide heroes preserve the full frame with `contain` and a soft edge/contrast shade.
Cards may crop a wide frame to their smaller fixed artwork area. Gallery/viewer
behavior remains unchanged. No new artwork, external art search or generated
assets were used. Existing private artwork stays ignored.

## Carousel behavior

Home takes the first six published, eligible projects in the existing CMS catalog
order. This is independent of local search/platform filters and of build status.
There is no array of game IDs. As CMS adds projects they use the same selection
and rendering path automatically; records beyond six remain in the catalog.
Future editorial selection can replace the small `featuredProjects` function
once CMS offers an actual featured contract.

Each slide includes the current project name, source console, technology,
description and Open project action. The optional Windows badge requires the
existing approved-v2 build evidence and available status. A published record is
never treated as installed. Home initiates no downloads.

Two or more slides rotate every seven seconds with a 650 ms opacity/text
transition. Fixed slide height prevents layout jumps. At most six decoded slides
are kept mounted, preloading the next slide as well as other bounded candidates;
background galleries are not cycled. Dark base surfaces prevent white flashes.
Arrows, indicators and a pause/resume control support manual operation. Hidden
slides are inert and removed from the accessibility tree. Automatic announcements
are suppressed while rotating; manual changes use a polite live region.

Hover, keyboard focus, hidden document and window blur suspend the timer. Pointer
interaction/manual selection pauses rotation until the user presses resume and
leaves the focused/hovered carousel. Reduced motion disables automatic rotation,
crossfades, text motion and indicator transitions; arrows remain usable. Effects
clear timers/listeners on unmount and restart with a fresh seven-second period.
One record has no controls or rotation; zero records/loading/errors retain the
original PORT hero with catalog state. A failed refresh can keep old catalog
cards below the branded error hero.

## Future CMS banner integration

Current API v2 does **not** promise `media.hero` or `media.banner`. The frontend
accepts either optional string only through the same trusted `/media/<sha256>.webp`
origin/path/hash validation as cover/gallery. Missing/unsafe fields are ignored.
No fixture properties enter production and no CMS field/schema was created.

When CMS actually adds a dedicated banner: document its contract, publish it via
the existing trusted immutable media pipeline, and send the URL in detail media.
For a string URL with the current format, the adapter already handles it. If CMS
chooses a descriptor object or another transport, update `parseV2Media` and its
boundary tests explicitly; do not cast or bypass the validation. Add summary
support only after a corresponding real API contract exists. Detail enrichment
already supplies validated media to Home/catalog, so UI components need no
game-specific changes.

## Validation and evidence

- TypeScript and frontend build pass. Existing Vite JS chunk >500 kB warning remains.
- New deterministic QA covers 0/1/2/12 projects, six-slide cap/order, navigation,
  low-resolution gallery plus portrait, cover-only, no art, multiple wide frames,
  future banner preference, unsafe origin rejection, publication without a build,
  preload/decode, autoplay, hover/focus/blur/visibility/manual pause/resume,
  reduced motion, unmount/navigation and long names at all three sizes.
- All 73 targeted Playwright checks pass, including 12 new Stage 18D checks.
  Previous API/media/download/notification/preferences/titlebar/visual regressions
  use updated universal-hero selectors and branded image fallback assertions.
- Browser replay and actual Tauri/WebView2 each have 15 screenshots: Home Sonic,
  Home Zelda, catalog and both project pages at 800×600, 1280×720 and 1600×900.
  Both also have a six-frame transition sequence and a real seven-second autoplay
  check. Browser uses recorded real local CMS responses/assets; native uses live
  local API through the existing Rust HTTPS QA transport. These are different
  evidence sources, not production or live download evidence.
- Native debug identity is `app.port.cms-qa`; fresh isolated storage is
  `C:\PORT\.local\stage18d\app-data`. Native galleries/Escape, enabled actual build
  CTA, empty QA installations/history and no horizontal overflow were checked.

See [.local/evidence/stage18d/INDEX.md](../.local/evidence/stage18d/INDEX.md) for
screenshots, sequence, logs and final test count. No archive transfer, destination
picker/no-clobber retest, game launch, OS DPI matrix or cross-device GPU benchmark
was performed. Production was not queried. Pre-existing dirty work is excluded
from the local Stage 18D commit. No push, deploy, release or automatic next stage.
