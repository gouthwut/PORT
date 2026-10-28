# Stage 11.3-A — API v2 client

Local implementation, 2026-10-28. Server contracts read from
`C:\PORT-CMS\src\hub-api.ts` and `hub-model.ts`; no server changes or live
deployment assumptions. Existing v1 transport, validated cache and installer
contracts remain in place.

## Explicit configuration

`src/hub/source-config.json` is committed as `{ "version": "v1" }`.
It makes **no v2 requests**. To opt into v2 for a chosen build, set this file
or the explicit build/dev environment variable `VITE_HUB_SOURCE_JSON` to:

```json
{
  "version": "v2",
  "baseUrl": "https://port-catalog-cms.port-catalog-cms.workers.dev",
  "fallback": "v1"
}
```

The environment variable overrides the file; restart the dev server or rebuild
after changing it. It is not a player setting or a SQLite migration. `baseUrl`
must be a public HTTPS origin. There is no localhost discovery or local fallback.
The packaged native CSP permits only the existing production CMS origin for
v2 fetches; another native origin needs a separately reviewed build policy.
Browser preview also requires the configured server to allow CORS.

`fallback` is mandatory for v2: `v1` replaces the **entire** list on v2 network,
HTTP, size or validation failure and displays a persistent explanation. `none`
shows the v2 error and retains the last complete in-memory v2 snapshot, if any.
An invalid configuration shows an explicit error. A successful empty v2 response
remains empty and never activates v1. Refresh retries the configured v2 source.
Initial v2 loading does not display v1 cards as provisional v2 results.

Home, library and installation actions continue to use their existing v1/local
contracts; the selected source applies to Hub catalog/project pages. A v2 project
never obtains a v1 installation identity, even if its public legacy ID matches.
Errors on a v2 project page never substitute v1 detail data.

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
- V2 has URL-only media instead of the v1 asset descriptor contract. This stage
  keeps image placeholders and does not bypass the existing verified media cache.
  Adding v2 image fetching/verification is separate work.
- No native runtime/build or live production v2 availability is claimed. The CSP
  origin addition is configuration preparation, not native execution evidence.

## Checks

Targeted Playwright covers adapters, query encoding, cursor assembly, original-game
search/source-platform filters, missing fields, unsafe URLs, identity/schema/cursor
rejection, unapproved builds, source fallback/retry/default v1, existing project-page
state preservation and guarded installation separation. Responses are intercepted
fixtures, not a real CMS or native test. No visual assertions/screenshots.

One `tsc --noEmit` run found two possibly-undefined reader references; replaced the
reader assignment with a null-coalescing fail-closed expression. Per the owner's
one-check limit, TypeScript was not rerun; no final passing tsc result is claimed.
