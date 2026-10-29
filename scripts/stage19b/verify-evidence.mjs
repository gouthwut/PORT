import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const out = "C:/PORT/.local/evidence/stage19b";
const root = "C:/PORT/.local/stage19b";
const read = (name) =>
  JSON.parse(fs.readFileSync(path.join(out, name), "utf8"));
const history = read("history-final.json");
for (const name of [
  "network-error.json",
  "network-recovered.json",
  "cancelled.json",
  "retry-completed.json",
  "bad-hash.json",
]) {
  const recorded = read(name);
  assert.deepEqual(
    history.find((s) => s.id === recorded.id),
    recorded,
  );
}
assert.equal(read("network-error.json").phase, "error");
assert.equal(read("network-error.json").completed, 40960);
assert.equal(read("network-recovered.json").phase, "completed");
assert.match(read("bad-hash.json").message, /SHA-256/);
assert.equal(read("bad-hash.json").path, null);
assert.deepEqual(fs.readdirSync(path.join(root, "hash")), []);
const files = [];
for (const folder of ["network", "cancel", "выбранная папка/вложенная"]) {
  const filename = path.join(root, folder, "fixture.zip");
  const data = fs.readFileSync(filename);
  const sha256 = createHash("sha256").update(data).digest("hex");
  assert.equal(data.length, 524578);
  assert.equal(
    sha256,
    "aed092ebe0ee8a95213bb19b03bc8bdbd8e986fe8030fdb8f3746f1809ab5a78",
  );
  assert(
    !fs.readdirSync(path.dirname(filename)).some((f) => f.endsWith(".part")),
  );
  files.push({ filename, size: data.length, sha256 });
}
assert.deepEqual(read("history-reload.json"), history);
assert.deepEqual(read("history-after-process-restart.json"), history);
const partials = fs
  .readdirSync(root, { recursive: true })
  .filter((f) => f.endsWith(".part"));
assert.deepEqual(partials, []);
assert(
  history.every((s) => ["completed", "cancelled", "error"].includes(s.phase)),
);
assert(
  history.filter((s) => s.phase !== "completed").every((s) => s.path === null),
);
fs.writeFileSync(
  path.join(out, "filesystem-history-verification.json"),
  JSON.stringify(
    { files, rows: history.length, hashFolderEmpty: true, partials: 0 },
    null,
    2,
  ),
);
console.log("PASS: native error/retry/hash/history evidence and actual files");
