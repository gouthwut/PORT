// Fail closed if a local input or an unexpected public file reaches the installer UI.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const allowedAssets = new Map([
  ["hub-hero", "src/hub/assets/hub-hero.webp"],
  ["Inter-Variable", "src/assets/fonts/Inter-Variable.ttf"],
  ["Manrope-Variable", "src/assets/fonts/Manrope-Variable.ttf"],
]);
const files = fs
  .readdirSync("dist", { recursive: true })
  .filter((name) => fs.statSync(path.join("dist", name)).isFile());
const report = files.map((name) => {
  const file = name.replaceAll("\\", "/");
  const bytes = fs.readFileSync(path.join("dist", name));
  const asset = [...allowedAssets].find(([prefix]) =>
    file.startsWith(`assets/${prefix}-`),
  );
  if (asset) assert.equal(hash(bytes), hash(fs.readFileSync(asset[1])), file);
  else if (file === "port-icon.svg")
    assert.equal(hash(bytes), hash(fs.readFileSync("public/port-icon.svg")));
  else {
    assert.match(
      file,
      /^(index\.html|assets\/(index|dist-js)-[\w-]+\.(js|css))$/,
    );
    const content = bytes.toString();
    assert.doesNotMatch(
      content,
      /localhost:8787|VITE_HUB_SOURCE_JSON|bloodborne-local|stage18e-qa-|QA project|BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|gh[pousr]_[A-Za-z0-9]{30,}/,
    );
  }
  return { file, bytes: bytes.length, sha256: hash(bytes) };
});
assert(files.includes("index.html"));
const js = report
  .filter((item) => item.file.endsWith(".js"))
  .map((item) => fs.readFileSync(path.join("dist", item.file), "utf8"))
  .join("\n");
assert(js.includes("https://port-catalog-cms.port-catalog-cms.workers.dev"));
const css = report
  .filter((item) => item.file.endsWith(".css"))
  .map((item) => fs.readFileSync(path.join("dist", item.file), "utf8"))
  .join("\n");
assert(
  css.includes(".featured-slide") &&
    css.includes(".universal-hero") &&
    css.includes(".hub-project-card"),
);
fs.mkdirSync(".local/evidence/stage19a", { recursive: true });
fs.writeFileSync(
  ".local/evidence/stage19a/frontend-assets.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  `PASS: ${report.length} allowlisted frontend files; Stage 18E styles, fixed production origin, no local artwork/QA inputs.`,
);
