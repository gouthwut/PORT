# Extractor write-boundary research

## Stage 03 continuation

The historical gate below describes Stage 02. Stage 03 adds bounded original readers and a separate [production worker](../pkg-worker/README.md); the old upstream PfsReader/PFSCReader are used only by synthetic reference tests. Optional `--probe-mechanism <pkg>` / `--probe-tree <pkg>` diagnostics read fixed metadata / bounded trees without writing game files, trying passcodes or returning secrets. They require the exact upstream checkout and are never invoked by PORT. Writer tests still run standalone. See current PROGRESS/UPSTREAM for actual user-file results; the remaining historical text must not be read as a current claim that the PFS encryption bit proves incompatibility.

This is **not an installed PKG extractor** and has no user-PKG command. PORT never invokes it. Original PORT code replaces the unsafe `ExtractInParallel` output boundary while retaining an optional reference to the existing upstream PFS decoder for tiny synthetic fixtures. No upstream source, keys or binaries are included in this repository.

Run on Windows with .NET SDK 8+:

```powershell
./scripts/test-extractor.ps1
./scripts/test-extractor.ps1 -UpstreamRoot C:\path\to\reviewed\pkgextract
```

The optional checkout must be unmodified at `4f9426e7dde5f04c42fb7e063992f730e3c308c8`. The script checks this before building its LGPL-3.0 library. Keep that checkout outside PORT. Standalone boundary tests have no upstream dependency and run in Windows CI. The app does not acquire a .NET runtime dependency.

`Boundary.Extract` receives decoded streams, validates all output names before writing, rejects traversal/absolute/ADS/reserved/non-ASCII paths, caps depth/count/file/total/expansion ratio, detects case and file/directory collisions, checks free space plus reserve, rejects ancestor links/junctions, and uses owner-only staging ACLs on Windows. Writes use `CreateNew`, exact stream lengths, cancellation checkpoints, flush, a single same-volume final directory move and bounded cleanup. It never merges into or replaces an existing destination. Limits default to 64 GiB total / 16 GiB per file / 100000 files / depth 32 / ratio 500 plus 1 MiB, with 512 MiB reserve. They are research defaults, **not measured installation requirements**.

33 Windows checks cover these boundaries, truncated/oversized streams, mid-stream cancellation, decoder failure, cleanup, junction ancestors and retry. Optional upstream tests build a tiny unencrypted PFS, decode it with the existing `PfsReader`, feed it to the replacement writer, compare output bytes, and reject generated traversal, truncated structure, invalid magic, oversized inode count and encrypted-mode fixtures. No user payload is decoded.

## Remaining gate

The write-boundary tests do not audit the decoder. `PfsReader` allocates arrays from header fields and recursively traverses directories; full inode/block/range validation, cycle detection, resource/time limits and cancellation before allocation/traversal remain unverified. `PFSCReader` also needs a bounded sector-map/expansion audit. `DecodeFixture` deliberately accepts only <=8 MiB generated fixtures with bounded header counts; it is not a general validator. No process sandbox or hostile same-user race protection is established by these tests. Private staging and link checks do not constitute kernel confinement against an actor with the same account permissions.

Both supplied user PKGs have encrypted PFS mode `0x000d`. Only their bounded public metadata and PFS superblock were read. This marker does **not** prove retail/fake status, available keys, decryptability or complete package integrity. No passcodes, key recovery, decryption attempts or DRM bypass were performed. Therefore no real extraction, patch application, runtime extraction, installation record or gameplay claim follows from this lab. Reader hardening and a supported lawful data source remain prerequisites for production integration.
