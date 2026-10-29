# Stage 13F — download destination and Explorer

Stage 14B presentation update: the canonical path remains in Rust, but is no
longer printed in the notification. Success fades after seven unpaused seconds;
hover/focus/folder action pauses it. Closing the notification does not remove
the status/file or change exact Explorer reveal. See
[HUB_PROJECT_REDESIGN.md](HUB_PROJECT_REDESIGN.md). Historical Stage 13F checks
below describe the panel before this presentation change.

2026-10-29. Local implementation only; no release, installer, push, CMS changes,
archive execution or next stage.

Rust validates the build through the existing fixed CMS endpoint before asking
for a destination. Each interactive download opens the installed Tauri 2 native
folder picker, owned by the main window. Normal PORT proposes the Windows known
Downloads folder plus `PORT`; it creates that default folder when needed. The
path is canonicalized before passing it to the Windows dialog. A previously
chosen folder is not persisted by PORT in this stage.

The archive is saved directly inside the selected folder with the original
validated GitHub asset filename. If that name already exists (including a
directory), a native message offers **Choose another folder** or **Cancel**.
There is no overwrite option. A second existence check precedes the GitHub
request, and the final `persist_noclobber` also protects files created during the
transfer. Reparse/symlink ancestor checks remain in place.

Cancelling either dialog restores the previous download status, including a
previous successful download, without an error or GitHub asset request. CMS
validation itself can already have occurred. The picker and conflict message
hold the single-download slot; cancel them with their native Cancel button.
Network/stream cancellation remains available through the download panel.

Streaming, HTTPS/public DNS pinning, redirect allowlists, size and SHA-256 gates
are unchanged. A unique `.part` lives in the destination directory until verified
and committed. Errors and cancellation drop only this operation's temporary file;
selected directories and their existing contents are never recursively removed.
Forced process termination may leave a `.part`; it is not a completed download.

Rust returns the actual canonical full file path in `hub_download_status.path`.
The panel keeps it out of ordinary presentation. On completion,
**Open folder** uses the existing Tauri opener plugin's Windows shell operation
to reveal that exact file. Missing files fail explicitly; there is no Documents
fallback. Windows shell path normalization is handled by the installed plugin.

## Isolated QA

`scripts/start-cms-qa.ps1` uses the picker by default, with its starting directory
inside `C:\PORT\.local\cms-qa\downloads` to keep QA writes isolated. Select a
test folder inside `C:\PORT\.local`; normal PORT uses Downloads/PORT instead.

For automated transfers only:

```powershell
powershell -NoProfile -File scripts/start-cms-qa.ps1 -DebugWebView -NoDownloadDialog
```

The switch sets `PORT_QA_DOWNLOAD_NO_DIALOG=1` for that process and restores the
previous environment on exit. Rust honors it only with the optional local CMS QA
feature, debug assertions and exact `app.port.cms-qa` identity. The destination
stays fixed to a fresh isolated `downloads/release-*` directory; no destination
or URL can be supplied by frontend IPC. Normal PORT always asks for a folder.

## Checks and limits

- TypeScript passed. Download-panel browser tests cover progress/navigation,
  cancellation, exact Rust-shaped path display, folder action, selection lock,
  cancelled selection and unavailable builds. These use mocked IPC.
- Rust suite: 82 passed, 8 existing opt-in tests ignored. Seven downloader tests
  also run with the local CMS QA feature. They cover byte/hash/URL gates,
  truncation, cancellation cleanup, pre-existing ZIP preservation and no-clobber
  behavior at commit. These transfer tests use synthetic responses.
- Actual debug QA downloaded Zelda64Recompiled v1.2.2 from its approved available
  live CMS build and official GitHub asset. Saved 28,940,501 bytes, independently
  measured SHA-256
  `d02b95f1cf5e4d44d6587fa6136c6db521f61aa41ba8700c05f91bea8b0a26d0`.
  This run used the explicit no-dialog QA flag. Result:
  `.local/cms-qa/downloads/release-dUqYDQ/Zelda64Recompiled-v1.2.2-Windows.zip`.
  The owner's earlier `release-cWFHsK` archive still has that expected SHA-256.
- Real native Open folder IPC succeeded. Windows Explorer accessibility showed
  the `release-dUqYDQ` folder, its PORT/.local/cms-qa/downloads breadcrumbs, the
  exact ZIP and **1 item selected**. This verifies the repaired shell operation.
- The native folder picker was observed in Windows accessibility, and Rust
  reported `selecting` with zero payload bytes. Windows automation then failed
  with `coordinate input geometry is unavailable` / `failed to activate captured
window`; screenshot capture sometimes showed unrelated foreground content.
  Interactive select/cancel/conflict and a live transfer into a manually chosen
  folder remain **manual acceptance checks**, not claimed passes. Initial QA
  picker used a mixed-separator path; it was normalized before the final build.
- Initial browser run reused the running local-CMS Vite server and timed out;
  rerun on a fresh standard-source server passed. It was not a product failure.
- Native result JSON and WebView screenshot stay ignored under
  `.local/evidence/13f`. QA app/debug listener were stopped after checks.

## Manual acceptance

1. From `C:\PORT`, run
   `powershell -NoProfile -File scripts/start-cms-qa.ps1` without
   `-NoDownloadDialog`. Keep the owner's local HTTPS CMS available. Open the
   Zelda project and click **Скачать файл**. Verify a native folder picker.
   Normal PORT proposes `Downloads\PORT`; QA proposes its isolated downloads.
2. Click **Cancel**. No transfer, false error, final file or new Open folder
   action should appear. A previous successful result should remain available.
3. Start again and select
   `C:\PORT\.local\cms-qa\downloads\release-cWFHsK`, containing the existing
   ZIP. Verify the conflict message. Cancel once; then repeat and choose
   **Выбрать другую папку**. Verify the original ZIP remains unchanged.
4. Choose an empty test folder, for example
   `C:\PORT\.local\13f выбранная папка`. Finish the transfer. Check the panel's
   exact path, original filename, size and hash above. No `.part` should remain.
5. Click **Открыть папку** and verify that exact file is selected in Explorer.
   Close Explorer without running or extracting the archive.
6. In a fresh empty folder, cancel during streaming. Only this transfer's `.part`
   should disappear. Keep an unrelated test file there and confirm it survives.

The native picker uses the existing
[Tauri 2 dialog API](https://v2.tauri.app/plugin/dialog/); no new dependency or
frontend filesystem permission was added.
