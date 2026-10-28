// Only the isolated app.port.catalog-qa build. Never opens the owner's DB or games.
import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
const out = path.resolve("design/reviews/stage-11.1-catalog");
await fs.mkdir(out, { recursive: true });
const browser = await chromium.connectOverCDP("http://127.0.0.1:9225");
try {
  const page = browser
    .contexts()
    .flatMap((c) => c.pages())
    .find((p) => /tauri\.localhost|tauri:\/\//.test(p.url()));
  if (!page) throw Error("Isolated native WebView unavailable");
  const call = (command, args = {}) =>
    page.evaluate(
      ({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args),
      { command, args },
    );
  expect(await call("plugin:app|identifier")).toBe("app.port.catalog-qa");
  expect(await call("list_installations")).toEqual([]);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.getByRole("button", { name: "Каталог", exact: true }).click();
  await expect(page.locator(".hub-project-card").first()).toBeVisible({
    timeout: 60000,
  });
  await expect(
    page.getByRole("button", { name: "Обновить каталог" }),
  ).toBeEnabled({ timeout: 60000 });
  const snapshot = await call("load_catalog");
  expect(snapshot.source).not.toBe("demo");
  expect(snapshot.endpoint).toMatch(/^https:\/\//);
  const report = {
    endpoint: snapshot.endpoint,
    revision: snapshot.catalog.revision,
    projects: snapshot.catalog.games.map((g) => ({
      id: g.id,
      title: g.title,
      kind: g.implementation,
    })),
    widths: [],
    errors,
  };
  for (const width of [1440, 1024, 800]) {
    // QA-only capability; production permissions remain unchanged.
    await call("plugin:window|set_size", {
      label: "main",
      value: { Logical: { width, height: 960 } },
    });
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(width);
    await page.locator("main").evaluate((e) => e.scrollTo(0, 0));
    await expect
      .poll(() =>
        page.locator("main").evaluate((e) => e.scrollWidth <= e.clientWidth),
      )
      .toBe(true);
    await expect
      .poll(() =>
        page
          .locator(".hub-project-card img")
          .evaluateAll((imgs) =>
            imgs.every((img) => img.complete && img.naturalWidth > 0),
          ),
      )
      .toBe(true);
    await page.screenshot({ path: path.join(out, `native-${width}.png`) });
    await page.locator(".hub-project-card").first().scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.join(out, `native-cards-${width}.png`),
    });
    report.widths.push({
      width,
      method: "real Tauri window set_size",
      actual: await call("plugin:window|inner_size", { label: "main" }),
      layout: await page
        .locator("main")
        .evaluate((e) => ({ scroll: e.scrollWidth, client: e.clientWidth })),
    });
  }
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setDeviceMetricsOverride", {
    width: 480,
    height: 960,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await page.locator("main").evaluate((e) => e.scrollTo(0, 0));
  await expect
    .poll(() =>
      page.locator("main").evaluate((e) => e.scrollWidth <= e.clientWidth),
    )
    .toBe(true);
  await page.screenshot({ path: path.join(out, "native-emulated-480.png") });
  await page.locator(".hub-project-card").first().scrollIntoViewIfNeeded();
  await page.screenshot({
    path: path.join(out, "native-emulated-cards-480.png"),
  });
  report.widths.push({
    width: 480,
    method: "CDP emulation; physical native minimum remains 800",
  });
  await session.send("Emulation.clearDeviceMetricsOverride");
  await call("plugin:window|set_size", {
    label: "main",
    value: { Logical: { width: 1440, height: 960 } },
  });
  await expect.poll(() => page.evaluate(() => innerWidth)).toBe(1440);
  await page
    .getByRole("combobox", { name: "Исходная платформа", exact: true })
    .selectOption("Xbox 360");
  await expect(page.locator(".hub-project-card")).toHaveCount(
    snapshot.catalog.games.filter((g) => g.sourceConsole === "Xbox 360").length,
  );
  await page
    .getByRole("combobox", { name: "Технология", exact: true })
    .selectOption("recompilation");
  await page
    .getByRole("combobox", { name: "Сортировка", exact: true })
    .selectOption("name-desc");
  const name = snapshot.catalog.games.find(
    (g) =>
      g.sourceConsole === "Xbox 360" && g.implementation === "recompilation",
  ).title;
  await page
    .getByRole("textbox", { name: "Поиск по игре или проекту" })
    .fill(name);
  await expect(page.locator(".hub-project-card")).toHaveCount(1);
  await page.keyboard.press("Tab");
  await page.locator(".hub-project-card").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".detail-banner h1")).toHaveText(name);
  await page.getByRole("button", { name: "Каталог", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Поиск по игре или проекту" }),
  ).toHaveValue(name);
  await page.getByRole("button", { name: "Сбросить фильтры" }).click();
  await page
    .getByRole("combobox", { name: "Стадия разработки", exact: true })
    .selectOption("active");
  await expect(
    page.getByRole("heading", { name: "Ничего не найдено" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Сбросить фильтры" }).click();
  await page.getByRole("button", { name: "Недоступны", exact: true }).click();
  await expect(page.locator(".hub-project-card")).toHaveCount(
    snapshot.catalog.games.filter((g) => g.windowsBuild === "unavailable")
      .length,
  );
  await page.getByRole("button", { name: "Сбросить фильтры" }).click();
  await expect(page.locator(".hub-project-card")).toHaveCount(
    snapshot.catalog.games.length,
  );
  expect(errors).toEqual([]);
  report.interactions =
    "search, platform, technology, lifecycle, Windows availability, sorting, keyboard entry, navigation persistence and reset passed; no installation operation";
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const first = page.locator(".hub-project-card").first();
  await first.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  await first.hover();
  report.motion = await page.evaluate(() =>
    document.getAnimations().map((animation) => {
      animation.playbackRate = 0.1;
      return {
        duration: animation.effect?.getTiming().duration,
        playbackRate: animation.playbackRate,
      };
    }),
  );
  await page.waitForTimeout(700);
  await page.screenshot({
    path: path.join(out, "native-hover-10-percent.png"),
  });
  await page.evaluate(() =>
    document.getAnimations().forEach((animation) => animation.finish()),
  );
  await page.keyboard.press("Tab");
  await first.focus();
  await expect(first).toBeFocused();
  await page.screenshot({ path: path.join(out, "native-card-focus.png") });
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await first.evaluate((e) =>
      getComputedStyle(e)
        .transitionDuration.split(",")
        .every((s) => parseFloat(s) < 0.001),
    ),
  ).toBe(true);
  await expect(first).toHaveCSS("transform", "none");
  await expect(first.locator("img")).toHaveCSS("transform", "none");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.locator("main").evaluate((e) => e.scrollTo(0, 0));
  await fs.writeFile(
    path.join(out, "native-report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
