// Run the release exe with loopback CDP 9223 in its process environment first.
// Native backend / WebView evidence. Fixtures contain no game data.
import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => /tauri\.localhost|tauri:\/\//.test(p.url()));
if (!page) throw Error("No native WebView");
const call = (command, args = {}) =>
  page.evaluate(
    ({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args),
    { command, args },
  );
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const directory = await fs.mkdtemp(path.join(os.tmpdir(), "port-qa-"));
const fixture = path.join(directory, "metadata-only.pkg");
const b = Buffer.alloc(0x600);
b.write("\x7fCNT", 0, "binary");
b.writeUInt32BE(1, 0x10);
b.writeUInt32BE(0x5a0, 0x18);
b.write("EP9000-CUSA03173_00-BLOODBORNE000000", 0x40);
b.writeUInt32BE(0x1a, 0x74);
b.writeBigUInt64BE(BigInt(b.length), 0x430);
await fs.writeFile(fixture, b);
try {
  await expect(page.locator(".build-label")).toContainText("WINDOWS");
  const original = await call("load_settings");
  try {
    await call("save_settings", {
      settings: { ...original, reducedMotion: !original.reducedMotion },
    });
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "За пределами консоли." }),
    ).toBeVisible();
    expect((await call("load_settings")).reducedMotion).toBe(
      !original.reducedMotion,
    );
  } finally {
    await call("save_settings", { settings: original });
  }
  const report = await call("inspect_package", { path: fixture });
  expect(report.titleId).toBe("CUSA03173");
  expect(report.compatible).toBe(false);
  expect(await fs.readFile(fixture)).toEqual(b);
  await fs.writeFile(path.join(directory, "not-pkg.pkg"), "not a package");
  await expect(
    call("inspect_package", { path: path.join(directory, "not-pkg.pkg") }),
  ).rejects.toBeTruthy();
  await expect(page.locator("main > div")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: ".local/evidence/02-native-home.png" });
  // The current installer opens an OS dialog immediately; native-continuation
  // and Computer Use cover it separately. Keep this downloader smoke non-modal.
  await page.getByRole("button", { name: /^Загрузки/ }).click();
  await expect(
    page.getByRole("button", { name: "Скачать компоненты" }),
  ).toBeEnabled();
  await page.screenshot({
    path: ".local/evidence/02-native-download-panel.png",
  });
  await page.getByRole("button", { name: "Главная", exact: true }).click();
  const originalMedia = await call("load_media");
  try {
    const png = await page.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = 640;
      c.height = 360;
      const x = c.getContext("2d");
      x.fillStyle = "#252432";
      x.fillRect(0, 0, 640, 360);
      x.fillStyle = "#c4b5fd";
      x.font = "24px sans-serif";
      x.fillText("PORT QA FIXTURE - NOT GAME ART", 50, 180);
      return c.toDataURL("image/png").split(",")[1];
    });
    const imagePath = path.join(directory, "qa-media.png");
    await fs.writeFile(imagePath, Buffer.from(png, "base64"));
    await page.getByRole("button", { name: "Подробнее: Bloodborne" }).click();
    await page
      .getByText("Заменить оформление на своё", { exact: true })
      .click();
    await page.getByRole("button", { name: /^Главный hero/ }).click();
    // The native WebView file input uses the OS picker. Playwright supplies only our QA image.
    await page.locator('input[type="file"]').setInputFiles(imagePath);
    await expect(
      page.getByRole("button", { name: "Главный hero ✓", exact: true }),
    ).toBeEnabled();
    expect((await call("load_media")).hero).toMatch(
      /^data:image\/webp;base64,/,
    );
    await page.reload();
    await expect(page.locator(".hero img.game-art")).toBeVisible();
    console.log(
      "Native image import encoded to WebP, saved in SQLite and survived WebView reload.",
    );
  } finally {
    await call("save_media", { media: originalMedia });
    await page.reload();
  }
  console.log(
    "Native settings preserved; SQLite roundtrip and read-only PKG metadata/error paths passed.",
  );
  if (process.argv.includes("--download")) {
    const wait = async (predicate, timeout = 180000) => {
      const until = Date.now() + timeout;
      while (Date.now() < until) {
        const s = await call("download_status");
        if (predicate(s)) return s;
        if (s.phase === "error") throw Error(s.message);
        await new Promise((r) => setTimeout(r, 200));
      }
      throw Error("Download status timeout");
    };
    await call("start_download");
    let status = await wait(
      (s) =>
        (s.phase === "downloading" && s.completed > 0) ||
        (s.phase === "ready" && !s.active),
    );
    if (status.phase !== "ready") {
      await call("control_download", { action: "cancel" });
      status = await wait((s) => s.phase === "cancelled" && !s.active);
      expect(status.completed).toBe(0);
      console.log(
        "Real download cancellation and partial-file cleanup passed.",
      );
      await call("start_download");
      await wait((s) => s.completed > 0);
      await call("control_download", { action: "pause" });
      await new Promise((r) => setTimeout(r, 1200));
      const paused = await call("download_status");
      expect(paused.phase).toBe("paused");
      await new Promise((r) => setTimeout(r, 800));
      expect((await call("download_status")).completed).toBe(paused.completed);
      await call("control_download", { action: "resume" });
      console.log("Real download pause and Range resume requested.");
    }
    status = await wait((s) => s.phase === "ready" && !s.active, 300000);
    const bytes = await fs.readFile(status.path);
    expect(bytes.length).toBe(189268960);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      "b94390545fa72c05f0800f7cd7b5aa9fa4424fbb0e268a5b25bfa48331fa8f5a",
    );
    await page.getByRole("button", { name: /^Загрузки/ }).click();
    await expect(page.getByText(/Архив проверен ·/)).toBeVisible();
    await expect(page.locator("main > div")).toHaveCSS("opacity", "1");
    await page.screenshot({
      path: ".local/evidence/02-native-verified-download.png",
    });
    console.log(
      "Official release artifact verified: exact size, SHA-256, ZIP CRC and entry checks passed. Nothing extracted or executed.",
    );
  }
  expect(errors).toEqual([]);
} finally {
  await fs.rm(directory, { recursive: true, force: true });
  await browser.close();
}
