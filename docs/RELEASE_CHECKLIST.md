# PORT 1.0 — remaining release work

Updated 2026-10-30. This is the single active release checklist. The owner's
FINAL RELEASE DEVELOPMENT request supersedes older stage-only restrictions.
PORT is the Windows application; HUB is its catalog, not a separate product.
CMS stays private, with local commits and no further CMS push. Production deploy,
migration, restore and destructive operations require separate permission.

Status: **in development, not ready for public release**.

| Work | Current evidence / remaining work |
| --- | --- |
| Resume interrupted CMS recovery | Local source preserved; exact `_cf_KV` exclusion fixed; private recovery route, pinned maintenance config/caller and session invalidation prepared. New remote synthetic SQL/KV restore/undo/auth invalidation PASS; 6 focused local tests PASS, TypeScript and maintenance dry-run PASS. See private CMS `STAGE16C_FINAL_RECOVERY.md`. Local commit pending. |
| Existing CMS acceptance | Retain prior snapshot/restore, migration/reconciliation, owner OAuth, staging operator, PITR SQL/KV/undo and 101 pass/0 fail/2 skip. Alarm timestamp restored but automatic firing failed observation; explicit rearm passed. Independent non-owner OAuth UNVERIFIED without second account. |
| CMS images | Owner attestation permits use/publication of all 21 inventoried images. Images retained and served by CMS; no need to package them in public source. |
| Catalog integration | Existing local v2 editor/API/client work. Production still serves old code with v2 anonymous 401. Prepare client improvements locally, then perform separately approved final-freeze backup/checkpoint/deploy/content migration and real native delivery acceptance. |
| Catalog usability | Include compatibility runtimes with accurate labels, automatic refresh and offline behavior; verify search/filters/detail/instructions/media/official releases without developer text. |
| Library and supported installs | Existing Bloodborne/Skate native engines/schema 4 remain. Restore access through current shell, connect only verified adapters; preserve identities/paths/profiles/saves and shortcut requests. Downloaded archives never imply an installed game. |
| Downloads | Existing native picker/HTTPS/hash/no-clobber/cancel/retry/history and isolated installed Windows E2E PASS. Add safe resumable transfer with upstream identity/range validation and durable state; verify actual official release through approved production API. |
| Accounts and community | Not implemented. Separate user identity/session storage from owner CMS OAuth; profile, one rating/like per user/project, create/delete own review, aggregates, rate limits, CSRF/user ownership and CMS moderation. No forum/messages/friends/feed. |
| UI and localization | Keep Premiere Compact / Liquid Glass. Finish connected Library/Profile and responsive four-language screens; ordinary users must see no Stage/fixture/test details. Existing four-language catalog/download/settings coverage is partial. |
| Launcher updates | Official signed Tauri updater implemented and isolated upgrade tested. Production signing-key custody/public channel remain unconfigured; prepare secure concrete owner action and real signed update acceptance. No unsigned automatic updates. |
| Public source audit | Audit complete reachable PORT history, current tree, CI and release contents for credentials/private data/artwork. Preserve existing history; do not expose CMS/SQL/backups. Verify source-only release build reproducibility and notices. |
| Windows installer | Existing local unsigned NSIS install/upgrade/uninstall/data retention PASS. Rebuild final version, complete third-party notices/readme/changelog and test clean Windows without development tools. Existing machine is not clean-machine evidence. |
| Final audit | Relevant frontend/TS/Rust fmt/tests/Clippy/Playwright/release build, native restart/library/offline/download/accounts/reviews/update/files/privacy checks. Retain valid earlier results; rerun checks affected by changes. |
| Publish | Only after audit and production acceptance: safe PORT source push, public visibility and verified GitHub Release installer. CMS never public and no CMS push. Do not label a test binary stable. |

The next implementation work is catalog integration, followed by library/downloads,
accounts/reviews, localization/updater and final publication. Do not request final
production approval until the candidate and all feasible local/staging checks are
concrete and reviewable. Clean-Windows availability and key custody must be reported
honestly; elapsed time is not approval or verification.
