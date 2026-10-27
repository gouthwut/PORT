# Roadmap

## Stage 05C — production catalog integration

Authorized 2026-10-27. Verified real anonymous HTTPS API and six immutable WebP assets, embedded stable default endpoint, developer-only override/diagnostics, production interface without fixtures, automatic refresh and durable offline cache. Actual native release receives Bloodborne with the existing one-record 01.09 library/Play preserved. Publication changes/unpublication/network failures use isolated tests; no owner publication was changed. See current PROGRESS for final verification, commits and CI. Metadata publication needs no client rebuild; new installation methods still need reviewed compiled adapters. Earlier deployment-pending entries below are historical.

## Stage 04E — Dark Violet Liquid Glass UI/UX

Authorized 2026-10-27. Visual layer, typography, player-facing copy and existing screen composition only. Inspect local references and Figma, create a coherent editable direction, implement in React/CSS, preserve navigation and all Stage 04A–04D handlers. No Rust/schema/library/runtime/PKG/update/path/shortcut changes, no CMS or new games. Exit evidence: before/after screenshots, keyboard/reduced-motion/responsive review, existing regression suite, native release startup, exact Bloodborne 01.09 preservation, commits/push and Windows CI. Actual outcomes and limits are recorded in PROGRESS.md.

## Stage 04D — installation experience and library management

Authorized 2026-10-27. Retain PKG selection/validation and installation/recovery; add destination preflight and native folder picker, explicit shortcut opt-in after successful commit, safe ID-based cold/warm launcher entry, and accessible installed-card context menus including Explorer. Keep schema 4 and the existing Bloodborne 1.09 registration/files/profile exact. Use temporary fixtures for new actions; release startup and preservation checks are required. No CMS, new adapter, move-game feature, PKG algorithm change or production catalog endpoint. See PROGRESS.md for actual exit evidence.

## Stage 04C — online catalog client foundation

Authorized 2026-10-27. Versioned published metadata/API contract, configurable public HTTPS synchronization, bounded validation and local image/catalog cache, dynamic client cards/details, offline library independent of publication. CMS is not deployed; default data is an explicitly labelled local fixture. Installer adapters remain compiled/allowlisted; Bloodborne 1.09 installation/runtime/profile must remain unchanged. See docs/CATALOG.md and actual exit evidence in PROGRESS.md.

## Stage 05A — PORT Catalog CMS (authorized, deployment pending)

Authorized 2026-10-27: separate PRIVATE project at `C:\PORT-CMS`, owner-only GitHub OAuth, server-persisted drafts/editor, authorized WebP uploads, transactional publication/history/rollback and a public v1 endpoint using free infrastructure. Local implementation selects Workers Free + SQLite Durable Object because KV cannot atomically guarantee snapshot/media visibility. No paid products or R2. Actual local checks and private repository are recorded in PROGRESS.md. Cloudflare owner login and OAuth App configuration are required before deployment. No real site/API URL exists yet; keep the client's labelled fixture and existing configuration until a verified live endpoint can become the automatic first-run default. Exit criterion remains real internet publication/unpublication reaching the native Windows client while its existing Bloodborne 1.09 installation/profile/library remain intact. Additional installers still require independent reviewed compiled adapters. Distribution/signing gates remain separate.

## Stage 04B — narrow Bloodborne 1.09 update

Authorized separately on 2026-10-27. The user subsequently requested IN-PLACE updates and one library card. Keep the installation identity/paths, stage the confirmed patch only, and use schema 4 per-file undo/recovery before committing 01.09. Consolidate the already verified separate 1.09 without losing its current profile, preserve the older profile as backup, then retire only the duplicate game payload/row. Reuse the worker, path/hash boundaries and process guards. Actual exit evidence is recorded in PROGRESS.md. General deltas, update catalogs and combined initial base+update automation remain deferred.

## Stage 03 authorization and current override — 2026-10-27

The user explicitly authorized real Bloodborne installation/library/launch and clarified PKG-only input as the desired path. Stage 02D is **no longer gated on arbitrary PKG decoding**: prepared-folder import is independent, and a narrow compatible fake-PKG base path now has its own bounded worker. Both actual package trees were read successfully. Core installer/runtime/SQLite/library/verification/removal/launch code is implemented; actual full-install/gameplay exit evidence is recorded in PROGRESS.md and must be checked before marking this stage complete. General retail/encrypted formats and update application remain unimplemented. NSIS, other games/themes and distribution are out of scope. The dated Stage 02 table below is historical.

The requested core Stage 03 criterion is achieved for supplied **CUSA03173 base 1.00**: real PKG installation, runtime, persistent library and launch to the **user-confirmed main menu**. Actual folder import/cancel/retry/integrity/removal and native failure/restart/cache checks passed. Automatic repair, update application and in-world/long gameplay coverage remain future scope; these broader items are not marked complete.

| Stage                                  | Scope                                                                                                                  | Exit criteria                                                                          |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 00 Foundation                          | Environment, Git, CI, docs, GitHub setup                                                                               | Reproducible local setup; remote if authorized                                         |
| 01 UI Prototype                        | All launcher screens, native shell, persistent settings, honest empty states                                           | Native launch, frontend tests, screenshots, documented limitations                     |
| 02 Installer research & implementation | Separately authorized: verified file formats, release manifest, local validation, safe extraction, resumable downloads | Real compatible user-owned data tested, integrity/failure recovery and security checks |
| 03 Library & runtime                   | Shared collection install, verified launch lifecycle, repair/remove                                                    | No invented per-title CLI; safe saves and uninstall                                    |
| 04 Distribution                        | Signed installers, update channel, accessibility and hardware QA                                                       | Release checklist and license compliance complete                                      |

## Stage 02 authorization — 2026-10-27

The user authorized Bloodborne UI, verified runtime downloads, local PKG handling and installer/library integration with an explicit critical-blocker gate.

| Substage                   | Current state                                                                                                                   | Remaining gate                                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 02A Bloodborne UI          | One-title catalog, original shell, private offline bundled art, optional overrides and keyboard gallery                         | Personal build artwork verified offline; public redistribution rights remain unconfirmed; see docs/LOCAL_ART.md                          |
| 02B Research / downloader  | SuperMedo windows-v1.9.4 selected; pinned release API/digest, streamed transfer, pause/Range resume/cancel, hash/ZIP validation | Native end-to-end evidence recorded in PROGRESS.md; downloaded components are not an installation                                        |
| 02C PKG                    | Single native multi-picker, bounded CNT/SFO + PFS encryption metadata; tested replacement writer lab                            | PFS/PFSC reader bounds/cycle audit and supported lawful payload access; writer tests alone do not clear integration                      |
| 02D Installation / library | Gated; no game installs, launch, repair or removal                                                                              | Harden/test decoder; encrypted user payloads not extracted; establish data/patch/launch contract, then atomic install and SQLite records |

Stages 03/04 outside the installation/library scope explicitly requested here remain future work. Do not mark Stage 02 complete until user-file integration and native gameplay evidence satisfy its gates.

## Stage 06 — Skate 3 adapter

Authorized: compiled Skate 3 native-recompilation adapter, read-only owner ISO validation and real isolated/native installation/launch checks, shared lifecycle, exact future CMS identity. CMS publication/admin/Cloudflare changes are forbidden; owner alone publishes the card. See docs/SKATE3.md and PROGRESS.md for completion evidence and limits.
