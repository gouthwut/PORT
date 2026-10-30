# Third-Party Notices and Licenses

PORT is an open-source Windows application for discovering native PC ports, recompilations, and decompilations, and downloading official developer releases.

PORT is an independent community project. All trademarks, game titles, logos, and registered properties belong to their respective rights holders. PORT is not affiliated with, endorsed by, or associated with Sony Interactive Entertainment, Microsoft Corporation, Nintendo Co., Ltd., Sega, FromSoftware, or any other game publisher or console manufacturer.

PORT does not distribute, host, or repackage copyrighted game assets, ROMs, ISOs, or game binaries.

---

## Direct Dependencies

PORT relies on open-source libraries and frameworks. The table below lists primary direct dependencies:

| Component                          | License                       | Source / Repository                                                     |
| :--------------------------------- | :---------------------------- | :---------------------------------------------------------------------- |
| **React / React DOM**              | MIT                           | [facebook/react](https://github.com/facebook/react)                     |
| **Tauri, API & Plugins**           | MIT OR Apache-2.0             | [tauri-apps/tauri](https://github.com/tauri-apps/tauri)                 |
| **rusqlite**                       | MIT                           | [rusqlite/rusqlite](https://github.com/rusqlite/rusqlite)               |
| **SQLite**                         | Public Domain                 | [sqlite.org](https://sqlite.org/copyright.html)                         |
| **reqwest**                        | MIT OR Apache-2.0             | [seanmonstar/reqwest](https://github.com/seanmonstar/reqwest)           |
| **sha2**                           | MIT OR Apache-2.0             | [RustCrypto/hashes](https://github.com/RustCrypto/hashes)               |
| **zip**                            | MIT                           | [zip-rs/zip2](https://github.com/zip-rs/zip2)                           |
| **fs2**                            | MIT OR Apache-2.0             | [danburkert/fs2-rs](https://github.com/danburkert/fs2-rs)               |
| **Tailwind CSS**                   | MIT                           | [tailwindlabs/tailwindcss](https://github.com/tailwindlabs/tailwindcss) |
| **Radix UI**                       | MIT                           | [radix-ui/primitives](https://github.com/radix-ui/primitives)           |
| **Motion**                         | MIT                           | [motiondivision/motion](https://github.com/motiondivision/motion)       |
| **Lucide Icons**                   | ISC                           | [lucide-icons/lucide](https://github.com/lucide-icons/lucide)           |
| **CVA, clsx, tailwind-merge**      | Apache-2.0 / MIT              | npm registry                                                            |
| **Vite / TypeScript / Playwright** | MIT / Apache-2.0 / Apache-2.0 | npm registry                                                            |

Detailed dependency inventories are tracked in:

- [docs/licenses/npm-dependencies.json](docs/licenses/npm-dependencies.json)
- [docs/licenses/rust-dependencies.json](docs/licenses/rust-dependencies.json)
- [docs/licenses/upstream/](docs/licenses/upstream/)

---

## Bundled Typography

PORT includes offline variable typography licensed under the SIL Open Font License 1.1:

- **Inter Variable**: [Inter Font Project](https://github.com/rsms/inter) — SIL Open Font License, Version 1.1 ([license](src/assets/fonts/Inter-OFL.txt))
- **Manrope Variable**: [Manrope Font Project](https://github.com/sharanda/manrope) — SIL Open Font License, Version 1.1 ([license](src/assets/fonts/Manrope-OFL.txt))

Full font license texts are embedded directly in the application's About dialog.

---

## Operating System Components

PORT uses the Microsoft Edge WebView2 runtime and standard Windows system APIs for rendering and platform integration. These components are part of the host Windows environment and are not redistributed with PORT.
