# PORT PKG worker

Stage 03 adds a narrow, separately built source reader for compatible user-owned CUSA03173 **base** PKGs. It is not an arbitrary encrypted/retail PKG decryptor. No passcode search, supplied keys, console entitlement decoding or patch overlay is implemented.

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
- Only game-facing supplementary `sce_sys` metadata IDs >= PARAM_SFO are copied, with bounded known names/sizes. Entitlement/key/container bookkeeping entries are excluded. Inner PFS takes precedence on duplicate supplementary names, matching upstream's extraction order. No game patch is applied.
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
