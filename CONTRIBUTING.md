# Contributing to PORT

PORT's public scope is a Windows project catalog and download manager. Contributions
should improve discovery, project information, accessibility, localization or safe downloads.
Read AGENTS.md and the current PROGRESS.md entry before working in this repository.

Discuss substantial changes in an issue first. Keep pull requests focused, describe the
user-visible result and include the checks you ran. Label browser, native Windows and
mocked evidence accurately. Existing data, settings and downloaded files must be preserved.

## Development

Use Node.js 24, Rust stable/MSVC, Windows C++ Build Tools, a Windows SDK and WebView2.

```powershell
npm ci
npm run build
npx playwright install chromium
npx playwright test tests/beta1.spec.ts tests/hub-api-v2.spec.ts tests/stage19b-release.spec.ts
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --locked --manifest-path src-tauri/Cargo.toml
```

Run the current Hub suites affected by your change. Older installer-era UI suites target
retired screens and should not be presented as acceptance for the current application.
For native changes, build and exercise an isolated Windows copy. Do not use the owner's app data.

## Content and security

Never submit credentials, CMS private source/backups, game dumps, ISO/PKG/ROM files,
private artwork, personal paths in screenshots or generated build outputs. Only include
assets with documented redistribution permission. Project downloads must stay on reviewed
official HTTPS sources and must not be executed automatically.

Report vulnerabilities privately using SECURITY.md. Do not include tokens or private game
files in issue reports. Translation corrections are welcome for English, Russian, Spanish,
French and German; preserve stable IDs, URLs, file names and integrity hashes.
