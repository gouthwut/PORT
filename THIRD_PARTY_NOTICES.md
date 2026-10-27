# Third-party notices

PORT is independently authored launcher code. No SuperMedo code/binaries, original game data, game covers, game logo assets or fonts are bundled in the public repository or clean public build. The continuation request authorizes optional private build-time packaging of user-provided Bloodborne artwork; redistribution rights are unconfirmed. That personal executable and derived artwork must not be publicly distributed without clearance. See [local artwork packaging](docs/LOCAL_ART.md). Bloodborne belongs to its respective rights holders; PORT is unaffiliated with Sony and FromSoftware. SuperMedo's bloodborne_pc runtime is GPL v2 or later with additional component licenses; PORT is not its author. The user-triggered downloader retrieves the unchanged official ZIP into a local cache and verifies the compiled digest. Its upstream licenses/source obligations remain applicable. PORT does not repackage, extract, modify or launch that runtime yet. See [upstream research](docs/UPSTREAM.md).

Before choosing the launcher license, package-lock metadata and the resolved Windows Cargo dependency graph were inspected on 2026-10-27. Inventories are in docs/licenses/npm-dependencies.json and rust-dependencies.json. The launcher may use MIT without relicensing dependencies; MPL dependencies remain under MPL, Apache/Unicode/BSD notices and other licenses remain applicable. Inventory is an audit aid, not a replacement for upstream license texts. At the prototype stage PORT is published as source. Before binary distribution, collect the actual dependency license texts in the distribution and separately review all bundled dependencies/SDKs; the installer produced locally is unsigned and not a public release.

Key direct dependencies:

| Component                      | License                       | Source                                      |
| ------------------------------ | ----------------------------- | ------------------------------------------- |
| React / React DOM              | MIT                           | https://github.com/facebook/react           |
| Tauri, API and plugins         | MIT OR Apache-2.0             | https://github.com/tauri-apps/tauri         |
| rusqlite                       | MIT                           | https://github.com/rusqlite/rusqlite        |
| SQLite                         | Public domain                 | https://sqlite.org/copyright.html           |
| reqwest                        | MIT OR Apache-2.0             | https://github.com/seanmonstar/reqwest      |
| sha2                           | MIT OR Apache-2.0             | https://github.com/RustCrypto/hashes        |
| zip                            | MIT                           | https://github.com/zip-rs/zip2              |
| fs2                            | MIT OR Apache-2.0             | https://github.com/danburkert/fs2-rs        |
| tempfile (tests)               | MIT OR Apache-2.0             | https://github.com/Stebalien/tempfile       |
| Tailwind CSS                   | MIT                           | https://github.com/tailwindlabs/tailwindcss |
| Radix UI                       | MIT                           | https://github.com/radix-ui/primitives      |
| Motion                         | MIT                           | https://github.com/motiondivision/motion    |
| Lucide icons                   | ISC                           | https://github.com/lucide-icons/lucide      |
| CVA, clsx, tailwind-merge      | Apache-2.0 / MIT              | See npm inventory                           |
| Vite / TypeScript / Playwright | MIT / Apache-2.0 / Apache-2.0 | See npm inventory                           |

Some transitive CSS tooling and Rust dependencies use MPL-2.0. No upstream source modifications are made. See [Mozilla's primary guidance on larger works and executable distribution](https://www.mozilla.org/en-US/MPL/2.0/FAQ/) and preserve source-location notices before distributing binaries. System Segoe UI/Georgia and WebView2 are used from Windows, not redistributed as PORT assets. Future repackaging, bundling or modifying GPL runtimes requires a separate distribution review including corresponding source, notices and third-party SDK terms. The current downloader keeps upstream archives intact.

LibOrbisPkg/pkgextract (LGPL-3.0) remain outside the PORT application: no upstream source, keys, executable or library is included in the public repository or app. The optional extractor lab builds against a separate exact-revision local checkout solely for synthetic unencrypted PFS tests; do not redistribute its build outputs without the applicable LGPL obligations. The metadata reader is independently implemented. Official PlayStation/FromSoftware/IGDB image pages are reference sources, not licenses to bundle imagery. See UPSTREAM.md for exact source/policy links. Users can import authorized images locally as SQLite/localStorage overrides, or package supplied art privately at build time. Neither personal art nor art-containing screenshots are committed/uploaded. Historical QA screenshots with synthetic cards are clearly labelled fixtures.
