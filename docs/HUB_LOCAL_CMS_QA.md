# Stage 13E — local CMS v2 QA

Stage 13F update: the owner's subsequent positive E2E and a new independent
no-dialog QA download now pass with the expected size/SHA-256. Interactive QA
asks for a destination by default; use `scripts/start-cms-qa.ps1
-NoDownloadDialog` only for isolated automation. See
[HUB_DOWNLOAD_DESTINATION.md](HUB_DOWNLOAD_DESTINATION.md) for current behavior,
Explorer evidence and remaining manual picker checks. The Stage 13E blocked
results below are historical.

2026-10-29. Local integration works in the real Tauri debug app. The live ZIP
transfer is **blocked**, because the public build reports `availability: unknown`.
Nothing was downloaded, extracted or executed. CMS files and production were
not modified. No installer/release build or push.

## Isolated configuration and TLS

Run from `C:\PORT`:

```powershell
pwsh -NoProfile -File scripts/start-cms-qa.ps1
```

The script supplies the existing `VITE_HUB_SOURCE_JSON` override with
`https://localhost:8787`, v2 and no fallback, plus a dev-only QA flag. The separate
`src-tauri/tauri.cms-qa.conf.json` selects `app.port.cms-qa`, the optional
`local-cms-qa` Cargo feature, and app directories entirely under
`C:\PORT\.local\cms-qa\app-data` (including WebView storage). Native release
downloads in this identity use a native picker by default, initially pointing at
`C:\PORT\.local\cms-qa\downloads`. Explicit `-NoDownloadDialog` automation uses
its isolated `release-*` children. No production/user SQLite is opened.

Frontend localhost access is dev-only and goes through a dedicated native IPC
transport. Native access independently requires the feature, debug assertions and
the exact QA identity. A feature-enabled app with any other identity or a release
build fails at startup, before database initialization. Normal production builds
keep their existing source URL, CSP, public-URL rules and rustls feature set.

Only fixed `https://localhost:8787` is supported, pinned to `127.0.0.1:8787`.
GET paths are limited to v2 projects/games, project detail/builds/requirements/install
and immutable hash-addressed WebP media. No admin, v1, arbitrary origin, proxy,
redirect, cookies or credentials. Responses retain MIME, 1 MiB and timeout limits;
images still use the shared SHA-256/WebP validation. Native downloader re-fetches
the local public builds endpoint by IDs and retains its existing approval,
availability, asset-origin and file checks.

The local public certificate must be at
`C:\PORT\.local\cms-qa\localhost.pem`. It stays ignored and is not installed in
Windows trust stores. For a fresh setup, export the local server's **public**
certificate as PEM using its certificate viewer, verify it against the local
server owner's certificate, and place it there. Never copy a private key. In this
session, the presented certificate was captured during a TLS handshake that was
deliberately rejected; no HTTP data was accepted until explicit per-client trust
was supplied. This is local development trust, not public server authentication.

Observed certificate: self-signed Cloudflare Wrangler `CN=localhost`, SHA-1
thumbprint `06F4C9C78070DF461C7F872607FC6198ED720344`. The saved PEM file SHA-256 is
`42f858b8a1627de04562bce8d7139c20118af20be319542d6fe0982ac2525d12`.
Replacing/renewing the certificate requires reviewing and replacing this local
file; trust does not silently expand.

Plain curl/Windows rejected the untrusted certificate. With `--cacert` the local
detail returned 200. Rust/rustls still rejected Wrangler's CA-marked server
certificate as `CaUsedAsEndEntity`. The optional QA feature uses Windows native TLS
for the local client, with built-in roots disabled and **only** the supplied PEM
as its trust anchor. TLS signature/chain, hostname and validity checks remain on.
No `danger_accept_invalid_certs`, global callback bypass or browser ignore-TLS
flag. A live test substituted an unrelated valid public certificate: the request
failed with an untrusted-root TLS error. The original PEM was restored in `finally`.

## Live result and contract gate

- Production anonymous `/v2/projects` still returns HTTP 401,
  `{"error":"Требуется вход"}`. Local detail and `/builds?channel=all` return 200
  without login. Thus the prior 401 is an authorization response from the
  configured production API, before build validation; it is not a GitHub ZIP or
  SHA-256 failure. The production deployment's age/configuration cannot be
  established from these read-only HTTP responses.
