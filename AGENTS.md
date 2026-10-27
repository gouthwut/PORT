# PORT// — instructions for future sessions

Read AGENTS.md and PROGRESS.md first in every session.

PORT is a Windows launcher for independently developed native console ports. Current authorization covers Stage 00 Foundation and Stage 01 UI Prototype only. Do not implement Stage 02 without a new user request. Never imply arbitrary encrypted PS4 PKG support.

Stack: Tauri 2, Rust, SQLite (rusqlite), React, TypeScript, Tailwind 4, Radix/shadcn-style components, Motion, Playwright. Frontend is in src/, native backend in src-tauri/, service contracts in src/domain.ts. One collection may own multiple display titles and one shared runtime. Do not invent launch arguments.

Quality: accessible keyboard navigation, explicit unavailable states, no fake downloads/installations, responsive layouts, original SVG artwork only. Native settings use SQLite in the Tauri app-data directory; browser preview uses clearly identified localStorage. Keep persistence implementations consistent.

Checks: npm ci; npm run build; npm test; cargo fmt --manifest-path src-tauri/Cargo.toml -- --check; cargo test --manifest-path src-tauri/Cargo.toml; npm run tauri build -- --no-bundle. Launch the actual native exe after backend changes. Tests run in Chromium; they are not proof of native behavior. Save screenshots and distinguish browser/native evidence.

Use small meaningful Git commits. Do not commit game data, packages, secrets, build outputs or downloaded upstream code. Ask the user about repository visibility before creating a GitHub repository. Do not assume connector authentication authenticates git/gh.

Update PROGRESS.md after significant tasks; it records checks, limitations and the next step. ROADMAP.md defines stage gates. docs/ARCHITECTURE.md and docs/DESIGN.md explain contracts and design. docs/UPSTREAM.md is dated upstream research; reverify before integration. Future extraction must remain local with traversal/symlink/bomb checks and verified download origins/checksums.
