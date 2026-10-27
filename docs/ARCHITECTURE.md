# Architecture

PORT is an offline-first Tauri 2 Windows application. Vite builds React/TypeScript into static assets embedded in the native executable. Web preview is for frontend development, not the desktop deliverable.

## Components

| Location                     | Responsibility                                                                   |
| ---------------------------- | -------------------------------------------------------------------------------- |
| src/App.tsx                  | Screens, navigation, dialogs, search, state                                      |
| src/components/ui.tsx        | Small shadcn-style Radix primitives, CVA buttons                                 |
| src/components/Landscape.tsx | Original resolution-independent artwork                                          |
| src/domain.ts                | CatalogService, InstallerCore, GameAdapter, Installation, InstallEvent contracts |
| src/services/settings.ts     | Native IPC / explicit browser-preview storage boundary                           |
| src-tauri/src/main.rs        | Tauri commands, validated settings, SQLite                                       |
| tests/                       | Playwright frontend behavior and screenshots                                     |
| .github/workflows/           | Windows checks and optional Pages deployment                                     |

## Persistence and IPC

`load_settings() -> Settings`, `save_settings({settings}) -> ()`, `reset_settings() -> Settings` remain the settings IPC commands. JSON uses camelCase. SQLite lives at Tauri's app_data_dir()/port.db (Windows: %APPDATA%/app.port.launcher/port.db), schema user_version=2, one validated settings JSON record, serialized with a Mutex and atomic SQLite upsert. A failed save does not change visible settings; errors are shown, never silently replaced with a browser fallback. Native startup returns an error if the database cannot open; it does not silently replace the database. Browser preview uses localStorage key port.settings.v1 and is labelled WEB PREVIEW.

Settings include dark/system theme, future install directory, reduced motion and compact cards. Folder picker uses the native dialog plugin, then stores only an absolute path. Settings operations never read or move game files; PKG inspection is a separate read-only command. Reset only deletes PORT's settings record. There is no pretend installed-library database: installation records will arrive with Stage 02/03 migrations.

## Stage 02 implementation

The active adapter/catalog has one Bloodborne title and retains the generic Collection/multiple-title model. The runtime source is Supermedo/bloodborne_pc. `entrypoint=Bloodborne.exe` records upstream documentation; no process-launch command is exposed.

- `src/components/BloodborneMedia.tsx`, `src/services/media.ts`: local raster import, bounded WebP re-encoding, separate hero/cover/banner/gallery. Native `load_media` / `save_media` commands persist validated data URLs in SQLite `media`, schema user_version=2. Migration adds the table without changing existing settings; reset_settings still resets only settings. Preview uses `port.media.v1` localStorage, reports quota errors, never falls back silently from native storage.
- `src-tauri/src/package.rs`: asynchronous blocking-worker `inspect_package({path})`, read-only local file access, absolute-path and ancestor symlink/reparse rejection. Validates fixed header and bounded metadata table/SFO reads, reports unknown version explicitly. No package data is sent over the network. Metadata is not authenticated and installable/compatible remain false while extraction is gated. `inspect_packages({paths})` accepts 1–8 files, returns per-file errors plus a selection assessment: roles require matching CNT content flags and SFO CATEGORY (gd/gp); validates version syntax, SFO/header Content ID, exact base/update Content ID and Title ID, version progression, conflicts, missing base and unsupported delta/unknown types. metadataCompatible is separate from installable. Reads the bounded PFS superblock encryption marker without decoding payloads. No filename/size heuristics. The single inspector remains for backward-compatible read-only callers.
- `src-tauri/src/download.rs`: `start_download`, `download_status`, `control_download({action})` implement one process-wide task. Multiple panels observe the same backend state. Download URL/tag/size/hash are compiled from runtime-manifest.json; external release metadata can confirm them but cannot replace them. Runtime staging paths are fixed beneath app_cache_dir/runtime, never frontend supplied. File lock prevents simultaneous cache writers across PORT processes; ancestors are checked for reparse points.
- States: idle → connecting → downloading ⇄ paused → verifying → ready, with error/cancelled branches. UI guards mutations; Rust enforces one active worker. Closing a dialog does not cancel a task. Explicit cancellation removes only the known app-owned partial file while holding its lock. Errors preserve partial bytes; retry validates the pinned release and uses HTTP Range. Server 200 on resume restarts with free-space recheck. Server 206 requires an exact Content-Range/length. The final SHA-256 covers resumed bytes. A process exit may leave a partial file which the next explicit start resumes; task status itself is in memory, not an installation DB record.
- Cache verification reads bounded ZIP entries/CRC without extraction. Transfer has connect/request timeouts (15/120 s); pause/cancel are cooperative between reads. A blocked network read may delay controls up to that timeout. Failed hash removes the partial file; existing verified cache is rehashed before reporting ready. Finalization renames only within the cache, refusing to replace an existing destination.

Only GitHub HTTPS requests for pinned runtime metadata/bytes are made. No arbitrary frontend HTTP/shell access, DRM keys, extractor execution or game-data upload. Opener allowlist now targets Bloodborne's source repository. CSP still accepts only self/data images. ZIP size/ratio/path checks are runtime-cache validation, not a claim of safe PKG extraction. No install target writes, data copies, full installation disk-space checks, installation records, repair/remove, saves access or game execution exist while the Stage 02C gate remains unresolved. See UPSTREAM.md for the source evidence and next gate.

## Continuation: private artwork and extractor lab

`src/services/bundled-media.ts` uses a build-time Vite glob over ignored `src/assets/bloodborne-local/*.webp`. Optional files become executable assets; a clean public checkout has no restricted art and still builds. The persisted MediaSet remains an override record, not a copied bundle manifest: `resolveMedia` chooses per-slot overrides then bundled defaults. Neither SQLite schema nor settings reset changes. See LOCAL_ART.md for provenance, packaging and private evidence handling.

In native, mounting the installation panel opens one standard multiple-file picker; the same button can retry after cancellation/error. React's duplicate development effect is guarded. Browser preview keeps file access disabled. The UI lists detected components and errors, never calls a synthetic install or exposes Play. No progress is fabricated for metadata inspection.

`tools/extractor-lab` is isolated developer code, no IPC or runtime integration. Its bounded writer receives streams and stages atomically without overwriting an existing target. 33 Windows checks run without upstream. An optional exact-revision source reference drives generated unencrypted PFS fixtures through the existing PfsReader into the new writer. No downloaded source, binaries or keys are tracked. Decoder allocation/traversal/PFSC audit and production process confinement remain unresolved; this lab must not be used as a general PKG validator. Actual user packages are never passed to it. See its README and UPSTREAM.md.
