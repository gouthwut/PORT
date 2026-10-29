# Stage 13B — official release-file downloads

One active download, Windows app only. Project build rows reuse the existing
button component. A compact bottom-right panel survives navigation and shows
received/total bytes, percentage and average transfer speed. Unknown total is
explicit. Cancel works during CMS validation, connection and streaming. Completed
files offer **Open folder**; downloaded programs are never executed.

## Source and trust

The frontend sends only project/build IDs. Rust independently reads the fixed
production `/v2/projects/{id}/builds?channel=all` endpoint with the existing
bounded, public-DNS-pinned CMS transport (1 MiB / 15 seconds). Its public contract
selects approved rows and omits `review`; any explicit value other than `approved`
is rejected. Foreign/duplicate identity, unavailable/unknown availability and
non-Windows builds are rejected. Stable and explicitly labelled prerelease rows
are supported. No guessed URL, source archive, repository-page fallback or
legacy installer adapter is used.

Direct files must use `https://github.com/{owner}/{repo}/releases/download/{tag}/{file}`.
Only HTTPS port 443, no credentials or fragments; the initial URL has no query.
Redirects are bounded to five and restricted to `github.com` and
`release-assets.githubusercontent.com`. Every hop resolves and pins public DNS
addresses; proxies are disabled. Connect timeout is 10 seconds and read inactivity
timeout is 20 seconds. Signed redirect queries stay native and are not exposed in
errors. No cookies or authorization tokens are supplied.

Filenames use a bounded ASCII leaf without percent escapes, separators, device
names, hidden names, alternate streams or trailing dots. Unsupported names disable
the action explicitly; Content-Disposition cannot choose a path. Existing shared
symlink/reparse checks protect the destination path. Downloads go into a fresh
`Downloads/PORT/release-<random>/` folder, never an installation or caller path.

The payload is streamed into a `.part` file. CMS size and HTTP Content-Length must
agree when both exist; byte count and optional CMS SHA-256 are checked at EOF.
Without either a size or digest the operation fails. Nonempty payloads are capped
at 32 GiB, flushed to disk and persisted with a final no-clobber rename. Existing
files are never replaced. Cancellation, network failure and verification failure
drop the temporary file/directory. Forced termination can leave a visibly named
`.part` in its temporary folder; it is never reported as completed or resumed.
Without CMS SHA-256, matching size verifies transfer completion, not authenticity
of the contents. There is no compatibility certification or automatic execution.

## Current live limitation

On 2026-10-29, anonymous production `/v2/projects` and the native `/builds` request
returned HTTP 401 (the project-list response said that sign-in is required).
No CMS contract, authentication or neighboring repository was changed. The public
API must be accessible before the owner can test a real approved release through
the catalog. Successful live CMS-to-GitHub download is **not verified**. Native
failure handling was tested with the real endpoint; streaming success, truncation,
digest mismatch and cancellation use synthetic local response fixtures.

## Manual check

1. From `C:\PORT`, run `npm run tauri dev -- --config C:\PORT\.local\stage13b-qa.json`.
   The local QA config uses `app.port.download-qa`, keeping the owner's app-data
   identity separate. It is intentionally ignored, not production configuration.
2. Once the public API is accessible, open Catalog → a project with an approved,
   available Windows build and an actual direct release asset → **Скачать файл**.
   A missing URL, source archive or unknown availability must have a disabled
   action with a reason. Browser preview also disables native downloading.
3. Watch bytes, percentage and speed; navigate to another screen and confirm the
   panel remains. Try a second download: it must be disabled/rejected.
4. Cancel mid-transfer. No final file or Open folder action should appear. Start
   again from the build row; this is a new transfer from zero.
5. Finish a download and click **Открыть папку**. Verify the saved file and its
   expected size/hash; PORT must not run it or unpack it.
6. Interrupt connectivity during a larger transfer. Expect an error after the
   read timeout, no completed file and no Open folder action; retry from the row.

There is no pause/resume, queue/history, persistent job state, automatic cleanup
of abandoned folders after forced termination, background operation after app
exit, extraction, installation or update feature in this stage.
