# PORT Beta 1 — v0.1.0-beta.1

Release notes draft. Do not publish until production catalog/download acceptance is complete.

PORT is a Windows catalog and download manager for independent PC ports, recompilations,
decompilations and compatibility runtimes. Browse a project, read its developer's guide,
download an approved official release and set it up yourself.

## Included

- Online project catalog and detailed project pages.
- Official GitHub Release downloads with progress and transfer speed.
- Cancel/retry, destination picker, overwrite protection and optional upstream SHA-256 verification.
- Download history, Open folder, saved and recent projects.
- English, Russian, Spanish, French and German interface options.
- A per-user Windows Setup; no developer tools required to run PORT.

## Installation

1. Download `PORT-Setup-0.1.0-beta.1.exe` and `SHA256SUMS.txt` from this release.
2. Compare the installer's SHA-256 using `Get-FileHash` in PowerShell.
3. Run Setup and launch PORT from the Start menu.

Requires Windows 10/11 x64 and WebView2. Setup can download the Microsoft WebView2
bootstrapper if needed. The installer is unsigned. No SmartScreen bypass is recommended.

For future updates, close PORT and run the new Setup from GitHub Releases, retaining
app data. No unsigned automatic update channel is enabled.

## Known limitations

- This is a beta, not PORT 1.0 or a stable release.
- One active project download; retry starts from the beginning. No queue or persistent partial resume.
- SHA-256 is checked when the approved upstream asset supplies a digest.
- Project text and media depend on what the catalog publisher provides.
- No games or original game files are included. PORT does not install or launch games.
- Clean Windows 10/11 installation has not yet been independently verified.

Source: [gouthwut/PORT](https://github.com/gouthwut/PORT).
Dependencies and downloaded projects retain their respective licenses.
