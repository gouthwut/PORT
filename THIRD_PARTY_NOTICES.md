# Third-party notices

PORT is independently authored launcher code. No SuperMedo code, binaries, original game data, game covers, logos or fonts are bundled. Uncharted is owned by its respective rights holders. SuperMedo's independent port is GPL v2 or later; PORT is not its author. See [upstream research](docs/UPSTREAM.md).

Before choosing the launcher license, package-lock metadata and the resolved Windows Cargo dependency graph were inspected on 2026-10-27. Inventories are in docs/licenses/npm-dependencies.json and rust-dependencies.json. The launcher may use MIT without relicensing dependencies; MPL dependencies remain under MPL, Apache/Unicode/BSD notices and other licenses remain applicable. Inventory is an audit aid, not a replacement for upstream license texts. At the prototype stage PORT is published as source. Before binary distribution, collect the actual dependency license texts in the distribution and separately review all bundled dependencies/SDKs; the installer produced locally is unsigned and not a public release.

Key direct dependencies:

| Component                      | License                       | Source                                      |
| ------------------------------ | ----------------------------- | ------------------------------------------- |
| React / React DOM              | MIT                           | https://github.com/facebook/react           |
| Tauri, API and plugins         | MIT OR Apache-2.0             | https://github.com/tauri-apps/tauri         |
| rusqlite                       | MIT                           | https://github.com/rusqlite/rusqlite        |
| SQLite                         | Public domain                 | https://sqlite.org/copyright.html           |
| Tailwind CSS                   | MIT                           | https://github.com/tailwindlabs/tailwindcss |
| Radix UI                       | MIT                           | https://github.com/radix-ui/primitives      |
| Motion                         | MIT                           | https://github.com/motiondivision/motion    |
| Lucide icons                   | ISC                           | https://github.com/lucide-icons/lucide      |
| CVA, clsx, tailwind-merge      | Apache-2.0 / MIT              | See npm inventory                           |
| Vite / TypeScript / Playwright | MIT / Apache-2.0 / Apache-2.0 | See npm inventory                           |

Some transitive CSS tooling and Rust dependencies use MPL-2.0. No upstream source modifications are made. See [Mozilla's primary guidance on larger works and executable distribution](https://www.mozilla.org/en-US/MPL/2.0/FAQ/) and preserve source-location notices before distributing binaries. System Segoe UI/Georgia and WebView2 are used from Windows, not redistributed as PORT assets. Future downloading, bundling or modifying GPL ports requires a new analysis including corresponding source, notices and third-party SDK terms.
