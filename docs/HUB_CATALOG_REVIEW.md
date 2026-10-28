# PORT// HUB — Stage 11.1-B: Premium Catalog

Date: 2026-10-28. Owner-authorized local catalog implementation, based on Home
commit `e89af5a`. No production publication or push.

## Result

The catalog uses Home's Inter/Manrope typography, `--port-*` color/easing/surface
tokens and card image/edge/hover rules. A restrained violet introduction leads
to title/project search, source-platform, technology, lifecycle and Windows-build
filters. Sorting supports catalog order and both title directions. The result
grid has 24 records per page, explicit previous/next controls and a result heading
that receives focus on pagination. Filters, search, sort and page remain in App
state when visiting details, Home, library or settings and returning. They do not
persist across a cold application restart.

`ProjectCard` is reusable alongside the unchanged `CompactProjectCard` used by
Home. It displays original titles, a distinct project name when supplied,
source platforms, technology and build availability. Keyboard names include the
project name when multiple ports share an original title. Complete titles wrap;
missing/broken art has a labelled fallback. Images load lazily and decode
asynchronously. Only the current page's cards mount; repeated cards have no
backdrop blur or continuous animation. No new dependency or art was added.

Loading, failed refresh with retained records, initial network error, empty
publication and empty filtered results have separate states. Refresh/retry reuses
the existing service. Reset clears all filters and sorting. Windows availability
is independent of whether PORT has a compiled installer adapter.

## Public data boundary

- `catalog-model.ts` defines separate original-game references, port identity,
  technology, lifecycle and Windows availability/evidence. `catalog-source.ts`
  supplies a transport-independent input for `HubCatalog`.
- The enabled source remains the existing v1 endpoint and strict bounded
  schema/HTTPS/hash/WebP/cache pipeline. Custom endpoints and offline cache retain
  their behavior. Drafts, unknown fields and invalid responses still fail closed.
  Retained installed metadata does not enter the public grid.
- V1 has no distinct project name, original-game grouping IDs, lifecycle or
  per-build OS/channel/review records. Its one-record mapping is provisional;
  no repository-name inference or invented lifecycle is used. `unknown` stays
  explicit. Its Windows flag is an editorial availability claim, not a verified
  artifact, compatibility certificate, release version or installation result.
- `fromV2` is a pure adapter for a **validated public** project summary joined
  with public original games by `gameIds`. Two ports of one game stay separate.
  It is not a parser, private/admin importer or enabled HTTP source. The current
  planned v2 summary's latest release is OS-agnostic, so its Windows availability
  remains unknown until a reviewed public build response provides that evidence.
  No proposed/private build enters this adapter or current interface.
- No automatic call to a local CMS, `/v2`, owner API or content checkout occurs.
  No research JSON from the 15-project collection is bundled.

### Scale and future v2 connection

The v1 endpoint has no paging API and caps its complete snapshot at 100 records.
The existing native/browser sync downloads a bounded verified image cache for
offline Home/details/library. This work preserves that contract; UI pagination
does **not** turn that legacy transfer into server pagination. It reduces mounted
cards/image decodes and avoids an unbounded grid. Filtering/sorting are memoized,
search uses a deferred value and page numbers clamp when a refresh shrinks the
catalog. A 63-record browser scenario covers page/filter transitions; a 1,000-record
model check covers page size and final-page clamping, not a throughput benchmark.

Before production v2 cutover, add a validated paginated source at
`ProjectCatalogState`, use server `nextCursor`/bounded page caching, fetch original
game titles and reviewed Windows build evidence, and provide verified media.
The current local v2 API searches project names and filters **target OS**, while
this UI searches game/project titles and filters **source platform**. Do not
map these parameters blindly or filter only one server page and claim a global
result count. Source-platform/game search needs an equivalent server contract or
a separately bounded public index. The v2 HTTP/cache/installer transition remains
a separate integration task; the view and card presentation can be retained.

## Verification

