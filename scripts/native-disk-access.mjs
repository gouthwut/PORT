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
try {
  const count = (await call("list_installations")).length;
  await call("prepare_runtime", { parent: process.argv[2] });
  await expect
    .poll(async () => (await call("install_status")).active, { timeout: 60000 })
    .toBe(false);
  const status = await call("install_status");
  expect(status.phase).toBe("error");
  expect(status.message).toMatch(/denied|отказано|os error 5/i);
  expect((await call("list_installations")).length).toBe(count);
  expect(await fs.readdir(process.argv[2])).toEqual([]);
  await fs.writeFile(
    path.resolve(".local/stage03/disk-access-result.json"),
    JSON.stringify(
      { status, noLibraryRecord: true, emptyDestination: true },
      null,
      2,
    ),
  );
  console.log(
    "Actual native access-denied path passed; no installation registered; ACL restored by caller.",
  );
} finally {
  await browser.close();
}
