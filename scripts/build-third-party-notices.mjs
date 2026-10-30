import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

// Include verbatim notices from the locked local sources, including build tools.
// No downloaded license template can replace a dependency's copyright notice.
const metadata = JSON.parse(
  execFileSync(
    "cargo",
    [
      "metadata",
      "--offline",
      "--locked",
      "--manifest-path",
      "src-tauri/Cargo.toml",
      "--format-version",
      "1",
      "--filter-platform",
      "x86_64-pc-windows-msvc",
    ],
    { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  ),
);
const resolved = new Set(metadata.resolve.nodes.map((node) => node.id));
const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
const packages = [
  ...Object.entries(lock.packages)
    .filter(([name, value]) => name && !value.dev)
    .map(([name, value]) => ({
      name: name.split("node_modules/").pop(),
      version: value.version,
      license: value.license,
      directory: name,
      ecosystem: "npm",
    })),
  ...metadata.packages
    .filter((item) => resolved.has(item.id) && item.name !== "port-launcher")
    .map((item) => ({
      name: item.name,
      version: item.version,
      license: item.license,
      directory: path.dirname(item.manifest_path),
      ecosystem: "Cargo",
    })),
];
const missing = [];
const supplements = JSON.parse(
  fs.readFileSync("docs/licenses/upstream/sources.json", "utf8"),
);
let output =
  "# Third-party notices\n\nGenerated from the locked dependency sources for PORT Beta 1.\n" +
  "Includes Windows runtime dependencies and Rust build dependencies.\n" +
  "Each component retains its own license. PORT's MIT license does not replace these terms.\n";
for (const item of packages.sort((a, b) =>
  `${a.ecosystem}/${a.name}/${a.version}`.localeCompare(
    `${b.ecosystem}/${b.name}/${b.version}`,
  ),
)) {
  const files = [];
  function collect(directory, depth = 0) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (
        entry.isFile() &&
        /^(licen[cs]e|copying|copyright|notice|unlicense)([._-]|$)/i.test(
          entry.name,
        )
      )
        files.push(target);
      else if (
        entry.isDirectory() &&
        depth === 0 &&
        /^(licen[cs]es?|legal)$/i.test(entry.name)
      )
        collect(target, 1);
    }
  }
  collect(item.directory);
  for (const notice of supplements.filter(
    (notice) => notice.name === item.name && notice.version === item.version,
  )) {
    const file = path.join("docs/licenses/upstream", notice.file);
    assert.equal(
      createHash("sha256").update(fs.readFileSync(file)).digest("hex"),
      notice.sha256,
    );
    files.push(file);
  }
  if (!files.length || !item.license) {
    missing.push(
      `${item.ecosystem}: ${item.name}@${item.version} (${item.license || "unknown"})`,
    );
    continue;
  }
  output += `\n## ${item.ecosystem}: ${item.name} ${item.version}\n\nDeclared license: ${item.license}\n`;
  output += `\nUnmodified source: ${item.ecosystem === "Cargo" ? `https://crates.io/crates/${item.name}/${item.version}` : `https://www.npmjs.com/package/${item.name}/v/${item.version}`}\n`;
  for (const file of files.sort()) {
    const content = fs.readFileSync(file, "utf8").trim();
    assert(
      content.length > 0 && !content.includes("\0"),
      `Invalid notice: ${item.name}`,
    );
    output += `\n### ${path.basename(file)}\n\n~~~~text\n${content}\n~~~~\n`;
  }
}
assert.equal(
  missing.length,
  0,
  `Missing upstream notices:\n${missing.join("\n")}`,
);
fs.mkdirSync("docs/licenses", { recursive: true });
fs.writeFileSync("docs/licenses/THIRD_PARTY_NOTICES.md", output);
console.log(
  `Included upstream notices for ${packages.length} locked packages.`,
);
