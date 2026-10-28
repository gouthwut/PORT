# Signed launcher updates — Stage 08

PORT uses official `tauri-plugin-updater` **2.14.1**, NSIS, and version-bound Minisign signatures. This updates the launcher only. Games, runtimes, saves, SQLite schema 4, catalog configuration and CMS remain independent.

## Channel status

The committed `src-tauri/updater-channel.json` is deliberately **unconfigured**. It contains no production key, invented hostname, access token or working public service. Settings explain this; browser preview disables native actions. A private source repository cannot serve anonymous GitHub Release assets. No repository visibility or public release is changed by this implementation.

Before first distribution the owner must choose an anonymous public HTTPS host, approve secure offline storage/backup of the signing key, and commit the public endpoint/key and exact redirect host allowlist. A separate public **binary-only** GitHub Releases repository or a static HTTPS object host/CDN can serve the same Tauri feed. No player login, PAT, CMS, remote scripts or manifest-provided installer arguments are needed.

```json
{
  "channel": "production",
  "endpoint": "https://YOUR-HOST/latest.json",
  "publicKey": "CONTENTS OF THE TAURI PUBLIC KEY",
  "hosts": ["YOUR-HOST"]
}
```

For GitHub-hosted assets enumerate every required redirect host after checking the real delivery chain. HTTPS and port 443 are mandatory for initial URLs and every redirect. Never use wildcard hosts, disable certificate validation or add GitHub credentials. There is no runtime endpoint/key editor or environment override in the installed client. `PORT_UPDATER_CHANNEL_FILE` is a **build-time** file selection, copied into the executable by build.rs.

## Client behavior and trust boundaries

- One nonblocking startup check; manual checks in Settings; subtle availability indicator, no modal/toast on startup. Concurrent operations are rejected. A verified pending download survives navigation and further checks during the same process.
- Native HTTPS fetch bounds manifest at 64 KiB, package at 256 MiB, redirects at five, connect at 10 seconds and each complete request at 180 seconds. Plain text release notes are limited to 8000 characters. Platform selection and SemVer comparison use the official plugin's `restore_update`; only a strictly newer stable version is accepted. Static `platforms.windows-x86_64` feed or HTTP 204 is supported; empty, malformed, foreign-platform and unsafe packages fail closed.
- Download stays in memory. Cancellation drops the HTTP future and partial bytes; retry starts a fresh request. No partial bytes are installed. Available space is checked on TEMP and the launcher volume before downloading and again before handoff, with 512 MiB reserve. The upfront check conservatively budgets the maximum package size; installation budgets three times its actual size. This is preflight, not a disk reservation; later installer failure remains possible.
- Tauri `Update::verify` checks the package and its signed version after download and immediately before Tauri `Update::install`, which verifies again. `restore_update` requires signed-version binding even if metadata was modified. Unsigned/damaged packages and a valid old signature paired with a fabricated new version are rejected. The release publisher is responsible for putting the correctly built architecture in the feed; a signature authenticates the publisher's package.
- Install requires explicit restart confirmation. It reserves the same native installer lock as game launch/install/verification/recovery/removal, blocks active component download, checks tracked child processes and registered roots, rejects unresolved installation/update/removal journals and checkpoints SQLite. These guards are native, not just disabled UI buttons. An externally launched **unregistered** game cannot be discovered from a registration that does not exist; close all game windows before installation. Processes independently started after the final check are outside PORT's lock.
- Windows installer handoff uses the official plugin and NSIS passive `/R` behavior. The app exits after successful ShellExecute; NSIS updates its installation directory and restarts it. No custom EXE replacement, self-written installer, shell command from metadata, AppData deletion or database reset exists. A tiny bounded attempt receipt reports success or an incomplete previous attempt at the next startup.
- Errors before handoff return to the app and release guards; a failed package is never registered as installed. Once NSIS starts, PORT cannot observe every installer failure/cancellation while it is closed. Relaunch the existing launcher or rerun the last trusted signed installer if necessary. **No automatic binary rollback is promised.** The in-memory package is lost on exit, so a retry downloads again.

## Preparing a release without publishing it

