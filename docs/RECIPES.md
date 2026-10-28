# Install recipes (Stage 10.2, schemas 1 and 2)

A recipe **configures operations compiled into PORT**; it is not a program. CMS publishes
recipes at `/v1/recipes.json` (same origin as `catalog.json`); the client re-validates every
field (`src-tauri/src/recipe.rs`) and shows «Неподдерживаемый сценарий установки» otherwise.
Compiled adapters (`bloodborne`, `skate3`) cannot be shadowed by recipes.

```json
{
  "schemaVersion": 1,
  "id": "example-win",
  "collectionId": "example",
  "title": "Example",
  "source": {
    "kind": "xbox360-iso",
    "titleId": "4D5307E6",
    "mediaId": "0A1B2C3D",
    "requiredFiles": ["default.xex"],
    "forbiddenFiles": []
  },
  "runtime": {
    "url": "https://github.com/OWNER/REPO/releases/download/TAG/asset.zip",
    "size": 12345678,
    "sha256": "<64 lowercase hex>",
    "stripPrefix": "asset"
  },
  "dependencies": ["windows-x64", "vulkan-loader"],
  "launch": {
    "executable": "game.exe",
    "workingDir": "runtimeDir",
    "arguments": [{ "flag": "--game=", "value": "gameDir" }]
  }
}
```

## Operations (fixed order)

1. Validate source: `xbox360-iso` (shared bounded XDVDFS reader from the Skate 3 importer,
   XEX2 Title/Media ID check) or `folder` (prepared files, symlink/junction rejected). Source is
   opened read-only and never modified.
2. Check `requiredFiles` / `forbiddenFiles`.
3. Copy/extract game files into `game/` (bounded size/count, traversal and name collisions rejected).
4. Download runtime ZIP from a GitHub Release URL only (allowlisted redirects), exact size + SHA-256,
   then bounded safe ZIP extraction into `runtime/`.
5. Check dependencies: `windows-x64` (actual OS arch), `vulkan-loader` (`vulkan-1.dll` in System32).
   Not installable automatically → explained error; PORT never elevates.
6. Verify `launch.executable` is a PE file inside `runtime/`.
7. Create `user-data/` (never removed), pin the exact recipe bytes in `runtime/port-recipe.json`
   and hash it in the manifest, atomic rename from `.port-stage-*`, register in schema-4 SQLite.

Launch: only the pinned, hash-verified recipe is used; arguments are fixed flags with
placeholders `gameDir|userDir|runtimeDir`. No shell, scripts, env or arbitrary paths.
Recovery/removal reuse Stage 07 journals (`installation_jobs`, owner marker, manifest pruning).

## Not supported (honest limits)

PS4 PKG via recipes (only the compiled Bloodborne contract), archive sources, installers/MSI,
redistributable installers (VC++/DirectX), direct XEX/XEXP patching, non-GitHub hosts.
Schema 2 adds prepared supplemental trees and user-driven upstream setup as described below.

## Schema 2: multiple sources and upstream setup

Schema 1 and its existing API stay valid. The recipe envelope `/v1/recipes.json` remains
schema 1; each recipe explicitly opts into `schemaVersion: 2`. Old clients reject schema-2
recipes as unsupported. Installation SQLite remains schema 4.

`source` keeps the mandatory **baseGame** role, with the existing ISO or prepared-folder
contract. `sources` adds up to one `titleUpdate` slot and one optional `dlc` slot. This
avoids changing old source selectors/recipes. Each additional slot has:

| Field        | Contract                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------- |
| `role`       | `titleUpdate` or `dlc`                                                                            |
| `required`   | TU may be required or optional; DLC is optional                                                   |
| `repeatable` | Only DLC, up to 16 selected inputs, in displayed selection order                                  |
| `target`     | Safe, non-overlapping relative directory below `game/`                                            |
| `operation`  | `copy-tree` for **already prepared** data; `upstream-setup` stages inputs for the verified wizard |
| `source`     | `folder` with required/forbidden files, or `xbox360-content` for upstream setup only              |

A folder import preserves relative filenames, never overlays base files, and uses
exclusive-create. Repeated DLC uses `game/<target>/0`, `/1`, etc. A container is staged
as `game/<target>/source.container` (under the index for repeated inputs). Its original
extension is irrelevant. Base ISO is checked and extracted through the existing XDVDFS
reader; a wizard must accept the resulting **folder**, not require the original ISO.
A base/supplement target collision fails without overwriting anything.

`xbox360-content` performs bounded **header inspection**, not STFS extraction or signature
verification: CON/LIVE/PIRS magic; header bounds, metadata version, STFS volume type;
TU content type `000B0000` or DLC `00000002`; required Title ID and optional Media ID,
8-hex execution-info `version`, optional whole-container lowercase SHA-256. Title/Media
IDs declared on base and supplemental inputs must agree. Region is not inferred from
filenames or an unauthenticated header. Full internal tree, compatibility, hashes and
XEXP patching remain upstream responsibilities. No raw single-file XEXP reader, SVOD,
ZIP/7z/RAR game sources, encryption bypass or commercial downloads are implemented.
A prepared folder containing raw update files is usable if the upstream wizard accepts it.

