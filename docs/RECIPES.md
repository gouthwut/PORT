# Install recipes (Stage 10.3 Builder, schemas 1 and 2)

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

## Stage 10.3: Smart Recipe Builder

The CMS opens in **simple mode**: Project GitHub → Game sources → Recipe verification →
Preview/save. Advanced mode exposes every Stage 10.2 field over the same in-memory
recipe. Switching modes does not normalize, migrate, save or publish it. Existing drafts
remain schemas 1/2; the native client and SQLite schema 4 are unchanged. Templates replace
only source/dependency/setup settings after confirmation if already configured, and never
infer CLI arguments or output hashes. Options: ISO + wizard; ISO + TU + wizard; prepared
folder; direct ISO import; prepared folder + Vulkan. DLC and all optional constraints
remain available in advanced mode. Changing a runtime clears its previous hash/prefix.

GitHub analysis reads the latest stable release with existing owner/CSRF/network limits.
It lists candidate Windows ZIP assets and their API sizes. Only a typed lowercase
`digest: sha256:<64 hex>` from the GitHub HTTPS API supplies a metadata hash; release prose,
filenames and inferred claims cannot. The administrator explicitly chooses the asset.
Missing/ambiguous assets or digests remain unknown; a different release can be reviewed
in advanced mode. GitHub digest reference:
[release assets API](https://docs.github.com/en/rest/releases/assets).

Choose the downloaded runtime ZIP **locally** to compute its full SHA-256, compare any
existing pin, inspect a bounded ZIP central directory and choose a candidate EXE. Size
must equal the selected asset. Safe names, collisions, symlinks, entry counts, expansion
limits and single-disk/non-ZIP64 boundaries are checked. This is a filename inspection,
not PE/authenticity certification or a replacement for native ZIP/PE/download checks.
No bytes are extracted or executed. The browser accepts local hashing up to 512 MiB per
file; native recipe limits are unchanged. ZIP64/nonstandard archives need advanced review.

### Result evidence: structure versus hashes

Direct import continues to use source structure, required/forbidden files, optional ISO
identity and the exact runtime hash; no per-game output hashes are necessary. An upstream
wizard applying an update is different: a directory, a marker, an opaque copied container
or exit code zero cannot establish that the correct patch was applied. Accordingly,
**there is no structural-only setup success mode** and no new unverified result schema.
All original Stage 10.2 immutable input/runtime checks and hashed output gates remain.

For setup, obtain the reference pins through a controlled **owner-run** trial:

1. Review the pinned upstream version, legal source requirements, region/Title/Media IDs,
   documented flags, output layout and behavior. Use a new isolated folder and the exact
   verified runtime ZIP; retain existing profiles/backups. A trial may write upstream
   AppData and may start the game: the owner controls that operation separately.
2. Complete and independently check the trial according to upstream instructions, then
   close its processes. PORT/CMS do not run a trial or access ISO/TU/DLC automatically.
3. Confirm that evidence in Builder; choose the trial's **runtime folder** locally.
   Candidate results exclude files already present in the verified original ZIP.
   Select a genuinely new deterministic result and its meaning (base, TU or DLC index).
   Builder computes size/SHA-256 from its actual bytes. Add an unconditional result and
   the necessary per-selected-upstream-source results. Saves/settings are not evidence.
4. Review requirements and validate. Preview/save uses the existing optimistic private
   draft API; publication is still a separate explicit owner action. Changes invalidate
   the reviewed contract. Native installation repeats all authoritative checks.

This workflow automates **measurement**, not the owner's judgment that a reference file
proves compatibility. It does not verify a whole trial tree, run an upstream integrity
checker, authenticate STFS signatures or prove gameplay. Non-deterministic outputs need
a different stable reference or an unsupported-scenario decision; never invent a hash.
For an individual result larger than 512 MiB the read-only streaming helper prints a
Stage 10.2 output line for advanced mode (no server/upload/execution):

```powershell
cd C:\PORT-CMS
node scripts/recipe-pins.mjs 'C:\isolated-trial\runtime' 'data/verified-result.bin' titleUpdate:0
```

The helper rejects escaping paths/links and files changing during hashing. It does not
claim trial validity or independently identify new files; compare against the pinned ZIP
and review attribution. Only paths/sizes/hashes are saved in CMS. File objects, ZIP indexes,
trial listings and analysis reports stay temporary in the browser; reselect after reload.

### Sonic example and interaction budget (2026-10-28)

The same generic analyzer and ZIP inspector were run read-only against the public
`hedge-dev/UnleashedRecomp` latest stable **v1.0.3** release. The API supplies
`UnleashedRecomp-Windows.zip`, **53,386,467 bytes**, without a digest. A bounded HTTPS
download through GitHub's release asset host was inspected without extracting or running:
actual SHA-256 **65793fbf3bfa392703275d3a1759bea20bc3d62f3bb39b066b85e5e7fb2d5d32**;
four files, candidate **UnleashedRecomp.exe**, no stripPrefix. This is an observed artifact
pin, not embedded game-specific configuration or an installation/gameplay claim.

Rechecked [v1.0.3 main.cpp](https://github.com/hedge-dev/UnleashedRecomp/blob/v1.0.3/UnleashedRecomp/main.cpp):
installer flags exist, but no documented ISO/TU path handoff was established. Sources
must still be chosen in the official wizard. No GUI clicking or guessed arguments added.

For a **new recipe from an existing card with its GitHub URL**, assuming an independently
checked trial and **two sufficient deterministic results** (base + TU), the current UI
needs **21 interactions**, counting a file/folder picker as one interaction:

| Part | Interactions |
| --- | --- |
| Open Builder, analyze, choose asset, open asset download, select local ZIP, choose EXE | 6 |
| Next, choose ISO+TU template, enter reviewed Title ID and setup flags, Next | 5 |
| Confirm requirements/trial, choose trial folder, select+hash base result, select TU result+role+hash, validate | 9 |
| Save private recipe draft | 1 |

Typing a missing GitHub URL adds one interaction. Replacing configured settings adds up
to three overwrite confirmations; already known fields can remove entries. Navigation,
selection and confirmation are included; keystrokes and OS dialog internals are not.
This excludes card metadata/art, download duration and the **one-time external trial**.
No Sonic trial/output reference was obtained here, so its true first-time completion time
and sufficiency of two outputs are **not established**. A simple prepared-folder recipe
has no trial/output-pin work. “A few minutes” is realistic for reviewed compatible inputs
and existing reference evidence, not a promise to investigate a new upstream contract.

Manual decisions remain: trusted project/version/asset/EXE, installation template,
Title/Media ID and TU version/region, requirements/dependencies/flags, trial validity and
which outputs prove each source. Automatic: URL/size, API digest when present or local
runtime SHA-256, ZIP prefix/EXE candidates, template fields, result sizes/hashes, validators.
Sonic's existing card/draft, user ISO/TU/DLC and installed Bloodborne/Skate data were not
read for mutation or launched. No deploy/publication occurred.
