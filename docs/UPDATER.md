# Signed Application Updates

PORT includes a secure, cryptographically signed automatic update system powered by `tauri-plugin-updater` and Minisign signatures.

Beta 4 uses the standard Tauri NSIS `perMachine` installer and `passive` updater. Only Setup/Uninstall request elevation; PORT itself remains `asInvoker`. A machine installation registers under HKLM and uses all-users shortcuts.

Beta 3 per-user installations require an explicit manual transition. Setup blocks when a PORT per-user uninstall entry is found in a loaded user hive, including when UAC uses another administrator account. It does not move or remove that installation. Close PORT, back up `%APPDATA%\app.port.launcher`, uninstall the per-user copy **without selecting Delete application data**, then install Beta 4 in Program Files. Check other Windows accounts for older per-user copies too; unloaded profiles cannot be inspected by this guard. Never delete the application data or downloaded game folders during this transition.

Before publishing Beta 4, verify interactive UAC, normal non-administrator launch, uninstall/data retention, and an elevated update in an isolated Windows session. Hosted-runner installation tests do not verify the secure-desktop UAC interaction. Until those checks pass, keep the production manifest on Beta 3.

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