### Wizard contract

`setup` is optional. It requires `executable`, typed `arguments`, `workingDir` and
`results`. The executable must equal `launch.executable` and be a Windows x64 PE from
the downloaded size/SHA-256-pinned GitHub-release runtime ZIP. There is no shell, script,
CMS environment, separate executable URL or free-form argument string. The existing typed
flags and `gameDir|userDir|runtimeDir` placeholders apply. No new argument is inferred.

Every `results` entry is `{path, size, sha256}` for a **new** file below `runtime/`.
At least one unconditional output is required. Outputs attributed to optional / upstream
sources additionally have `sourceRole` and zero-based `sourceIndex`. Every selected
`upstream-setup` input needs its own attributed result; results for unselected inputs
are skipped. For example, the recipe can require a patched executable globally, the
installed update file for `titleUpdate` index 0, and each DLC's installed validation file.
The owner supplies independently verified sizes and SHA-256 hashes. Hashes are never
invented or taken from a filename. Merely copying an opaque TU/DLC is not success.

Before starting, the UI collects inputs and explicit runtime-execution consent, offers
native preflight and displays errors. Native install repeats the checks, including source
counts/identity, destination overlap, reparse points and space, before downloading.
The trusted wizard receives **no automatic input-path handoff**: the user selects the
staged source folders/containers using its official UI. PORT displays their parent path.
No GUI clicking, download-consent automation or undocumented CLI handoff is used.

The installer reserves the existing shared operation state, holds the EXE without
write/delete sharing, attaches the existing Windows kill-on-close Job Object, waits up to
30 minutes, and terminates the child on cancellation/failure. A successful process exit
alone never commits. All original runtime/input files must retain their hashes; required
new outputs must match size/SHA-256; new runtime files are bounded, scanned and hashed;
new files outside runtime/user-data are refused. Final manifest verification, atomic rename
and existing schema-4 registration/recovery follow. The user may need to close the game
that the wizard starts. PORT never certifies gameplay from installation completion.

The external runtime is trusted code with normal user privileges, **not sandboxed**. Its
documented profile may be outside PORT (for example the user's AppData); PORT does not
move, delete or reset it. `user-data/.port-setup-started` is written before launch. Any
failure/cancel/crash after that point preserves the **entire** owned stage by renaming it
to `.port-preserved-<id>`; it is never registered as complete. Recovery refuses a running
stage and retains the journal on ambiguous/error conditions. Preserved folders are not
automatically reused or deleted. A retry uses a new stage; copying old profiles is an
owner decision. Successful installation/removal still preserve `user-data`.

### Verified upstream research, 2026-10-28

Reviewed UnleashedRecomp **v1.0.3**, commit
`325e4d34a0adaa34808b7212594c0f25b88bfb96`, only as an architectural example:
[main.cpp](https://github.com/hedge-dev/UnleashedRecomp/blob/325e4d34a0adaa34808b7212594c0f25b88bfb96/UnleashedRecomp/main.cpp),
[installer.cpp](https://github.com/hedge-dev/UnleashedRecomp/blob/325e4d34a0adaa34808b7212594c0f25b88bfb96/UnleashedRecomp/install/installer.cpp),
[xcontent_file_system.cpp](https://github.com/hedge-dev/UnleashedRecomp/blob/325e4d34a0adaa34808b7212594c0f25b88bfb96/UnleashedRecomp/install/xcontent_file_system.cpp).
It accepts directories and recognized Xbox content; copies verified base/update/DLC data
and applies XEXP to the base executable. `--install`, `--install-dlc`, `--use-cwd` are
present; no documented multi-source CLI arguments were established. Its wizard, output
layout and AppData profile must be reviewed by the recipe owner. No Sonic recipe/card
was read for mutation, changed, published, installed or tested with real game files here.
No game-specific code or runtime download was added.

### Verification and readiness

Synthetic tests cover ISO/folder import, multiple prepared sources, repeated DLC,
extensionless header-checked STFS staging, hashes, traversal, junctions, invalid roles,
missing outputs and crash preservation. The original C# fixture in
`tests/fixtures/recipe-setup.cs` exercises the actual Windows process pipeline: consent
refusal, success consuming staged base+TU, nonzero exit, zero exit without output and
cancellation, with preserved synthetic saves and no partial registration. Compile it with
the installed .NET Framework x64 compiler, set `PORT_RECIPE_SETUP_FIXTURE` to the local
EXE and explicitly run the ignored Rust test `windows_multi_source_setup_real_process`.
It uses an injected in-memory runtime ZIP fetcher, not a real upstream download.

CMS Builder configures all supported fields without client recompilation for each game.
For a correctly reviewed recipe and compatible inputs, a player needs the official wizard,
not an external extractor/patch tool. This does **not** prove Sonic readiness: its existing
schema-1 draft is unchanged; a reviewed schema-2 recipe with actual runtime/output hashes,
owner CMS deployment/publication and an independent real-data manual test are still needed.
