# Contributing to PORT

Thank you for your interest in contributing to PORT!

PORT is an open-source Windows application for discovering native PC ports, recompilations, and decompilations, viewing project requirements and setup guides, and downloading official developer releases.

---

## Guidelines

- **Focus**: Contributions should improve discovery, project information, user experience, accessibility, localization, or download stability.
- **Scope**: PORT is strictly a discovery and download manager. It does not install, run, or distribute games, ROMs, ISOs, or closed game data.
- **Safety**: Do not commit copyrighted game data, private keys, or non-redistributable assets.
- **Architecture**: Review [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/CATALOG.md](docs/CATALOG.md) before making architectural changes.

---

## Development Setup

Requirements:

- Windows 10 or 11
- Node.js 22+ (LTS recommended)
- Rust stable (MSVC toolchain)
- Microsoft Visual Studio C++ Build Tools
- Microsoft Edge WebView2

### Build and Test Commands

```powershell
# Install frontend dependencies
npm ci

# Typecheck and build frontend
npm run build

# Run Playwright tests
npx playwright test

# Check Rust formatting and tests
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
```

---

## Localization

PORT supports five languages: **English, Russian, Spanish, French, and German**. Translations are maintained in:

- `src/hub/translations.json`

Contributions to improve translation accuracy or expand language support are welcome.

---

## Security

Please report any security vulnerabilities responsibly according to our [Security Policy](SECURITY.md).
