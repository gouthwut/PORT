# API v2 client — Stages 13A / 13B

Stage 13B adds the scoped native release-file download flow described in
[HUB_DOWNLOADS.md](HUB_DOWNLOADS.md). It supersedes the Stage 13A statements below
that asset URLs have no download action. Official links remain read-only and
legacy installers remain disconnected. Missing/null build URLs now remain null
in the presentation layer so that the project displays an unavailable action;
malformed non-null URLs still fail validation. The CMS contract is unchanged.

Current client flow, 2026-10-29. PORT uses the existing validated public v2
contract. No CMS contract or backend/storage migration is part of Stage 13A.
Earlier Stage 11.3 implementation notes below remain applicable unless superseded
by the current source/navigation rules here.

## Source and navigation

`src/hub/source-config.json` now defaults to:

```json
{
  "version": "v2",
  "baseUrl": "https://port-catalog-cms.port-catalog-cms.workers.dev",
  "fallback": "none"
}
```

Home and Catalog share one validated in-memory snapshot. Both open the same v2
project page. Main navigation has Home and Catalog; Settings/About remain.
Catalog search, source-platform/technology/lifecycle/build filters, sort and page
remain in App while opening and returning from a project. Compatibility-runtime
projects are excluded from the new views; they are not presented as native ports.
Approved visual composition, hero artwork, CSS and window topbar are retained.

`VITE_HUB_SOURCE_JSON` can override configuration for a chosen build, but the
current UI rejects v1 or `fallback: v1`. Low-level v1 transport/cache/adapters and
legacy source helpers remain in source for compatibility; they are not mounted
by App. API errors display Retry, successful empty responses remain empty, and a
failed refresh may retain only the last complete in-memory v2 snapshot. There is
no discovery, invented release, automatic download or installation fallback.

The native CSP still permits only the existing production CMS origin for v2
fetches. Browser preview also requires CORS. No live availability is asserted.

Project details display validated official links and explicit approved-build
`releaseUrl` links, deduplicated by URL. Asset URLs are not exposed as a new
download action. Native links reuse the existing opener/capability policy;
external links outside that policy report an opening error. Missing data and
builds stay explicit. No download manager is implemented.

## Retained legacy scenarios

App no longer connects the old library/download routes, hardcoded Bloodborne
fallback, PKG/folder/ISO/recipe install dialog, legacy recipe sync, v1 endpoint
settings or installation-folder selector. Legacy components/services and native
installer/update/recovery code remain in the repository. SQLite, installations,
profiles and game files are unchanged. Legacy frontend operation polling and
shortcut-request consumption are inactive with the old library flow. Backend
startup/recovery behavior is unchanged; this is not a native migration or native
validation result. A new native-port library is a separate stage.

## Transport and presentation

`api-v2.ts` validates the consumed public fields and returns typed project pages,
game pages, detail, builds, requirements and instructions. It reads only anonymous
GET endpoints: `/v2/projects`, `/v2/games`, `/v2/projects/{id}` and the related
`/builds`, `/requirements`, `/install` endpoints. Detail already contains its builds,
requirements and instructions, so opening it needs only one request.

Each response is limited to 1 MiB and 15 seconds, with credentials omitted and
redirects refused. Snapshots are in memory only: no new SQLite/localStorage cache.
Pagination rejects repeated/non-advancing cursors, duplicate IDs, inconsistent
totals and incomplete results. Maximum ten pages of 100 per entity; an oversized
catalog fails explicitly rather than presenting a partial list. Offset pagination
has no server snapshot token: count/duplicate checks cannot detect every concurrent
same-count edit. The client cannot promise transactional server snapshots.

Existing cards, ProjectOverview and typography classes are reused. Missing optional
data stays null/unknown or receives an explicit unavailable label. Network detail
errors have Retry and Back; leaving a project prevents stale detail results from
replacing a later selection. Text renders through React without HTML interpretation.
Links require public HTTPS. No download, execution or installation path is added.

## Contract mismatches and limits

- Server `q` searches project names only; `platform` filters target OS. Existing UI
  searches original game titles and projects and filters source consoles. Therefore
  the UI loads a complete bounded projects/games snapshot and applies its existing
  filters, sorting and 24-card pages locally. The typed page method separately
  supports all server project filters/cursors without changing their meaning.
- Summary `latestStable` is OS-agnostic. Catalog Windows availability stays
  **unknown**; a target Windows platform or version does not prove a Windows build.
  Detail derives availability only from approved stable Windows builds; Linux and
  prerelease builds never imply stable Windows availability. All approved channels
  are labelled in detail. No builds or unknown availability remain unknown.
- Public builds omit `review`; the server query selects `review='approved'`.
  The client relies on this public endpoint contract and drops any explicit
  proposed/revoked/unrecognized review values. It does not certify compatibility.
- V2 URL-only media uses only the configured production CMS immutable
  `/media/<sha256>.webp` paths. Summary covers and detail media feed existing cards,
  GameArt and Gallery. The shared bounded WebP loader verifies the URL hash and
  returns data URLs under the unchanged CSP. A separate 24-entry memory cache
  deduplicates requests; v1 persistent cache and SQLite remain untouched. Missing,
  rejected, HTTP/hash/decode failures receive existing placeholders.
- No native runtime/build or live production v2 availability is claimed. The CSP
  origin addition is configuration preparation, not native execution evidence.

## Checks

Stage 13A: `npm run build` passes (one `tsc --noEmit` plus Vite); targeted
`tests/hub-api-v2.spec.ts` passes 15/15. Coverage includes transport/media validation,
Home/catalog/project navigation, keyboard entry, preserved search/filter/sort,
exact repository/release links, default v2 failure/retry, rejected v1/fallback
configuration, empty/no-build/detail-error states and excluded runtime entries.
Responses are intercepted fixtures; no live CMS/native/opener test, screenshot,
Rust build or installer build was run. The old legacy UI suites remain in the
repository and describe retired entry points; the full suite was not run.