- Live native Home/catalog/detail display Zelda 64: Recompiled / Majora's Mask,
  Nintendo 64, recompilation, cover and four decoded screenshots, GitHub repository
  link and Windows stable `v1.2.2` row. No artwork was committed. The GitHub link's
  exact href was checked; an external browser was not opened.
- Build ID:
  `gh-6822e14d314b68f76e516128e6c28f6a974e7c93c33ed5007a4a1890bbfe921a`.
  File `Zelda64Recompiled-v1.2.2-Windows.zip`, expected size **28940501**,
  expected SHA-256
  `d02b95f1cf5e4d44d6587fa6136c6db521f61aa41ba8700c05f91bea8b0a26d0`.
  These are validated API metadata, **not measured downloaded-file results**.
- The public response omits `review`; owner reports approved review. The existing
  public contract serves approved rows only and the client rejects explicit
  non-approved review. Owner CMS/database state was not inspected.
- `availability` is independently `unknown`. UI shows “Доступность не указана” /
  “Доступность файла не подтверждена” and disables Download. A direct native start
  with the same IDs re-fetched the live build and returned
  **“Одобренная доступная Windows-сборка не подтверждена”**, zero bytes. Opening a
  completed folder was rejected with “Нет завершённой загрузки”. No transfer
  directory was created.

Required CMS-side outcome before a positive E2E: after an owner-controlled
availability verification, both public detail and `/builds?channel=all` must expose
this same approved Windows build with **explicit `availability: available`**, its
direct GitHub Release URL, size and digest. Approval alone does not imply
availability. If owner CMS cannot publish that state, a separately authorized CMS
change must supply that field/update path while preserving approved-only public
selection. No client contract relaxation or automatic unknown→available conversion
is needed or permitted here.

## Reproduce and finish manually

1. Keep the local HTTPS CMS running. Use the launcher command above; open
   Catalog → Majora's Mask. With current data expect a disabled Download button.
2. Optional live negative E2E: start the launcher with `-DebugWebView`, then in a
   second terminal run `node scripts/native-cms-qa.mjs`. It asserts current unknown
   availability, loaded images/links, native rejection and unavailable folder
   action; it never changes the record or downloads the ZIP. Close QA afterward
   to end the temporary loopback debugging listener.
3. After the owner separately fixes/publishes verified availability, restart QA
   to clear the in-memory snapshot. Confirm the same build ID and metadata above.
   Click **Скачать файл**, watch actual bytes/percentage/speed, navigate away and
   back, and click **Открыть папку** only after completion. The negative runner is
   intentionally not a positive-download runner.
4. Independently verify the new file in the QA downloads directory:

   ```powershell
   $qaZip = Get-ChildItem -LiteralPath C:\PORT\.local\cms-qa\downloads -Recurse -Filter Zelda64Recompiled-v1.2.2-Windows.zip
   $qaZip | Select-Object FullName, Length
   $qaZip | Get-FileHash -Algorithm SHA256
   ```

   Compare **each** file with the expected size/hash above. Do not open/run/unpack
   it. Cancellation, progress during real GitHub streaming, successful completion,
   independent ZIP size/hash and successful Explorer opening remain **unverified**
   in this stage because the availability gate stopped the request.

## Evidence and checks

Ignored `.local/evidence/13e/`: local HTTP headers/detail JSON, native result JSON,
actual native project screenshot, negative TLS error and public certificates.
Native runner uses actual IPC and live local CMS; no network route mocks.
TypeScript/Vite build passed (existing >500 kB warning). Targeted v2/download UI
regressions passed 18/18 with mocked HTTP/IPC. Six Rust downloader tests passed
(including synthetic streaming/hash/cancellation); QA scope test passed with the
optional feature and in the standard feature set (local transport disabled).
Final guarded native app relaunch/live negative E2E and changed-file formatting
checks passed. QA app/debug listener were closed. Checks ran on the owner's dirty
tree; its existing unrelated image dependency/lock addition remains uncommitted.
These synthetic checks do not establish live ZIP completion.
