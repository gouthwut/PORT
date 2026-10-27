// Separate real runtime launch check; a live process/log is never gameplay confirmation.
import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
const dir = path.resolve(".local/evidence/04b");
const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
try {
  const page = browser
    .contexts()
    .flatMap((c) => c.pages())
    .find((p) => /tauri\.localhost|tauri:\/\//.test(p.url()));
  if (!page) throw Error("Native WebView missing");
  const call = (command, args = {}) =>
    page.evaluate(
      ({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args),
      { command, args },
    );
  const records = await call("list_installations");
  const updated = records.find((r) => r.version === "01.09");
  expect(updated).toBeTruthy();
  expect((await call("running_installations")).includes(updated.id)).toBe(
    false,
  );
  const since = Date.now();
  await page.getByRole("button", { name: "Главная", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "За пределами консоли." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Играть", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Уже запущена", exact: true }),
  ).toBeVisible({ timeout: 120000 });
  await page.screenshot({ path: path.join(dir, "native-109-play.png") });
  // Wait for a newly written 1.09 preparation log, independently of process creation.
  const log = path.join(updated.root, "user-data/user/last_run.log");
  let text = "",
    fresh = false;
  const until = Date.now() + 120000;
  while (Date.now() < until) {
    try {
      const stat = await fs.stat(log);
      fresh = stat.mtimeMs >= since;
      if (fresh) text = await fs.readFile(log, "utf8");
    } catch {}
    if (
      fresh &&
      /01\.09|1\.09/.test(text) &&
      /GPU:|guest threads|Patches:/.test(text)
    )
      break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  const running = await call("running_installations");
  const result = {
    record: updated,
    launchStatus: await call("launch_status"),
    running: running.includes(updated.id),
    freshLog: fresh,
    version109InLog: /01\.09|1\.09/.test(text),
    logTail: text.slice(-16000),
    gameplayConfirmed: false,
  };
  await fs.writeFile(
    path.join(dir, "native-109-launch.json"),
    JSON.stringify(result, null, 2),
  );
  console.log(
    JSON.stringify({ ...result, logTail: result.logTail.slice(-2000) }),
  );
  expect(result.freshLog).toBe(true);
  expect(result.version109InLog).toBe(true);
} finally {
  await browser.close();
}
