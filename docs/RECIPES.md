# Install recipes (Stage 10, schema 1)

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
  "source": { "kind": "xbox360-iso", "titleId": "4D5307E6", "mediaId": "0A1B2C3D",
              "requiredFiles": ["default.xex"], "forbiddenFiles": [] },
  "runtime": { "url": "https://github.com/OWNER/REPO/releases/download/TAG/asset.zip",
               "size": 12345678, "sha256": "<64 lowercase hex>", "stripPrefix": "asset" },
  "dependencies": ["windows-x64", "vulkan-loader"],
  "launch": { "executable": "game.exe", "workingDir": "runtimeDir",
              "arguments": [{ "flag": "--game=", "value": "gameDir" }] }
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
redistributable installers (VC++/DirectX), patches/DLC/updates, non-GitHub hosts.
