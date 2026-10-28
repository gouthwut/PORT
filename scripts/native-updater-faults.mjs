// Real Rust IPC against the isolated 0.8.0 QA build and local TLS fixture only.
import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
const root = ".local/stage08";
const b = await chromium.connectOverCDP("http://127.0.0.1:9238");
const p = b
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => /tauri/.test(p.url()));
if (!p) throw Error("No native WebView");
const call = (command, args = {}) =>
  p.evaluate(
    ({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args),
    { command, args },
  );
const mode = async (v) => fs.writeFile(root + "/mode.txt", v);
const report = [];
const record = async (name, fn) => {
  await fn();
  report.push(name);
  console.log("PASS", name);
  await fs.writeFile(
    root + "/native-faults.json",
    JSON.stringify(report, null, 2),
  );
};
try {
  expect((await call("updater_status")).currentVersion).toBe("0.8.0");
  expect((await call("updater_status")).channel).toBe("isolated-test");
  await record("startup discovers a real HTTPS update", async () => {
    await expect
      .poll(async () => (await call("updater_status")).phase)
      .toBe("available");
  });
  await record("current and manual repeat", async () => {
    await mode("current");
    await call("check_app_update");
    expect((await call("updater_status")).phase).toBe("current");
    await call("check_app_update");
  });
  for (const m of ["invalid", "wrongtarget", "unsigned", "http", "untrusted"])
    await record("reject manifest " + m, async () => {
      await mode(m);
      await expect(call("check_app_update")).rejects.toBeDefined();
      expect((await call("updater_status")).phase).toBe("error");
    });
  await record("deduplicate concurrent native checks", async () => {
    await mode("slowcheck");
    const first = call("check_app_update").then(
      () => ({ ok: true }),
      (e) => ({ error: e }),
    );
    await expect
      .poll(async () => (await call("updater_status")).phase)
      .toBe("checking");
    await expect(call("check_app_update")).rejects.toBeDefined();
    expect((await first).ok).toBe(true);
  });
  for (const m of [
    "badsig",
    "tampered",
    "wrongversion",
    "disconnect",
    "oversized",
    "redirect",
  ])
    await record("reject download " + m, async () => {
      await mode(m);
      await call("check_app_update");
      await expect(call("download_app_update")).rejects.toBeDefined();
      expect((await call("updater_status")).downloaded).toBe(false);
    });
  await record("cancel a real HTTP transfer", async () => {
    await mode("slow");
    await call("check_app_update");
    const transfer = call("download_app_update").then(
      () => ({ ok: true }),
      (e) => ({ error: e }),
    );
    await expect
      .poll(async () => (await call("updater_status")).completed)
      .toBeGreaterThan(0);
    await call("cancel_app_update");
    expect((await transfer).error).toBeDefined();
    expect((await call("updater_status")).downloaded).toBe(false);
  });
  await record("retry and verify actual signed NSIS package", async () => {
    await mode("available");
    await call("check_app_update");
    await call("download_app_update");
    const s = await call("updater_status");
    expect(s.phase).toBe("ready");
    expect(s.downloaded).toBe(true);
    expect(s.completed).toBeGreaterThan(80000000);
  });
  await record("refuse install without explicit consent", async () => {
    await expect(
      call("install_app_update", { confirmed: false }),
    ).rejects.toBeDefined();
    expect((await call("updater_status")).downloaded).toBe(true);
  });
  await call("save_settings", {
    settings: {
      theme: "dark",
      installDir: "C:\\PORT\\.local\\stage08\\fixtures",
      compactCards: true,
      reducedMotion: true,
    },
  });
  await fs.writeFile(
    root + "/qa-settings-before.json",
    JSON.stringify(await call("load_settings")),
  );
  await p.locator(".sidebar-bottom .nav-item").click();
  await p.locator(".launcher-updates > button").last().click();
  await p.locator(".dialog-content .dialog-actions button").first().click();
  expect((await call("updater_status")).downloaded).toBe(true);
  await p.locator(".launcher-updates").scrollIntoViewIfNeeded();
  await p.screenshot({ path: root + "/native-ready.png" });
  await fs.writeFile(
    root + "/qa-catalog-before.json",
    JSON.stringify(await call("load_catalog")),
  );
  console.log("Native real update ready; installer has not yet run");
} finally {
  await b.close();
}
