# Bloodborne upstream review — 2026-10-27

Stage 02 is authorized. Artifact integration is separate from a working game installation. No gameplay has been verified by PORT.

## Windows projects

| Evidence                 | SuperMedo / bloodborne_pc                                                 | Awakenchan / LanternEngine                                                           |
| ------------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Source revision reviewed | `windows`: `5adea35dbd38851339b63773c1245c02a314f094`                     | `main`: `3860021d6550f95397ba74d046fb14498816a534`                                   |
| Activity                 | branch push 2026-10-23; release 2026-10-21                                | push 2026-10-25; release 2026-10-23                                                  |
| Windows stable           | windows-v1.9.4, Bloodborne-Windows.zip, 189268960 bytes                   | v0.9.37, LanternEngine-v0.9.37-win64.zip, 206798807 bytes                            |
| Execution                | bbport-derived x86-64 game execution, shadPS4 renderer/Vulkan translation | bbport/shadPS4-derived engine, reworked Vulkan renderer                              |
| Game files               | own decrypted CUSA03173; 1.09 needed for patches                          | own CUSA03173 dump with update 1.09                                                  |
| Documented setup         | Bloodborne.exe → select game folder with eboot.bin → Play                 | Lantern Engine.exe → game folder → Play; Bloodborne.exe for direct start after setup |
| License                  | GPL-2.0-or-later plus component licenses                                  | GPL-3.0-or-later plus attribution/name terms, LICENSE/NOTICE and component licenses  |

**Selected: SuperMedo windows-v1.9.4**, for its stable Windows ZIP, published artifact digest, explicit hardware requirements and setup contract. This is a console compatibility runtime with host x86-64 execution and graphics translation, not an official native PC release or clean-room recompilation. Source review does not prove gameplay or binary safety.

