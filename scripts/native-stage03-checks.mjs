// Native-only checks against the actual built WebView/SQLite; no mock bridge.
import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => /tauri\.localhost|tauri:\/\//.test(p.url()));
if (!page) throw Error("No native PORT WebView");
const call = (command, args = {}) =>
  page.evaluate(
    ({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args),
    { command, args },
  );
const qa = path.resolve(".local/stage03");
const evidence = path.resolve(".local/evidence");
async function waitDone(timeout = 60000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const s = await call("install_status");
    if (!s.active) return s;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw Error("Native operation timed out");
}
try {
  const records = await call("list_installations");
  expect(records.length).toBeGreaterThan(0);
  const record = records[0];
  const inspected = await call("inspect_game_folder", {
    path: record.dataPath,
  });
  expect(inspected.titleId).toBe("CUSA03173");
  expect(inspected.version).toBe(record.version);
  expect(inspected.files).toBeGreaterThanOrEqual(28820);
  await fs.writeFile(
    path.join(qa, "native-folder-inspection.json"),
    JSON.stringify(inspected, null, 2),
  );
  try {
    await call("inspect_game_folder", { path: qa });
    throw Error("Missing eboot accepted");
  } catch (e) {
    expect(String(e)).toContain("eboot.bin");
  }
  try {
    await call("launch_installation", { id: "missing" });
    throw Error("Missing record accepted");
  } catch (e) {
    expect(String(e)).toContain("не найдена");
  }
  const parent = path.join(qa, "runtime-qa");
  await fs.mkdir(parent, { recursive: true });
  // Cancel at a real native checkpoint, then retry the same operation.
  await call("prepare_runtime", { parent });
  await call("cancel_install");
  expect((await waitDone()).phase).toBe("cancelled");
  const before = (await call("list_installations")).length;
  await call("prepare_runtime", { parent });
  expect((await waitDone()).phase).toBe("ready");
  expect((await call("list_installations")).length).toBe(before);
  const dirs = await fs.readdir(parent);
  expect(dirs.some((p) => p.startsWith(".port-stage-"))).toBe(false);
  await fs.writeFile(
    path.join(qa, "native-runtime-checks.json"),
    JSON.stringify(
      {
        cancel: true,
        retry: true,
        runtimeOnlyNoFakeLibrary: true,
        preparedFolders: dirs,
      },
      null,
      2,
    ),
  );
  const eb = path.join(record.dataPath, "eboot.bin");
  const backup = path.join(record.dataPath, "eboot.bin.port-qa-backup");
  await fs.rename(eb, backup);
  try {
    try {
      await call("launch_installation", { id: record.id });
      throw Error("Missing eboot launched");
    } catch (e) {
      expect(String(e)).toMatch(/не найден|cannot find|os error 2|Не удается/i);
    }
  } finally {
    await fs.rename(backup, eb);
  }
  await page.getByRole("button", { name: "Библиотека", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Играть", exact: true }).first(),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(evidence, "03-native-library-registered.png"),
  });
  if (process.argv.includes("--launch")) {
    await page
      .getByRole("button", { name: "Играть", exact: true })
      .first()
      .click();
    await expect(page.getByRole("status").first()).toContainText(
      /процесс runtime|документированный|создан/i,
      { timeout: 60000 },
    );
    await page.screenshot({
      path: path.join(evidence, "03-native-play-request.png"),
    });
    console.log("Native Play clicked;", await call("launch_status"));
    await new Promise((r) => setTimeout(r, 15000));
    let log = "";
    try {
      log = await fs.readFile(
        path.join(record.root, "user-data/user/last_run.log"),
        "utf8",
      );
    } catch {}
    await fs.writeFile(
      path.join(qa, "launch-observation.json"),
      JSON.stringify(
        {
          record: record.id,
          status: await call("launch_status"),
          logTail: log.slice(-16000),
          gameplayConfirmed: false,
        },
        null,
        2,
      ),
    );
    console.log("Launch log tail:", log.slice(-5000));
  }
  console.log(
    "Actual folder metadata, missing-file/record rejection, native runtime cancel/retry, registration and library checks passed. No synthetic gameplay claim.",
  );
} finally {
  await browser.close();
}
