# Uncharted upstream research

Checked 2026-10-27 using official repository README, LICENSE metadata and GitHub Releases API.

- Project: [SuperMedo / uncharted_pc](https://github.com/Supermedo/uncharted_pc), Mohammed Albarghouthi. Independent of PORT, Sony and Naughty Dog.
- [README](https://github.com/Supermedo/uncharted_pc/blob/main/README.md) requires the user's **decrypted collection dump**, including eboot.bin, big2-ps4_Shipping.elf, big3-ps4_Shipping.elf, sce_sys and u1data/u2data/u3data. CUSA02343/CUSA02320 are examples, not an exhaustive compatibility guarantee. Arbitrary retail PKG decryption is not promised.
- Windows launcher entry point documented as Uncharted.exe; choose a game folder and game in that launcher. No verified external per-title launch arguments established. PORT must model one collection installation with three display entries.
- Requirements as documented: Windows 10 1903+ / Windows 11 x64; Intel Core third generation or newer, AMD Ryzen or FX (older CPU details have caveats); Vulkan 1.3 GPU with current driver, at least 6 GB VRAM; approximately 8 GB free RAM + page file. These are upstream claims, not measurements by PORT. README's older Intel CPU wording is inconsistent; retain caveat and reverify before enforcing hardware checks.
- Latest observed release [v0.3.9](https://github.com/Supermedo/uncharted_pc/releases/tag/v0.3.9), 2026-10-24: asset uncharted-windows.zip, 123152733 bytes. No checksum asset in this release response. Do not equate a GitHub asset with an authenticated compatibility manifest. No download integration implemented now.
- License: [GNU GPL v2 or later](https://github.com/Supermedo/uncharted_pc/blob/main/LICENSE). Third-party notices and SDK licenses travel with upstream binaries. PORT copies no upstream code or binary; future distribution needs a separate compliance review, corresponding-source and notice analysis.
- Release metadata may change. Stage 02 must pin a reviewed revision, inspect ZIP layout and dependencies, verify digests and executable paths, and use a trusted adapter manifest. Never execute commands from GitHub issue text.