Sources: [SuperMedo README](https://github.com/Supermedo/bloodborne_pc/blob/5adea35dbd38851339b63773c1245c02a314f094/README.md), [release](https://github.com/Supermedo/bloodborne_pc/releases/tag/windows-v1.9.4), [LICENSE](https://github.com/Supermedo/bloodborne_pc/blob/windows/LICENSE); [Lantern README](https://github.com/Awakenchan/LanternEngine/blob/3860021d6550f95397ba74d046fb14498816a534/README.md), [release](https://github.com/Awakenchan/LanternEngine/releases/tag/v0.9.37), [NOTICE](https://github.com/Awakenchan/LanternEngine/blob/main/NOTICE). Source head and pinned release are distinct; PORT has not verified their equivalence.

SuperMedo requirements: Windows 10 1903+ / 11 x64, Intel Core Haswell/4th gen+ or AMD Ryzen, Vulkan 1.3 GPU/current driver, ~6 GB available RAM plus pagefile (~10 GB at 1440p/4K). AVX/BMI1/MOVBE/LZCNT are relevant; Sandy/Ivy Bridge instruction translation is best effort; CPUs without AVX cannot run. Upstream says the ZIP contains needed dependencies. PORT has not independently checked all DLL dependencies or measured performance. README describes importing PS4 exports/other runtime saves with backups; PORT does not touch saves.

Known upstream issues: some AMD world-load crashes, beta online support, old CPU instruction gaps and timing above 120 FPS. Lantern also records HDR artefacts, AMD issues and Steam Deck Game Mode failures. Repository activity and [issue lists](https://github.com/Supermedo/bloodborne_pc/issues) are not independent user acceptance tests. PORT has no reproduced gameplay results.

## Artifact manifest and downloader

`src-tauri/src/runtime-manifest.json` is compiled into Rust. [Tag release API](https://api.github.com/repos/Supermedo/bloodborne_pc/releases/tags/windows-v1.9.4) published asset digest:

```text
size   189268960
sha256 b94390545fa72c05f0800f7cd7b5aa9fa4424fbb0e268a5b25bfa48331fa8f5a
```

This is GitHub's artifact digest, not a developer signature. Live release tag/name/size/URL/digest must match the compiled manifest before download; all received bytes are hashed. No remote manifest may supply executable commands, destination paths or launch flags. HTTPS redirects are restricted to github.com, api.github.com and release-assets.githubusercontent.com.

Runtime ZIP validation: <=20000 entries, <=2 GiB total expanded bytes, <=512 MiB per entry, ratio <=500 plus 1 MiB allowance; Windows path/reserved-name rules, duplicate case-insensitive names, symlink/special-file/encryption rejection, bounded streaming reads with CRC and Bloodborne.exe presence. The downloaded artifact contains 1467 entries / 416265637 expanded bytes under bbport-windows/, with bbport-windows/Bloodborne.exe, Play Bloodborne.exe, three bin/ probe executables and license directories. This layout was inspected without extraction. Entries are not written to disk. A verified ZIP stays in app-cache/runtime and is not an installed game. No executable is started.

## PKG extraction: critical gate

- [OpenOrbis/LibOrbisPkg](https://github.com/OpenOrbis/LibOrbisPkg), master `92a4e7f8e5914cb06b52ba3ae6b0675da438a051`, pushed 2026-08-22, LGPL-3.0. GUI/CLI/library, fake-PKG/passcode support described upstream. No GitHub Releases found; README links AppVeyor, but PORT has no reviewed binary pinned there.
- [mathisto/pkgextract](https://github.com/mathisto/pkgextract), main `4f9426e7dde5f04c42fb7e063992f730e3c308c8`, pushed 2026-10-17, LGPL-3.0. Self-contained .NET 8 Windows extractor with PFSC and parallel-read patches. No GitHub Releases found. Its retail example does not establish arbitrary retail-package support.
- **Blocker:** [ExtractInParallel write boundary](https://github.com/mathisto/pkgextract/blob/4f9426e7dde5f04c42fb7e063992f730e3c308c8/PkgTool/Program.cs#L524) forms paths from `f.FullName`, then uses CreateDirectory/File.OpenWrite/SetLength without canonical containment checks, expanded-size quotas or atomic finalization. [PfsReader](https://github.com/mathisto/pkgextract/blob/4f9426e7dde5f04c42fb7e063992f730e3c308c8/LibOrbisPkg/PFS/PfsReader.cs) constructs names from entries. SafeName elsewhere does not establish safety of this path. This is an integration security finding, not a reproduced exploit or full audit.

Passing an output temp directory alone does not confine traversal or resource consumption. PORT therefore does not download, bundle or invoke these extractors. Harden a reviewed fork's write boundary or implement a bounded reader, then test malicious PFS/PKG paths, symlinks/reparse points, sparse/oversized entries, cancellation and recovery before user files. Stage 02D is gated per the user's explicit instruction to stop at critical blockers.

Implemented now: **read-only metadata inspection**, independently written against upstream [PkgReader](https://github.com/OpenOrbis/LibOrbisPkg/blob/92a4e7f8e5914cb06b52ba3ae6b0675da438a051/LibOrbisPkg/PKG/PkgReader.cs) and [entry layout](https://github.com/OpenOrbis/LibOrbisPkg/blob/92a4e7f8e5914cb06b52ba3ae6b0675da438a051/LibOrbisPkg/PKG/Entry.cs). Checks CNT magic, declared file size, entry/body/PFS bounds; reports Content ID, candidate Title ID, inferred region, content type, unencrypted PARAM.SFO APP_VER if available. Reads <=4096 entries and <=1 MiB SFO, never payload extraction. No keys/decryption code copied. Retail/fake classification and decryptability are **unknown**; compatible=false until installation support is established. Title ID is untrusted metadata, not authentication or proof of game identity. Full PKG signature/content integrity is not verified.

Prepared decrypted folders are the documented upstream alternative. PORT has not implemented their import/installation, a clean executable hash set, install disk-space accounting, atomic finalization, SQLite installation records, repair/uninstall or game launch. No Windows CLI arguments invented: upstream's interactive folder chooser is the only established setup mechanism.

## Artwork provenance and rights

[PlayStation product page](https://www.playstation.com/en-gb/games/bloodborne/) contains product art and eight screenshot candidates, Bloodborne_1.jpg through Bloodborne_8.jpg on image.api.playstation.com. [FromSoftware product page](https://www.fromsoftware.jp/ww/detail.html?csm=bloodborne) is another official reference. [FromSoftware site policy](https://www.fromsoftware.jp/ww/policy_site.html) reserves rights and requires written consent for reproduction/upload beyond personal use or legal exceptions. No public-repository redistribution license was established. [IGDB press kit](https://www.igdb.com/games/bloodborne/presskit) has no explicit blanket license in the fetched content; its Images/Key art sections were empty.

No Bloodborne images/logo files were committed, hotlinked or downloaded automatically. The request's local-import fallback is implemented: separate hero, 2:3 cover, page banner and up to 10 screenshots, selected by a user entitled to use them. Local WebP re-encoding, SQLite persistence in native, labelled localStorage in preview, quota/error states. No generated landscapes substitute for Bloodborne. Empty art is labelled until import. QA gallery evidence contains clearly marked synthetic test cards, not game imagery.

## Stage 01 historical research (superseded)

Checked 2026-10-27 using official repository README, LICENSE metadata and GitHub Releases API.

- Project: [SuperMedo / uncharted_pc](https://github.com/Supermedo/uncharted_pc), Mohammed Albarghouthi. Independent of PORT, Sony and Naughty Dog.
- [README](https://github.com/Supermedo/uncharted_pc/blob/main/README.md) requires the user's **decrypted collection dump**, including eboot.bin, big2-ps4_Shipping.elf, big3-ps4_Shipping.elf, sce_sys and u1data/u2data/u3data. CUSA02343/CUSA02320 are examples, not an exhaustive compatibility guarantee. Arbitrary retail PKG decryption is not promised.
- Windows launcher entry point documented as Uncharted.exe; choose a game folder and game in that launcher. No verified external per-title launch arguments established. PORT must model one collection installation with three display entries.
- Requirements as documented: Windows 10 1903+ / Windows 11 x64; Intel Core third generation or newer, AMD Ryzen or FX (older CPU details have caveats); Vulkan 1.3 GPU with current driver, at least 6 GB VRAM; approximately 8 GB free RAM + page file. These are upstream claims, not measurements by PORT. README's older Intel CPU wording is inconsistent; retain caveat and reverify before enforcing hardware checks.
- Latest observed release [v0.3.9](https://github.com/Supermedo/uncharted_pc/releases/tag/v0.3.9), 2026-10-24: asset uncharted-windows.zip, 123152733 bytes. No checksum asset in this release response. Do not equate a GitHub asset with an authenticated compatibility manifest. No download integration implemented now.
- License: [GNU GPL v2 or later](https://github.com/Supermedo/uncharted_pc/blob/main/LICENSE). Third-party notices and SDK licenses travel with upstream binaries. PORT copies no upstream code or binary; future distribution needs a separate compliance review, corresponding-source and notice analysis.
- Release metadata may change. Stage 02 must pin a reviewed revision, inspect ZIP layout and dependencies, verify digests and executable paths, and use a trusted adapter manifest. Never execute commands from GitHub issue text.