| Check               | Evidence and result                                                                                                                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dependencies        | `npm ci` pass, zero reported vulnerabilities. Initial Windows file lock resolved by stopping the identified old Vite preview process.                                                                                                       |
| Frontend            | TypeScript/Vite build pass. Existing >500 kB main JS warning remains, approximately 604 kB.                                                                                                                                                 |
| Browser regression  | Final full `npm test`: 54/54 pass, including the accessible project-name change, 1,000-record model assertion and reduced-motion focus regression. Earlier focused catalog suite: 7/7.                                                      |
| Rust                | fmt pass; 74 tests pass, 8 existing explicit ignored probes. Native/backend source unchanged.                                                                                                                                               |
| Windows build       | Standard `npm run tauri build -- --no-bundle` pass; separate QA build uses the same frontend with an isolated identity.                                                                                                                     |
| Real source         | Actual native Rust HTTPS pipeline loaded revision `9cd3a762-e438-468d-9cfe-f9d1357e0bc6`, with Bloodborne, Skate 3 and Sonic Unleashed. Covers decoded; no fabricated records.                                                              |
| Actual native sizes | Real Tauri `set_size` at 1440, 1024 and 800 logical px; native inner-size receipts match. Main scrollWidth/clientWidth: 1232/1232, 838/838, 718/718. Resize permission exists only in ignored QA config; production capabilities unchanged. |
| Narrow layout       | 480 px uses CDP emulation inside the actual WebView and separate Chromium checks. Physical native minimum stays 800; a 480 px Windows frame is not claimed.                                                                                 |
| Interactions        | Native title search, source platform, technology, lifecycle, Windows flag, sorting, reset, keyboard project entry and preserved filters pass. Browser checks cover loading/error/retry/cache/invalid-response and large-list scenarios.     |
| Windows frame       | Computer Use inspected the actual QA window and search focus. No game/installer/update/remove action started.                                                                                                                               |

The first browser run exposed two fixture/selector assumptions: exact wrapped
label matching included option text; a synthetic Bloodborne record legitimately
used the private local-art fallback. Tests now use named comboboxes and a distinct
missing-art identity. Existing cache checks target the new card image, and the
old empty-publication test expects the new explicit empty-catalog heading.
Validation assertions and installer/library coverage remain enabled. Native
resize harness initially used an incorrect IPC size shape; it now uses Tauri's
documented `{ Logical: { width, height } }` serialization. Final native reduced-motion verification exposed a CSS load-order conflict with Home hover/focus rules; more specific catalog overrides now suppress both card and image transforms. The global micro-duration accessibility rule remains; QA checks sub-millisecond duration rather than requiring a literal zero.

## Interface review

Full scope: new catalog and project card; React with existing plain CSS. Home,
sidebar and existing detail page retain their composition.

| Category    | Inspected evidence                                                        | Result                                                               |
| ----------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Typography  | Real covers, complete titles, long synthetic title, narrow widths         | Clear; existing Manrope/Inter and wrapping retained                  |
| Surfaces    | Introduction, filters, card edges, missing art, empty/error states        | Clear; shared reflections, nested spacing, no repeated blur          |
| Animations  | Card/image hover at 10% playback, focus, press, reduced-motion rules      | Restrained transitions; reduced motion removes transform/transitions |
| Icons       | Installed Lucide set; Better Icons search for `lucide:sliders-horizontal` | One outline family, meaningful labels and decorative icons hidden    |
| Performance | 24 mounted cards, lazy images, memoized selection, 63/1,000-record checks | Bounded UI; legacy full v1 transfer limit documented above           |

Rejected: fake project density; popularity/review/release-date sorting without
data; a new per-card glass filter; bypassing verified media with remote URLs;
adding a virtualizer for 24 mounted records. No actionable interface-polish
finding remains in the inspected scope. Full screen-reader audit and calibrated
GPU/network benchmark were not run; owner visual acceptance remains external.

## Evidence and preservation

Captures contain existing restricted catalog artwork and remain ignored in
`design/reviews/stage-11.1-catalog/`:

- `native-{1440,1024,800}.png`, `native-cards-{1440,1024,800}.png` — real resized native client.
- `native-emulated-480.png`, `native-emulated-cards-480.png` — emulated narrow native WebView.
- `native-window.jpg`, `native-card-focus.png`, `native-hover-10-percent.png` — frame/focus/motion review.
- `native-report.json` — real endpoint/revision, resize receipts and interaction results.
- `browser-fallback-{width}.png`, `browser-error.png` — labelled synthetic missing-art/error coverage.

The native executable uses `app.port.catalog-qa` and a new disposable app-data
folder, with no copied registrations. It asserts zero installations before
testing. The owner's existing SQLite was neither opened by this QA build nor
queried/modified by this work. Existing runtime/profile/game files were not test
targets. No preservation rehash of those files is claimed. The previously running
release was closed to release its executable build lock; the standard executable
is rebuilt, while the visible QA copy remains separate and clearly labelled. Final QA restarted without temporary WebView debugging. Standard release SHA-256: `d2310941addcee936daeafcd63a1d79ab42774ea4938b0d5354e584681e3760a`; isolated QA SHA-256: `f2d387944273d4be2401a0efd27bf1ad5f65c5ffc7dd119deaaba034ac4e0ee0`.

Pre-existing Cargo.toml/lock, InstalledLibrary and Stage04D test edits, plus
untracked experiments, remain outside this task's commit. CMS/content neighbors
were read only. No deploy, push, account/community feature, new detail page,
production migration or publication.

Skills: Make Interfaces Feel Better, Better Icons, Ponytail, No AI Slop, Stop Slop
and Computer Use. No external design-service upload or additional dependency.
