# Signed Application Updates

PORT includes a secure, cryptographically signed automatic update system powered by `tauri-plugin-updater` and Minisign signatures.

---

## 1. Overview

The updater mechanism is dedicated solely to updating the PORT application executable and assets:

- **Signatures**: Every update package is cryptographically signed using Minisign. Unsigned or mismatched packages fail closed.
- **Integrity**: Updates are served over strict HTTPS.
- **Verification**: Package integrity and version consistency are verified before prompting the user to restart.
- **Clean Handoff**: Once accepted, PORT hands off installation to the Windows NSIS installer and safely restarts.

---

## 2. Security Boundaries

- **User Consent**: Updates are never applied silently in the background without user approval. A notification appears when an update is ready, and installation requires explicit confirmation.
- **Preflight Space Checks**: PORT verifies available temporary storage and target installation disk space before starting a download.
- **Memory Streaming**: Downloads remain in temporary memory buffers and are wiped if cancelled or interrupted.
- **Isolation**: Application updates never alter user preferences, download history, or user files.

---

## 3. Configuration & Distribution

Production builds resolve updates against the official repository channel:

- Releases are published via [GitHub Releases](https://github.com/gouthwut/PORT/releases).
- The manifest feed (`updater-beta.json`) describes the latest version, download URL, release notes, and cryptographic signature (`.sig`).
- CI automation verifies signatures and artifact hashes prior to distribution.
