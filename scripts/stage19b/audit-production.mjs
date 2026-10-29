import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";

const productionPath =
  process.argv[2] ?? "C:/PORT/src-tauri/target/release/port-launcher.exe";
const qaPath = "C:/PORT/.local/stage19b/installed/port-launcher.exe";
const production = fs.readFileSync(productionPath);
const qa = fs.readFileSync(qaPath);
const markers = [
  "http://127.0.0.1:19219",
  "QA accepts only fictional fixture assets",
  "download-e2e-qa requires its isolated identity",
];
for (const marker of markers) {
  assert(
    qa.includes(Buffer.from(marker)),
    `positive QA control missing: ${marker}`,
  );
  assert(
    !production.includes(Buffer.from(marker)),
    `QA code found in production: ${marker}`,
  );
  assert(
    !production.includes(Buffer.from(marker, "utf16le")),
    `QA code found in production UTF16: ${marker}`,
  );
}
const scripts = fs.readdirSync("dist/assets").filter((f) => f.endsWith(".js"));
const source = scripts
  .map((f) => fs.readFileSync(`dist/assets/${f}`, "utf8"))
  .join("\n");
assert(!source.includes("stage19b-override.invalid"));
assert(!source.includes("http://127.0.0.1:19219"));
const result = {
  productionPath,
  sha256: createHash("sha256").update(production).digest("hex"),
  qaPath,
  excludedMarkers: markers,
  devOverrideAbsent: true,
};
fs.writeFileSync(
  ".local/evidence/stage19b/production-audit.json",
  JSON.stringify(result, null, 2),
);
console.log(
  "PASS: production binary excludes QA transport; QA positive control includes it; frontend excludes dev override",
);
