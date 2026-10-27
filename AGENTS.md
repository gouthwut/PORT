# PORT// — instructions for future sessions

Read AGENTS.md and PROGRESS.md first in every session.

PORT is a Windows launcher for independently developed console game runtimes. Describe bbport/shadPS4-derived execution and Vulkan translation accurately; do not imply an official native PC release. Stage 02 Bloodborne is authorized by the 2026-10-27 requests, including installer/library integration within explicit gates. A replacement extractor writer is tested only in tools/extractor-lab; Stage 02C extraction and Stage 02D remain gated by unaudited PFS/PFSC decoding and encrypted user payloads. Inspect docs/UPSTREAM.md before continuing. Never imply arbitrary encrypted PS4 PKG support.

Stack: Tauri 2, Rust, SQLite (rusqlite), React, TypeScript, Tailwind 4, Radix/shadcn-style components, Motion, Playwright. Frontend is in src/, native backend in src-tauri/, service contracts in src/domain.ts. One collection may own multiple display titles and one shared runtime. Do not invent launch arguments.

Quality: accessible keyboard navigation, explicit unavailable states, no fake downloads/installations, responsive layouts, bundle only original or redistribution-authorized artwork in public builds. The continuation request authorizes private local artwork packaging (docs/LOCAL_ART.md); ignored src/assets/bloodborne-local/ is embedded in personal builds, never committed or hotlinked. Screenshots containing it stay in ignored .local/evidence/. Native settings use SQLite in the Tauri app-data directory; browser preview uses clearly identified localStorage. Keep persistence implementations consistent.

Checks: npm ci; npm run build; npm test; cargo fmt --manifest-path src-tauri/Cargo.toml -- --check; cargo test --manifest-path src-tauri/Cargo.toml; npm run tauri build -- --no-bundle. Launch the actual native exe after backend changes. Tests run in Chromium; they are not proof of native behavior. Save screenshots and distinguish browser/native evidence.

Use small meaningful Git commits. Do not commit game data, packages, secrets, build outputs or downloaded upstream code. Ask the user about repository visibility before creating a GitHub repository. Do not assume connector authentication authenticates git/gh.

Update PROGRESS.md after significant tasks; it records checks, limitations and the next step. ROADMAP.md defines stage gates. docs/ARCHITECTURE.md and docs/DESIGN.md explain contracts and design. docs/UPSTREAM.md is dated upstream research; reverify before integration. Future extraction must remain local with traversal/symlink/bomb checks and verified download origins/checksums.
