# PORT// HUB — Stage 11.1-A3: Final Home Refinement

Date: 2026-10-28. Local Home-only implementation, authorized by the owner's attached request.

## Changes

- Replaced the two text lists with `CompactProjectCard`: verified CMS cover, source console, complete wrapping title, Windows availability and independent experimental-compatibility badge. Missing covers have an explicit fallback. The shared component accepts the existing `PublishedGame`/`MediaSet` and guarded project callback; it can be reused by a future catalog task without changing this task's catalog screen.
- Lower collections are disjoint: available Windows builds enter the Windows collection; experimental records without an available build enter the experimental collection. Both retain CMS order and cap at three records. Empty sections disappear. Platform selection recomputes membership from the current catalog snapshot, including ordinary refresh/cache behavior.
- Current anonymous CMS revision `9cd3a762-e438-468d-9cfe-f9d1357e0bc6` has three records, all with Windows builds. It therefore renders one lower collection, with experimental badges for Skate 3 and Sonic Unleashed. The approved editorial cards remain; each project has at most one additional lower discovery entry. No repeated Windows/experimental lists, fabricated records, ratings, release versions, dates or platforms.
- The lower collection uses a wrapping grid: three compact cards across at 1440, two at 1024/800, one at 480. No carousel or hidden horizontal scroller is needed. Sparse rows remain sparse. Borders and background provide restrained violet hover/focus feedback; transitions name only the changing color properties. No per-card blur or new dependency.
- Hero bytes remain SHA-256 `80aad049db204fb264b4d61b9d2c47c4bfcebf467213dea1b9ca7f3b61d6ae76`. Approved large cards, shell/sidebar, palette, installer/service/API/native contracts and other screens are unchanged.

## Verification

- `npm ci`: pass, zero reported vulnerabilities.
- `npm run build`: pass. Existing approximately 597 kB JS chunk warning remains.
- Final `npm test`: **47/47 pass**. New coverage checks overlapping build/experimental membership, hidden empty sections, missing art, long titles at all four widths and keyboard project entry. Existing installer, update, catalog/cache, library and shortcut regression cases remain enabled.
- First test pass exposed duplicate accessible project button names and invalid enum values in the new synthetic fixture. Names now distinguish compact entries; fixture uses schema-valid availability/compatibility. Final complete suite passes without disabling assertions.
- Changed-file Prettier, whitespace check and Rust fmt: pass. `cargo test`: **74 pass / 8 existing explicitly ignored**.
- `npm run tauri build -- --no-bundle`: pass. Final actual executable SHA-256 `2858c6a80b05bdaa52926d5ab73946660ac4a3a8c3d437ab48ad7661533dad2f`.
- Actual built Tauri release: two installed registrations, no active installation operation, three CMS cards and one compact collection. Xbox filtering gives two compact entries. Keyboard entry opens Bloodborne details with enabled existing Play control; no game was launched. Zero observed page errors.
- Actual native WebView captures at 1440/1024/800/480: main client/scroll widths respectively **1232/1232, 838/838, 718/718, 412/412**. Every compact card also has equal client/scroll width. Images load. These are CDP viewport-emulation sizes inside the real release, not four physically resized Windows frames; native minimum remains 800 px.
- Computer Use confirms the normal Windows frame after a restart without WebView debugging. PORT is left on Home. Existing large-card/hero style remains visible.
- Hover transitions inspected at 10% playback: color transitions last 180 ms, settle normally and honor reduced motion (`0s`). Keyboard focus uses the shared solid outline. All four final native lower-section captures were visually inspected.
- Before native work, consistent read-only SQLite backup and integrity receipt saved in ignored `.local/stage111-a3/`. After final normal restart, integrity is ok and all protected table values match exactly; only `catalog_cache` refreshed. All four original tracked dirty diffs match the prior/current baseline byte for byte; all unrelated untracked work remains outside this change. No game-payload/profile rehash is claimed.

## Evidence

Local screenshots contain existing restricted catalog artwork and remain ignored under `design/reviews/stage-11.1-a3/`:

- `before-native-{1440,1024,800,480}.png`, `before-native-sections-{width}.png`: pre-change release Home and lower lists.
- `after-{width}.png`, `after-sections-{width}.png`: final real-CMS browser review.
- `after-native-{width}.png`, `after-native-sections-{width}.png`: final actual release WebView at four emulated widths.
- `native-hover.png`, `native-focus.png`, `hover-10-percent.png`, `keyboard-focus.png`: interaction evidence.
- `after-native-window.jpg`: ordinary Windows frame after normal restart.
- `before-native-window.jpg` records the initially open project-details window; it is not used as a Home before/after comparison.

Skills applied: Make Interfaces Feel Better (existing CSS, image outlines, restrained transitions, readable wrapping, focus), Better Icons (CLI search and installed Lucide), Ponytail (existing media/services, no dependency), No AI Slop (short functional section copy), Computer Use (real Windows frame).

Rejected: repeating the same records in both lower collections, dummy density cards, another carousel for three records, per-card blur, changing the approved hero or catalog. No actionable Home-polish findings remain in the inspected scope. Verdict: Approve, with owner visual acceptance remaining.

Not verified: full screen-reader audit, physical 480 px native window, gameplay, full immutable-file/profile rehash or GPU benchmarking. No CMS edits, API changes, installation/data migration, push, deploy or publication. Work stops at Home; catalog redesign remains a separate request.
