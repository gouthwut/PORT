# PORT Architecture

PORT is an open-source Windows application designed to discover, track, and download native PC ports, recompilations, and decompilations. Built on **Tauri v2** (Rust + React 19 / TypeScript), it combines high performance and native system integration with a modern, responsive user experience.

---

## 1. System Overview

PORT operates as an independent discovery and download client:

```
┌────────────────────────────────────────────────────────┐
│                   PORT Windows Client                  │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │           React 19 + TypeScript UI               │  │
│  │   • Home (Featured Carousel & Discoveries)       │  │
│  │   • Catalog (Filters, Search, Platforms)         │  │
│  │   • Project Details (Specs, Guides, Releases)    │  │
│  │   • Download Manager (Progress & History)        │  │
│  │   • Settings & Multi-Language Preferences        │  │
│  └────────────────────────┬─────────────────────────┘  │
│                           │ Tauri IPC                  │
│  ┌────────────────────────▼─────────────────────────┐  │
│  │                 Rust Core Runtime                │  │
│  │   • Native HTTP Engine (reqwest)                 │  │
│  │   • SQLite Database (rusqlite)                   │  │
│  │   • Background Download Pipeline                 │  │
│  │   • Cryptographic Minisign Updater               │  │
│  │   • Windows Shell Integration                    │  │
│  └──────────────────────────────────────────────────┘  │
└──────────────┬───────────────────────────┬─────────────┘
               │ HTTPS (Read-Only)         │ HTTPS
               ▼                           ▼
      Cloudflare Workers API        GitHub Releases
       (Curated Catalog v2)       (Official Binaries)
```

---

## 2. Core Subsystems

### A. Catalog Engine (`src/hub/`, `src/services/catalog.ts`)

- **Remote Synchronization**: Periodically polls the public Cloudflare Workers v2 API for the latest curated project records and artwork.
- **Data Validation**: Strict schema enforcement ensures all remote metadata adheres to bounded types and trusted formats.
- **Offline Resilience**: Validated catalog snapshots are cached locally (`localStorage` and SQLite), enabling full offline catalog browsing and project search.
- **Content Security**: Catalog descriptions and guides render as sanitized text. No remote code, script execution, or arbitrary shell commands can be injected.

### B. Download Manager (`src-tauri/src/hub_download.rs`, `src/hub/downloads.ts`)

- **Native Transfer Pipeline**: Downloads official release binaries directly from upstream developer repositories (e.g. GitHub Releases) via Rust's `reqwest` client.
- **Reliability & State**: Supports cancellation, background execution during navigation, and failure retry.
- **Persistence**: Download history and target file paths are tracked locally in SQLite.
- **Explorer Integration**: Native file revelation (`reveal_in_folder`) opens downloaded files directly in Windows File Explorer without arbitrary shell execution.

### C. Signed Application Updater (`src-tauri/src/updater.rs`, `src/services/updater.ts`)

- **Cryptographic Signatures**: Application updates are verified using Minisign signatures before execution.
- **Channel Policy**: Hardcoded HTTPS-only endpoints; unverified or unsigned bundles are rejected immediately.
- **Preflight Checks**: Verifies free disk space and write permissions before initiating update downloads.
- **Safe Handoff**: Hands off verified installer packages to the NSIS installer with clean process termination.

### D. Preferences & Storage (`src-tauri/src/main.rs`, `src/services/settings.ts`)

- **Local SQLite Store**: Stored in `%APPDATA%\com.port.launcher\port.sqlite`. Contains user preferences, window state, and download records.
- **Localization**: Interface translations across 5 languages: English, Russian, Spanish, French, and German.
- **Accessibility & Motion**: Dedicated support for Windows high-contrast modes, system reduced motion, and compact card view.

---

## 3. Trust Boundaries & Security

1. **PORT Does Not Distribute Game Data**: The application contains no ROMs, game rips, proprietary keys, or game binaries. Users obtain original game files legitimately where required.
2. **Read-Only Metadata**: Remote catalog entries are strictly informational. They never provide execution flags, custom scripts, or installer instructions to the host system.
3. **Strict Content Security Policy (CSP)**: WebView2 is locked down to local resources and approved HTTPS media hosts (`img-src self data: https:`).
4. **No Mandatory Account**: PORT functions fully anonymously with zero user registration, tracking cookies, or mandatory authentication.
