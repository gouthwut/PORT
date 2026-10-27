# Roadmap

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
