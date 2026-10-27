# Roadmap

## Stage 04C — online catalog client foundation

Authorized 2026-10-27. Versioned published metadata/API contract, configurable public HTTPS synchronization, bounded validation and local image/catalog cache, dynamic client cards/details, offline library independent of publication. CMS is not deployed; default data is an explicitly labelled local fixture. Installer adapters remain compiled/allowlisted; Bloodborne 1.09 installation/runtime/profile must remain unchanged. See docs/CATALOG.md and actual exit evidence in PROGRESS.md.

## Stage 05 — PORT Catalog CMS (future)

Separate private web project: owner authentication, draft/editor workflows, authorized image uploads/optimization, free infrastructure selection, atomic publication to a stable public v1 HTTPS endpoint and end-to-end client synchronization. No CMS source/secrets in the public client repository. Stage 04C does not authorize creating hosting accounts or this admin project. Additional game installers require independent reviewed adapters, not catalog-provided code. Distribution/signing gates in the historical table remain separate.

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
