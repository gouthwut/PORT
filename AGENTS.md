# PORT// — instructions for future sessions

Read AGENTS.md and PROGRESS.md first in every session.

PORT is a Windows launcher for independently developed console game runtimes. Describe bbport/shadPS4-derived execution and Vulkan translation accurately; do not imply an official native PC release. Stage 03 is authorized by the 2026-10-27 requests, including actual prepared-folder/compatible base-PKG installation, runtime/library/launch. Both supplied PKGs passed bounded fake-PKG mechanism/tree diagnostics; their encryption bit was not a conclusive blocker. Original bounded PFS/PFSC readers plus the existing writer are integrated through an optional pinned-source worker; see tools/pkg-worker/README.md. No arbitrary encrypted/retail PS4 PKG support or update application is promised. Inspect docs/UPSTREAM.md and actual native results in PROGRESS.md before continuing or claiming gameplay.

Stage 04B authorizes only the confirmed cumulative CUSA03173 01.09 update contract in tools/pkg-worker/README.md; earlier no-update statements are historical for that one package. Preserve the primary 1.00 installation/registration/profile. Update creates one space-checked separate installation/profile and registers 01.09 only after full readback. No general delta/deletion support is promised. Combined base+update installation remains a two-step workflow. Read actual results in PROGRESS.md.

Stack: Tauri 2, Rust, SQLite (rusqlite), React, TypeScript, Tailwind 4, Radix/shadcn-style components, Motion, Playwright. Frontend is in src/, native backend in src-tauri/, service contracts in src/domain.ts. One collection may own multiple display titles and one shared runtime. Do not invent launch arguments.

Quality: accessible keyboard navigation, explicit unavailable states, no fake downloads/installations, responsive layouts, bundle only original or redistribution-authorized artwork in public builds. The continuation request authorizes private local artwork packaging (docs/LOCAL_ART.md); ignored src/assets/bloodborne-local/ is embedded in personal builds, never committed or hotlinked. Screenshots containing it stay in ignored .local/evidence/. Native settings use SQLite in the Tauri app-data directory; browser preview uses clearly identified localStorage. Keep persistence implementations consistent.

Checks: npm ci; npm run build; npm test; cargo fmt --manifest-path src-tauri/Cargo.toml -- --check; cargo test --manifest-path src-tauri/Cargo.toml; npm run tauri build -- --no-bundle. Launch the actual native exe after backend changes. Tests run in Chromium; they are not proof of native behavior. Save screenshots and distinguish browser/native evidence.

Use small meaningful Git commits. Do not commit game data, packages, secrets, build outputs or downloaded upstream code. Ask the user about repository visibility before creating a GitHub repository. Do not assume connector authentication authenticates git/gh.

Update PROGRESS.md after significant tasks; it records checks, limitations and the next step. ROADMAP.md defines stage gates. docs/ARCHITECTURE.md and docs/DESIGN.md explain contracts and design. docs/UPSTREAM.md is dated upstream research; reverify before integration. Future extraction must remain local with traversal/symlink/bomb checks and verified download origins/checksums.
