# Changelog

## 0.1.0-beta.2 — PORT Beta 2

Second public beta release for Windows 10/11 x64.

### Added & Improved
- **Automatic Catalog Updates:** Catalog refreshes seamlessly upon app startup, window focus/visibility changes after being stale, and network reconnection, while keeping manual refresh available.
- **Offline Resilience:** Local caching preserves the last loaded catalog if the CMS is unreachable or offline, showing a non-intrusive notification without clearing existing items.
- **Production Signed Auto-Updater:** Full support for Tauri updater with Minisign cryptographic verification, configured with the official GitHub Releases channel to deliver seamless updates between beta versions.
- **Security Hardening:** Pruned deprecated legacy IPC handlers and internal development artifacts from the public distribution.
- **Automated Dependency Auditing:** Added Dependabot configuration for npm and Cargo ecosystems.

## 0.1.0-beta.1 — PORT Beta 1

First public beta for Windows 10/11 x64.

- Online discovery of independent PC ports, recompilations, decompilations and compatibility runtimes.
- Project information, publisher-supplied requirements, media and manual setup instructions.
- Official GitHub Release downloads, progress/speed, cancel/retry, optional SHA-256 verification and folder reveal.
- Local download history, saved projects and recently viewed projects.
- English-first interface with Russian, Spanish, French and German options.
- Windows Setup with WebView2 bootstrap support and bundled third-party notices.
