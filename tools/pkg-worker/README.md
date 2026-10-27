# PORT PKG worker

Stage 03 adds a narrow, separately built source reader for compatible user-owned CUSA03173 **base** PKGs. Stage 04B adds one confirmed cumulative update; it is not an arbitrary encrypted/retail PKG decryptor. No passcode search, supplied keys, console entitlement decoding or general delta application is implemented.

## Confirmed update contract (Stage 04B)

`--extract-confirmed-update` uses the same reader/writer and native process boundary. Before parsing it hashes the entire held read-only source and requires SHA-256 `a138cfdc6133d7718dca77a3ef05072d50020d8e987c21be8d795980f78ff818`, GD content type and flags `0x62100000`. All other updates fail closed. Native code independently checks the digest before copying the base, plus actual CUSA03173 / APP_VER 01.09 / matching Content ID and a 01.00 installed source. A filename is never sufficient.

Read-only `--audit-update` reads/hashes every planned file and reports bounded non-secret origin-delta metadata headers; it does not extract/apply. The actual confirmed package has 405 inner files plus 27 supplementary files: 432 / 185382731 bytes. Its `origin-deltainfo.dat` (21888 bytes, `7f 44 4c 54` magic) is console installation bookkeeping, outside the game-facing tree. The runtime's [pinned help implementation](https://github.com/Supermedo/bloodborne_pc/blob/windows-v1.9.4/launcher/bbport_help.py) explicitly specifies replacing complete update files in the base folder. PORT uses that runtime-facing full-file recipe only for this exact package; it does not interpret/replay console delta instructions or infer that every package containing origin metadata is safe. TARGET_DELTAINFO and DP/delta flags remain unsupported. No delete operation is implemented or inferred from an absent update path.

Actual extraction and the runtime's own plaintext SELF/patch-group fingerprint checks confirm a complete clean 93825704-byte 1.09 eboot with all three expected groups. Source-level recipe/fingerprints alone are not gameplay evidence. Real native results are in PROGRESS.md.

PORT builds a separate installation with one space-checked full base copy, verifies each copied base file against its existing manifest, applies replacements/additions only in staging, copies and read-verifies a separate user profile, and read-verifies every new game/runtime SHA-256 before final rename/SQLite registration. The 1.00 files, profile and registration remain intact as rollback. The highest installed version is the default Play target; individual library cards retain explicit version selection. Existing installation-job recovery/cancellation is reused. No base re-extraction, runtime download, hardlinks, library reset or schema change is needed. Combined base+update first-install automation is deferred: install the base, then use its update action.

Build from the exact unmodified [mathisto/pkgextract revision](https://github.com/mathisto/pkgextract/tree/4f9426e7dde5f04c42fb7e063992f730e3c308c8):

```powershell
powershell -ExecutionPolicy Bypass -File scripts/fetch-pkg-source.ps1
powershell -ExecutionPolicy Bypass -File scripts/build-pkg-worker.ps1
npm run tauri build -- --no-bundle
```

The build script checks revision/working tree, then publishes a self-contained .NET 8 Windows x64 worker into ignored `.local/pkg-worker`. The Tauri build embeds that local exe and its SHA-256. At use, PORT writes it only into its fixed app-cache location and checks its compiled hash before execution. A clean source checkout without a built worker still builds, exposes folder import, and explicitly disables PKG installation. No downloaded upstream source, executable, key material or game data is tracked. .NET is a **build** dependency; the produced worker does not require a separate user .NET installation. Public redistribution of binaries has separate license obligations below.

## Boundaries

- Fixed-size bounded header/table/entry metadata; <=4096 entries. Only the pinned library's documented fake-PKG `GetEkpfs` mechanism is used. Failure stops; no alternate keys/passcodes are tried. Successful mechanism probing alone is not payload integrity or retail/fake authentication.
- Original `SafePfs` / `SafePfsc` readers replace upstream's recursive/allocation-trusting readers in the worker. Supported PFS: 64 KiB blocks, signed/unsigned **32-bit** inode layout; bounded counts, block and indirect-map ranges, directory depth/cycles, names, node/expanded-size budgets, exact reads. Unsupported layouts fail closed.
- PFSC: bounded monotonic sector map, <=64 GiB expanded, <=8 MiB map, <=64 KiB sectors; zlib checksum/exact output/expansion checks. Sparse/unsupported encodings fail rather than silently substituting bytes.
- AES-XTS implementation uses .NET AES and the pinned fake-PKG key mechanism; tests compare boundary-crossing reads with upstream. It does not discover or output secrets.
- Only game-facing supplementary `sce_sys` metadata IDs >= PARAM_SFO are copied, with bounded known names/sizes. Entitlement/key/container bookkeeping entries are excluded. Inner PFS takes precedence on duplicate supplementary names, matching upstream's extraction order. Update replacement happens only in native owned staging under the confirmed contract above.
- Existing bounded writer: preflight Windows names, collisions/containment/count/ratio/total/per-file limits, free space, owner-only staging ACL, reparse checks, CreateNew, exact streams, cancellation, flush, no-overwrite atomic rename. Its output lives entirely inside PORT's durable installation staging.
- Native process supervision: fixed command/arguments, bounded stdout/stderr, cooperative cancel then kill, 45-minute deadline, 1 GiB managed heap cap. Windows Job Object additionally limits process memory to 1.5 GiB, disallows child processes and terminates the worker if PORT closes. Failure to assign the Job Object aborts extraction.

These checks are not full PKG signature verification or a kernel filesystem sandbox against a hostile process already running as the same Windows user. Do not treat generated fixtures as proof of arbitrary format support. Source files are opened read-only and held without write/delete sharing by the worker. Game/runtime manifests describe the imported bytes, not an authoritative publisher hash set.

## Checks and licenses

```powershell
powershell -ExecutionPolicy Bypass -File scripts/test-extractor.ps1 -UpstreamRoot C:\PORT\.local\stage03\pkgextract
.local/pkg-worker/port-pkg-worker.exe --plan-base C:\path\to\own-base.pkg
```

The second command is read-only preflight. Actual extraction is invoked by native PORT; do not infer gameplay from preflight. The test harness includes writer checks, tiny PFS roundtrip, directory cycle/name/range/header cases, 300 mutations, PFSC maps/zlib bounds and XTS comparisons. Native evidence/results are recorded separately in PROGRESS.md.

PORT's original files follow this repository's MIT license. The linked LibOrbisPkg library is **LGPL-3.0**; its [license](https://github.com/mathisto/pkgextract/blob/4f9426e7dde5f04c42fb7e063992f730e3c308c8/LICENSE.txt) and exact corresponding source are upstream. Rebuilding the library and this worker from the scripts permits replacement/relinking; do not impose restrictions on that activity. When distributing a binary, include the LGPL notice/license, corresponding source or a compliant source offer, and replacement/relinking instructions. No personal exe containing private artwork is published here.
