// Actual release WebView/IPC checks, with optional read-only user-package checks.
// Start PORT with process-only loopback CDP on 9223 before running this script.
import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";

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
const evidence = path.resolve(".local/evidence");
await fs.mkdir(evidence, { recursive: true });
const original = await call("load_settings");
const media = await call("load_media");
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const temp = await fs.mkdtemp(path.join(os.tmpdir(), "port-cont-qa-"));
try {
  await call("save_media", {
    media: { hero: "", cover: "", banner: "", gallery: [] },
  });
  await call("save_settings", {
    settings: { ...original, compactCards: !original.compactCards },
  });
  await page.context().setOffline(true);
  await page.reload();
  await expect(page.locator(".build-label")).toContainText("WINDOWS");
  await expect
    .poll(() =>
      page
        .locator(".hero img")
        .evaluate((e) => e.complete && e.naturalWidth > 0),
    )
    .toBeTruthy();
  expect((await call("load_settings")).compactCards).toBe(
    !original.compactCards,
  );
  await expect(page.locator("main > div")).toHaveCSS("opacity", "1");
  await page.screenshot({
    path: path.join(evidence, "02-cont-native-home-offline.png"),
  });
  await page.getByRole("button", { name: "Подробнее: Bloodborne" }).click();
  await expect
    .poll(() =>
      page
        .locator(".detail-banner img")
        .evaluate((e) => e.complete && e.naturalWidth > 0),
    )
    .toBeTruthy();
  await expect(
    page.getByRole("button", { name: /^Открыть скриншот/ }),
  ).toHaveCount(4);
  await expect(page.locator("main > div")).toHaveCSS("opacity", "1");
  await page.screenshot({
    path: path.join(evidence, "02-cont-native-details-offline.png"),
  });
  const thumb = page.getByRole("button", {
    name: "Открыть скриншот 1",
    exact: true,
  });
  await thumb.click();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("dialog")).toContainText("4 / 4");
  await expect
    .poll(() =>
      page
        .getByRole("dialog")
        .locator("img")
        .evaluate((e) => e.complete && e.naturalWidth > 0),
    )
    .toBeTruthy();
  await page.screenshot({
    path: path.join(evidence, "02-cont-native-gallery-offline.png"),
  });
  await page.keyboard.press("Escape");
  await expect(thumb).toBeFocused();
  await page.context().setOffline(false);
  const fixture = path.join(temp, "broken.pkg");
  await fs.writeFile(fixture, "not a PKG");
  const broken = await call("inspect_packages", { paths: [fixture] });
  expect(broken.metadataCompatible).toBe(false);
  expect(broken.items[0].error).toBeTruthy();
  await expect(call("inspect_packages", { paths: [] })).rejects.toBeTruthy();
  const directory = process.argv[2];
  if (directory) {
    const packages = (await fs.readdir(directory))
      .filter((n) => n.toLowerCase().endsWith(".pkg"))
      .map((n) => path.resolve(directory, n));
    expect(packages).toHaveLength(2);
    async function snapshot(file) {
      const stat = await fs.stat(file);
      const handle = await fs.open(file, "r");
      try {
        const header = Buffer.alloc(0x5a0);
        await handle.read(header, 0, header.length, 0);
        return {
          size: stat.size,
          modified: stat.mtimeMs,
          headerSha256: createHash("sha256").update(header).digest("hex"),
        };
      } finally {
        await handle.close();
      }
    }
    const before = await Promise.all(packages.map(snapshot));
    const selection = await call("inspect_packages", {
      paths: packages.toReversed(),
    });
    expect(selection.metadataCompatible).toBe(true);
    expect(selection.installable).toBe(false);
    const base = selection.items.find((p) => p.inspection?.role === "base");
    const update = selection.items.find((p) => p.inspection?.role === "update");
    expect(base.inspection.version).toBe("01.00");
    expect(update.inspection.version).toBe("01.09");
    expect(base.inspection.contentId).toBe(update.inspection.contentId);
    expect(base.inspection.pfsEncrypted).toBe(true);
    expect(update.inspection.pfsEncrypted).toBe(true);
    const basePath = packages.find((p) => path.basename(p) === base.fileName);
    const single = await call("inspect_packages", { paths: [basePath] });
    expect(single.metadataCompatible).toBe(true);
    expect(single.summary).toContain("30 FPS");
    const duplicate = await call("inspect_packages", {
      paths: [basePath, basePath],
    });
    expect(duplicate.metadataCompatible).toBe(false);
    expect(await Promise.all(packages.map(snapshot))).toEqual(before);
    await fs.writeFile(
      path.join(evidence, "02-cont-native-packages.json"),
      JSON.stringify(selection, null, 2),
    );
    console.log(
      "Actual two packages: CUSA03173 base 01.00 + update 01.09, identical Content ID, encrypted PFS. Single base accepted for metadata; duplicate blocked. Source sizes/mtime/header SHA unchanged (not a full-file hash).",
    );
  }
  expect(errors).toEqual([]);
  console.log(
    "Native release: cold offline artwork, gallery keys/focus, SQLite reload, malformed selection and retry checks passed.",
  );
} finally {
  await page.context().setOffline(false);
  await call("save_settings", { settings: original });
  await call("save_media", { media });
  await page.reload();
  expect(await call("load_settings")).toEqual(original);
  expect(await call("load_media")).toEqual(media);
  if (
    !path.resolve(temp).startsWith(path.resolve(os.tmpdir()) + path.sep) ||
    !path.basename(temp).startsWith("port-cont-qa-")
  )
    throw Error("Unsafe temp cleanup");
  await fs.rm(temp, { recursive: true, force: true });
  await browser.close();
}
