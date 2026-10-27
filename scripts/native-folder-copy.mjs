// Actual data copied by native Rust IPC, then the QA copy is verified and uninstalled.
import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => /tauri\.localhost|tauri:\/\//.test(p.url()));
if (!page) throw Error("No native PORT");
const call = (command, args = {}) =>
  page.evaluate(
    ({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args),
    { command, args },
  );
const parent = path.resolve(".local/stage03/import-qa");
await fs.mkdir(parent, { recursive: true });
async function done() {
  const end = Date.now() + 15 * 60 * 1000;
  let phase = "";
  while (Date.now() < end) {
    const s = await call("install_status");
    if (s.phase !== phase) {
      console.log(s);
      phase = s.phase;
    }
    if (!s.active) return s;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw Error("Import timed out");
}
try {
  const original = (await call("list_installations"))[0];
  expect(original).toBeTruthy();
  const source = original.dataPath;
  await call("import_game_folder", { source, parent });
  await expect
    .poll(async () => (await call("install_status")).phase, { timeout: 60000 })
    .toBe("copying");
  await call("cancel_install");
  expect((await done()).phase).toBe("cancelled");
  expect(
    (await fs.readdir(parent)).some((n) => n.startsWith(".port-stage-")),
  ).toBe(false);
  await call("import_game_folder", { source, parent });
  expect((await done()).phase).toBe("ready");
  const records = await call("list_installations");
  const copy = records.find((r) => r.root.startsWith(parent + path.sep));
  expect(copy).toBeTruthy();
  expect(copy.version).toBe(original.version);
  console.log("Actual folder copy registered:", copy.id);
  const result = await call("verify_installation", { id: copy.id });
  expect(result).toContain("SHA-256");
  const preserved = path.join(copy.root, "user-data/qa-save.txt");
  await fs.mkdir(path.dirname(preserved), { recursive: true });
  await fs.writeFile(
    preserved,
    "PORT QA preservation sentinel, not a real save",
  );
  // Uninstall only this explicit newly-created QA copy. Primary install and its live game stay open.
  expect(
    await call("remove_installation", { id: copy.id, confirmed: true }),
  ).toContain("сохранены");
  expect(await fs.readFile(preserved, "utf8")).toContain(
    "preservation sentinel",
  );
  expect((await call("list_installations")).some((r) => r.id === copy.id)).toBe(
    false,
  );
  expect(
    (await call("list_installations")).some((r) => r.id === original.id),
  ).toBe(true);
  await fs.writeFile(
    path.resolve(".local/stage03/folder-copy-result.json"),
    JSON.stringify(
      {
        source,
        copy,
        version: copy.version,
        actualData: true,
        cancelCleanup: true,
        integrity: true,
        uninstallQaCopy: true,
        preservedUserData: true,
        primaryStillRegistered: true,
      },
      null,
      2,
    ),
  );
  console.log(
    "Actual folder import/cancel/retry/SHA-256/uninstall copy/preserve sentinel passed. Primary game untouched.",
  );
} finally {
  await browser.close();
}
