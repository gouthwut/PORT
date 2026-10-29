// Visual QA in the isolated debug identity. Never starts a download or game.
import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
const out = "C:/PORT/.local/evidence/16-visual";
const replay = process.argv.includes("--replay");
const browser = await chromium.connectOverCDP("http://127.0.0.1:9238");
try {
  const page = browser
    .contexts()
    .flatMap((c) => c.pages())
    .find((p) => /^http:\/\/127\.0\.0\.1:142[02]\//.test(p.url()));
  if (!page) throw Error("Isolated Stage 16 WebView missing");
  await page.emulateMedia({ reducedMotion: "reduce" });
  if (replay) {
    const origin = "https://port-catalog-cms.port-catalog-cms.workers.dev";
    await page.route(`${origin}/**`, async (route) => {
      const url = new URL(route.request().url());
      const key = createHash("sha256")
        .update(url.pathname + url.search)
        .digest("hex");
      const bytes = await fs.readFile(`${out}/public-replay/${key}`);
      await route.fulfill({
        contentType: url.pathname.startsWith("/media/")
          ? "image/webp"
          : "application/json",
        body: url.pathname.startsWith("/media/")
          ? bytes
          : bytes.toString().replaceAll("https://localhost:8787", origin),
      });
    });
    // The normal frontend uses fetch; replay changes neither native IPC nor files.
    await page.goto("http://127.0.0.1:1420/");
  }
  const call = (command, args = {}) =>
    page.evaluate(
      ({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args),
      { command, args },
    );
  expect(await call("plugin:app|identifier")).toBe("app.port.cms-qa");
  expect(await call("list_installations")).toEqual([]);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const metrics = [];
  const shot = async (name) => {
    const target = name.includes("home")
      ? ".port-home"
      : name.includes("catalog")
        ? ".hub-catalog-layout"
        : name === "downloads"
          ? ".downloads-center"
          : name === "settings"
            ? ".settings-layout"
            : ".project-hero";
    await expect(page.locator(target)).toBeVisible();
    await expect(page.locator("main > div")).toHaveCSS("opacity", "1");
    await page.locator("main").evaluate((el) => el.scrollTo(0, 0));
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(
        [...document.images].map((i) => i.decode().catch(() => {})),
      );
    });
    const dimensions = await page.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
      overflow:
        document.querySelector("main").scrollWidth >
        document.querySelector("main").clientWidth,
    }));
    expect(dimensions.overflow).toBe(false);
    await page.screenshot({
      path: `${out}/native-${replay ? "replay-" : ""}after-${name}-${dimensions.width}.png`,
    });
    metrics.push({ name, ...dimensions });
  };
  for (const [width, height] of [
    [1280, 720],
    [800, 600],
  ]) {
    await page.evaluate(
      async ({ width, height }) => {
        const { getCurrentWindow, LogicalSize } =
          await import("/node_modules/@tauri-apps/api/window.js");
        await getCurrentWindow().setSize(new LogicalSize(width, height));
      },
      { width, height },
    );
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(width);
    await page.getByRole("button", { name: "Главная", exact: true }).click();
    await expect(page.locator(".port-editorial .port-project")).toHaveCount(2, {
      timeout: 30000,
    });
    await shot("home");
    await page.getByRole("button", { name: "Каталог", exact: true }).click();
    await expect(page.locator(".hub-project-card")).toHaveCount(2);
    await shot("catalog");
    const card = await page.locator(".hub-project-card").first().boundingBox();
    expect(card.y).toBeLessThan(height - 100);
    for (const [key, name] of [
      ["zelda", "Zelda"],
      ["sonic", "Sonic"],
    ]) {
      await page
        .locator(".project-card-wrapper")
        .filter({ hasText: name })
        .locator(".hub-project-card")
        .click();
      const download = page.getByRole("button", {
        name: "Скачать для Windows",
        exact: true,
      });
      await expect(download).toBeEnabled({ timeout: 30000 });
      await page.mouse.move(5, 5);
      expect(
        await download.evaluate((el) => getComputedStyle(el).backgroundImage),
      ).toContain("rgb(255, 230, 156)");
      const rect = await download.boundingBox();
      expect(rect.y + rect.height).toBeLessThanOrEqual(height);
      await shot(key);
      await page
        .getByRole("button", { name: "Открыть скриншот 1", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await page.getByRole("button", { name: "Каталог", exact: true }).click();
    }
    await page.getByRole("button", { name: "Загрузки", exact: true }).click();
    await shot("downloads");
    await page.getByRole("button", { name: "Настройки", exact: true }).click();
    await shot("settings");
  }
  await page
    .getByRole("button", { name: "Развернуть окно", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Восстановить окно", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Главная", exact: true }).click();
  await shot("maximized-home");
  await page.getByRole("button", { name: "Каталог", exact: true }).click();
  await shot("maximized-catalog");
  await page
    .getByRole("button", { name: "Восстановить окно", exact: true })
    .click();
  expect(await call("hub_download_history")).toEqual([]);
  expect(errors).toEqual([]);
  await fs.writeFile(
    `${out}/native-${replay ? "replay-" : ""}geometry.json`,
    JSON.stringify(
      {
        identity: "app.port.cms-qa",
        storage: "C:/PORT/.local/stage16/app-data",
        metrics,
        errors,
        downloadsStarted: 0,
        source: replay
          ? "Recorded public CMS responses in the real native renderer; not live CMS or transfer evidence"
          : "Live local public CMS over the existing trusted Rust HTTPS transport",
      },
      null,
      2,
    ),
  );
  console.log(
    `Native Stage 16: ${replay ? "recorded public CMS replay" : "live local public CMS"}, two sizes, enabled CTA, gallery/Escape and maximize passed; no download started.`,
  );
} finally {
  await browser.close();
}