`package.json.version` is the canonical release version; Tauri reads `../package.json`. Rust's crate version is an internal build identifier, not the displayed app version. Increment the package version in a reviewed commit. Do not overwrite a version's installer/manifest after publication.

1. Provision the real key only after the owner approves its encrypted storage and recovery plan. Never create production keys in this repository, pass them as command arguments, log them, or put them in frontend/config files. Store the public key in the channel file. Loss of the private key prevents updates to existing clients; rotation needs a separately reviewed transition release.
2. Configure the GitHub environment `updater-signing` with required reviewers and secrets `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Restrict it to trusted release refs; PR code must not access it. The manual `updater-build.yml` workflow builds signed NSIS artifacts into a **private, seven-day Actions artifact**. It never creates a release or uploads to a public host. Local equivalent: provide the signing secrets through the process environment, then `./scripts/build-updater.ps1`. The script supplies the public key to Tauri bundling from the same compiled channel file.
3. Tauri CLI embeds the app version in the signature automatically. For manual signing use `tauri signer sign --app-version VERSION`; plain signatures without version binding are rejected. Never reuse a QA key or CA. Updater signatures are separate from optional Windows Authenticode/SmartScreen signing.
4. Verify the signed build in isolation, including install/restart and retained data. Prepare the feed with `node scripts/update-manifest.mjs INSTALLER.exe https://HOST/VERSION/INSTALLER.exe NOTES.txt OUTPUT.json`. It uses the canonical version, exact artifact filename, `.sig` contents, configured host and package size bound; output is local and exclusive-create. It does not substitute for the client signature check or a release test.
5. **Separate owner authorization is required for public publication.** After it is given, upload immutable installer + signature first, check anonymous HTTPS delivery, then atomically promote `latest.json`. Keep the previous signed installer for manual recovery. Never upload source, game files, private artwork or signing material. Future GitHub Releases use exactly the same standard static feed format.

The existing no-bundle development build requires no signing secret and leaves production updates disabled until configured. CI validation also requires no production signing key. The signed-build workflow intentionally fails when production configuration is absent.

## Isolated Windows QA

QA must use a different Tauri identifier/product name, its own NSIS install directory, AppData and temporary signing key. No production installation or database may be the target. A build-only `isolated-test` channel may contain `testCaPem`; it is rejected for the production identifier. Production channels cannot add a custom CA. This adds a test CA while retaining TLS certificate/hostname validation; it does not disable TLS.

`scripts/updater-qa-server.py ROOT` serves fixed fixture routes only on `127.0.0.1:443` with a locally generated, short-lived TLS certificate valid for `localhost`. ROOT contains `tls.pem`, `tls.key`, `package.exe`, `package.exe.sig`, `mode.txt`. None belong in Git. Modes: `available`, `current`, `invalid`, `wrongtarget`, `unsigned`, `badsig`, `tampered`, `wrongversion`, `disconnect`, `slow`, `slowcheck`, `oversized`, `http`, `untrusted`, `redirect`. It is not an official channel and must be stopped after testing. Never install the QA certificate in the machine trust store.

Actual results and remaining verification limits are recorded in PROGRESS.md. Browser fixture tests prove presentation/consent behavior only; they do not prove signature verification, NSIS installation or native persistence.

With a fresh isolated 0.8.0 process exposing loopback CDP 9238 and fixture mode `available`, `node scripts/native-updater-faults.mjs` runs native rejection/cancel/retry tests and leaves the verified package ready. `node scripts/native-updater-e2e.mjs` performs the actual confirmed update and checks 0.8.1 restart/settings/library. These scripts explicitly reject the normal channel/version. Use a genuine CA plus a separate server leaf certificate; Rust correctly rejects a CA used as an end-entity server certificate.

Official references, checked 2026-10-28: [Tauri updater guide](https://v2.tauri.app/plugin/updater/), [plugin source](https://github.com/tauri-apps/plugins-workspace/tree/v2/plugins/updater), [Rust Update API](https://docs.rs/tauri-plugin-updater/2.14.1/tauri_plugin_updater/struct.Update.html).
