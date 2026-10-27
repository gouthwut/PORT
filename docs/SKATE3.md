# Skate 3 adapter — Stage 06

This is an installation adapter, not a catalog publication. No CMS source, admin API, Cloudflare configuration, draft or published record is changed. `fixtures/catalog/skate3-v1.json` is an explicit test/example document and is never imported by the release application. Only an owner's future publication adds the online card.

## Pinned upstream

Reviewed 2026-10-27: [latest release v2.0.2](https://github.com/mchughalex/skate3recomp/releases/tag/v2.0.2), source commit `f6e0ae87fdfecbadb5c1e36c55d66a744187a3cd`, rexglue submodule `7eb0faf7787f5e01333c228b8e3f03c32f7295ea`. Windows asset `Skate3Recomp-Windows.zip`, 30292532 bytes, GitHub asset ID 488835902, SHA-256 `b9785b9f3ba6f8180268dc5ea26ed2ec7b64af46a4c04219a33236c64bc65a17`. The ZIP contains only `Skate3Recomp-Windows/skate3.exe` (101586944 bytes) and `rexruntime.dll` (18671616 bytes), plus its directory. The downloaded archive independently matched GitHub's digest.

The [project README](https://github.com/mchughalex/skate3recomp/blob/v2.0.2/README.md) describes an unofficial native recompilation with native Direct3D 12/Vulkan rendering and an optional emulated-renderer fallback. PORT launches this recompilation, not Xenia/RPCS3. Windows x64, suitable graphics drivers and a controller are upstream's intended environment; independently established minimum CPU/RAM requirements are unavailable. Do not publish invented minimums or imply an official PC release.

**License:** the tagged repository has no project LICENSE and GitHub reports `license: null`; the Windows archive contains no license notices. Do not label the project MIT/GPL or infer redistribution permission. PORT stores only original adapter code and downloads the owner's selected upstream release on demand; upstream source/binaries are ignored and are not redistributed in PORT. Redistribution of upstream binaries/source requires separate license clarification, including dependency obligations.

## Import and validation

Reviewed [ISO importer](https://github.com/mchughalex/skate3recomp/blob/v2.0.2/src/skate3_iso_installer.cpp): official GUI selects ISO, reads XDVDFS at one of five fixed partition offsets, walks directory records and copies file extents. It does not mount/decrypt the ISO. It also exposes `SKATE3_INSTALL_ISO`, but the application continues into game startup after importing. PORT uses an original bounded Rust reader for those same ordinary XDVDFS extents. The shipped Windows binary additionally requires Title Update 3, discovered and confirmed by actual native startup. After copying the ISO, PORT opens the official TU3 wizard in staging; the user chooses download or a local package, completes the wizard, then closes the game window. PORT supplies no update URL or consent click and does not download the commercial payload itself. Only then are both pinned TU3 payloads and all immutable bytes verified and registered. No blind GUI automation or registration based on process creation.

The reader holds the source open read-only (Windows denies write/delete sharing), checks both volume magic strings, partition/directory/node/file ranges, cycles/count/depth/expansion limits, case collisions, Windows device names and traversal, overlapping file extents, XEX2 optional-header bounds and execution Title ID `454108E6`. Only one-disc retail base data with Title ID 454108E6, Media ID 5C087C2C, version 3.0.0.0 and required content/Webkit/boot/shader files is accepted. Region is not certified. No general Xbox ISO, arbitrary title-update, DLC, STFS, encrypted-volume or DRM/key reader is implemented in PORT. The official upstream TU3 wizard handles its own package format. XEX identification and copied-file hashes are not authenticity or gameplay proof.

Shared destination preflight returns `PORT-Skate3-<stable-id>` and checks local/non-system paths, installed-root overlaps, space and exclusive writes. Backend rechecks using actual ISO inventory. Fixed HTTPS artifact destinations and a compiled digest pin are independent of CMS metadata. The primary GitHub download can fall back to its fixed official asset API; redirects use the existing GitHub host allowlist. Size/SHA-256/ZIP layout/CRC/file-size/PE checks precede finalization. Cancellation is cooperative between bounded reads; blocked network requests can delay cancellation up to existing timeouts. Interrupted downloads are retried from the beginning.

The shared schema-4 `installation_jobs` intent precedes staging. Original data and runtime are streamed/hashed with exclusive creation; every staged byte is re-read before rename/SQLite commit. Errors/cancellation clean owned staging; an interruption after directory commit is recovered only after manifest/full-data verification. Unresolved/corrupt journals preserve evidence and surface recovery errors. Existing Bloodborne records and update journals are not migrated. The official setup process is confined to a kill-on-close Windows Job Object, with a 30-minute deadline and cooperative cancellation. It may start the game after acquiring TU3; close that window to allow final verification/commit. A read-only held executable denies upstream's optional icon self-patch, retaining the pinned hash and process path. On cancellation/error/restart, any staging user-data is moved to a no-overwrite `.port-profile-<id>` sibling before payload cleanup. Saves created while testing setup are preserved.

## Lifecycle and saved data

`game/` contains copied ISO data and the two owner-authorized TU3 payloads; `skate3-runtime/` contains the pinned two Windows files. `port-manifest.json` hashes immutable game/runtime bytes. Shared verify, process-path duplicate launch protection, local-ID Explorer action, strict launcher shortcuts and confirmed removal apply to this adapter.

Reviewed [upstream path handling](https://github.com/mchughalex/skate3recomp/blob/v2.0.2/src/skate3_app_common.cpp): upstream normally uses `%APPDATA%/skate3`, with `saves`/`portable.txt` overrides. PORT uses documented SDK cvars `--game_data_root=<local game>` and `--user_data_root=<installation>/user-data`, plus `--log_file=<user-data>/skate3.log`; the working directory is user-data. Existing external saves are neither migrated nor removed. Settings, profiles, saves, caches and logs are excluded from the immutable manifest. Runtime configuration cannot come from CMS.

Uninstall removes only inventoried files below `game/` and the SQLite registration, then an unchanged owned shortcut. It retains `user-data`, runtime, source ISO and unknown added files. Isolated tests verify retention; the real user's installed payload is retained for use. A same-user hostile process racing filesystem changes is outside the existing installer's confinement guarantees.

## Owner's Catalog Studio fields

| Field                  | Value                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `id`                   | `skate3`                                                                                                                        |
| `collectionId`         | `skate3`                                                                                                                        |
| `adapterId`            | `skate3`                                                                                                                        |
| Title                  | `Skate 3`                                                                                                                       |
| `implementation`       | `recompilation`                                                                                                                 |
| `sourceConsole`        | `Xbox 360` (exact spelling)                                                                                                     |
| `windowsBuild`         | `available`                                                                                                                     |
| `project.github`       | `https://github.com/mchughalex/skate3recomp`                                                                                    |
| `project.authors`      | `mchughalex and contributors`                                                                                                   |
| `project.license`      | `No project license declared in upstream v2.0.2; dependency notices apply`                                                      |
| `compatibility.status` | `experimental` (owner reports working gameplay; broad compatibility unverified)                                                 |
| `requiredFiles`        | Own compatible retail Xbox 360 XDVDFS ISO, Title ID `454108E6`; Title Update 3 required through official setup; DLC unsupported |

Fill description, genres, tags, requirements and compatibility notes with truthful editorial text. Use only authorized images through the existing CMS. All three IDs, implementation and source platform must match; foreign metadata cannot borrow this adapter. The full local example is [skate3-v1.json](../fixtures/catalog/skate3-v1.json). The owner alone creates/publishes the card. An unpublished installed game remains available in the library; publication never changes its files/profile.

Actual native results, preservation evidence, checks and limitations are recorded in [PROGRESS.md](../PROGRESS.md).

## Required Title Update 3

The published Windows binary executes TU3 code. Required immutable outputs, pinned from upstream `skate3_title_update_installer.cpp`:

| Relative game path          |   Bytes | SHA-256                                                            |
| --------------------------- | ------: | ------------------------------------------------------------------ |
| `default.xexp`              | 1701888 | `eb9ef9109dfa6d940df2e156e7eaeda4603d2b2319ca6451f324b1c27f2b1f4c` |
| `data/webkit/EAWebkit.xexp` |    4096 | `5d4a308d2a6c768fc27c8b62ccb6661171dc504f8c0011a3e116cf0074e09438` |

Missing/mismatching payloads prevent registration, recovery and normal launch. The owner completed the actual official download wizard themselves and reported that the game works. PORT never scraped an update service or acquired this payload through tools. There is no claim of ISO-only startup for v2.0.2.
