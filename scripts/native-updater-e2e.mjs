// Real signed NSIS handoff; refuses every channel/version except isolated QA 0.8.0.
import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
const root = ".local/stage08";
let b = await chromium.connectOverCDP("http://127.0.0.1:9238");
let p = b
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => /tauri/.test(p.url()));
const call = (command, args = {}) =>
  p.evaluate(
    ({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args),
    { command, args },
  );
expect((await call("updater_status")).channel).toBe("isolated-test");
expect((await call("updater_status")).currentVersion).toBe("0.8.0");
expect((await call("updater_status")).downloaded).toBe(true);
const settings = await call("load_settings");
const items = await call("list_installations");
await p.locator(".sidebar-bottom .nav-item").click();
await p.locator(".launcher-updates > button").last().click();
await p.locator(".dialog-content .dialog-actions button").first().click();
expect((await call("updater_status")).currentVersion).toBe("0.8.0");
await p.locator(".launcher-updates").scrollIntoViewIfNeeded();
await p.screenshot({ path: root + "/native-before-install.png" });
await p.locator(".launcher-updates > button").last().click();
await p
  .locator(".dialog-content .dialog-actions button")
  .last()
  .click()
  .catch(() => {});
await b.close().catch(() => {});
let after;
await expect
  .poll(
    async () => {
      try {
        b = await chromium.connectOverCDP("http://127.0.0.1:9238", {
          timeout: 1500,
        });
        p = b
          .contexts()
          .flatMap((c) => c.pages())
          .find((p) => /tauri/.test(p.url()));
        if (!p) return "";
        after = await call("updater_status");
        if (after.currentVersion === "0.8.1") return after.currentVersion;
        await b.close();
        return "";
      } catch {
        return "";
      }
    },
    { timeout: 90000, intervals: [1000, 2000] },
  )
  .toBe("0.8.1");
expect(await call("load_settings")).toEqual(settings);
expect(await call("list_installations")).toEqual(items);
await p.locator(".sidebar-bottom .nav-item").click();
await p.locator(".launcher-updates").scrollIntoViewIfNeeded();
await p.screenshot({ path: root + "/native-after-install.png" });
await fs.writeFile(
  root + "/native-e2e.json",
  JSON.stringify(
    {
      from: "0.8.0",
      to: after.currentVersion,
      channel: after.channel,
      settingsPreserved: true,
      libraryPreserved: true,
      nsis: true,
      automaticRestart: true,
    },
    null,
    2,
  ),
);
console.log(
  "PASS actual signed NSIS update 0.8.0 -> 0.8.1, automatic restart and native data preservation",
);
await b.close();
