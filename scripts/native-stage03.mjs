// Actual release WebView/Rust IPC checks. --install explicitly uses the user's named PKGs.
// No mock bridge; no claim of gameplay from process creation.
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
const root = path.resolve(".local/stage03");
await fs.mkdir(root, { recursive: true });
const evidence = path.resolve(".local/evidence");
await fs.mkdir(evidence, { recursive: true });
const output = path.resolve(".local/installations");
await fs.mkdir(output, { recursive: true });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
async function wait(command, done, timeout = 60000) {
  const end = Date.now() + timeout;
  let previous = "";
  let lastBytes = -(1024 ** 3);
  while (Date.now() < end) {
    const s = await call(command);
    const label = `${s.phase}: ${s.message} (${s.completed}/${s.total})`;
    if (
      previous !== s.phase ||
      s.completed - lastBytes >= 1024 ** 3 ||
      !s.active
    ) {
      console.log(label);
      previous = s.phase;
      lastBytes = s.completed;
    }
    if (done(s)) return s;
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw Error(`Timed out: ${command}`);
}
try {
  await expect(page.locator(".build-label")).toContainText("WINDOWS");
  expect(await call("pkg_install_available")).toBe(true);
  const cache = await call("plugin:path|resolve_directory", { directory: 16 });
  console.log("Actual native cache:", cache);
  const info = await fs.statfs(output);
  console.log(
    "Available installation bytes:",
    Number(info.bavail) * Number(info.bsize),
  );
  await call("start_download");
  const downloaded = await wait("download_status", (s) => !s.active, 300000);
  expect(downloaded.phase).toBe("ready");
  console.log("Pinned runtime verified:", downloaded.path);
  const original = await call("load_settings");
  expect(original.theme).toMatch(/dark|system/);
  if (process.argv.includes("--install")) {
    const paths = [
      "C:\\Bloodborne_GOTY_Patch_PKGS\\Bloodborne.Game.of.the.Year.Edition.PS4-PRELUDE.pkg",
      "C:\\Bloodborne_GOTY_Patch_PKGS\\CUSA03173-EUR-Update-v1.09-PRELUDE-[PS4ID].pkg",
    ];
    const metadata = await call("inspect_packages", { paths });
    expect(metadata.metadataCompatible).toBe(true);
    await fs.writeFile(
      path.join(root, "actual-pkg-inspection.json"),
      JSON.stringify(metadata, null, 2),
    );
    await call("install_packages", { paths, parent: output });
    const installed = await wait(
      "install_status",
      (s) => !s.active,
      45 * 60 * 1000,
    );
    await fs.writeFile(
      path.join(root, "install-result.json"),
      JSON.stringify(installed, null, 2),
    );
    expect(installed.phase).toBe("ready");
    const records = await call("list_installations");
    expect(records.length).toBeGreaterThan(0);
    await fs.writeFile(
      path.join(root, "native-installations.json"),
      JSON.stringify(records, null, 2),
    );
    await page.getByRole("button", { name: "Библиотека", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Играть", exact: true }).first(),
    ).toBeVisible();
    await page.screenshot({
      path: path.join(evidence, "03-native-library-actual-pkg.png"),
    });
    console.log(
      "Actual PKG base extracted, runtime installed, SQLite library registered. Update not applied. Gameplay not tested.",
    );
  }
  expect(errors).toEqual([]);
} finally {
  await browser.close();
}
