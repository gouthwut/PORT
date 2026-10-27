import fs from "node:fs";
import { execFileSync } from "node:child_process";
const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
const npm = Object.entries(lock.packages)
  .filter(([path]) => path)
  .map(([path, info]) => ({
    name: path.split("node_modules/").pop(),
    version: info.version,
    license: info.license || "UNKNOWN",
    development: !!info.dev,
  }));
const metadata = JSON.parse(
  execFileSync(
    "cargo",
    [
      "metadata",
      "--locked",
      "--manifest-path",
      "src-tauri/Cargo.toml",
      "--format-version",
      "1",
      "--filter-platform",
      "x86_64-pc-windows-msvc",
    ],
    { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
  ),
);
const resolved = new Set(metadata.resolve.nodes.map((n) => n.id));
const rust = metadata.packages
  .filter((p) => resolved.has(p.id))
  .map((p) => ({ name: p.name, version: p.version, license: p.license }));
fs.mkdirSync("docs/licenses", { recursive: true });
fs.writeFileSync(
  "docs/licenses/npm-dependencies.json",
  JSON.stringify(npm, null, 2) + "\n",
);
fs.writeFileSync(
  "docs/licenses/rust-dependencies.json",
  JSON.stringify(rust, null, 2) + "\n",
);
if (npm.some((p) => p.license === "UNKNOWN") || rust.some((p) => !p.license))
  throw new Error(
    "Missing license metadata; inspect manually before licensing/distribution",
  );
console.log(
  `Recorded ${npm.length} npm entries and ${rust.length} resolved Cargo entries. Metadata inventory only; preserve upstream license texts on binary distribution.`,
);
