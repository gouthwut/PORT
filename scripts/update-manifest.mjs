// Prepare a static Tauri feed locally. This script never uploads or publishes.
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const [installer, url, notesFile, output] = process.argv.slice(2);
assert(
  installer && url && notesFile && output,
  "Usage: node scripts/update-manifest.mjs installer.exe https://host/version/installer.exe notes.txt output.json",
);
const address = new URL(url);
assert(
  address.protocol === "https:" &&
    !address.username &&
    !address.password &&
    !address.hash &&
    (!address.port || address.port === "443"),
  "Public HTTPS URL required",
);
assert(
  path.basename(address.pathname) === path.basename(installer) &&
    installer.endsWith(".exe"),
  "URL must name the exact NSIS artifact",
);
const config = JSON.parse(
  await fs.readFile(
    new URL("../src-tauri/updater-channel.json", import.meta.url),
    "utf8",
  ),
);
assert(
  config.channel === "production" &&
    config.hosts.includes(address.hostname) &&
    config.publicKey,
  "Configure production public channel first",
);
const { version } = JSON.parse(
  await fs.readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const signature = (await fs.readFile(`${installer}.sig`, "utf8")).trim();
assert(signature && signature.length < 16000, "Missing package signature");
const notes = await fs.readFile(notesFile, "utf8");
assert(notes.length <= 8000, "Keep release notes under 8000 characters");
const stat = await fs.stat(installer);
assert(
  stat.size > 0 && stat.size <= 256 * 1024 * 1024,
  "Updater package exceeds client bound",
);
await fs.writeFile(
  output,
  JSON.stringify(
    { version, notes, platforms: { "windows-x86_64": { signature, url } } },
    null,
    2,
  ),
  { flag: "wx" },
);
console.log("Local update manifest prepared; no publication performed.");
