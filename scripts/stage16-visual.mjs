// Local public-CMS replay for repeatable before/after geometry and artwork QA.
// Responses/art stay ignored; no credentials, CMS writes or archive requests.
import { chromium, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
const phase = process.argv[2] || "after";
const out = "C:/PORT/.local/evidence/16-visual";
const cache = `${out}/public-replay`;
await fs.mkdir(cache, { recursive: true });
if (
  phase === "before" &&
  (await fs.stat(`${out}/before-geometry.json`).catch(() => null))
)
  throw Error(
    "Before evidence already exists; preserve it instead of overwriting the baseline.",
  );
const origin = "https://port-catalog-cms.port-catalog-cms.workers.dev";
const read = async (path) => {
  const file = `${cache}/${createHash("sha256").update(path).digest("hex")}`;
  try {
    return await fs.readFile(file);
  } catch {
    const bytes = execFileSync(
      "curl.exe",
      [
        "--fail",
        "--silent",
        "--show-error",
        "--cacert",
        "C:/PORT/.local/cms-qa/localhost.pem",
        "--max-time",
        "20",
        `https://localhost:8787${path}`,
      ],
      { maxBuffer: 4 * 1024 * 1024 },
    );
    await fs.writeFile(file, bytes);
    return bytes;
  }
};
const browser = await chromium.launch();
const page = await browser.newPage({
  reducedMotion: "reduce",
  locale: "ru-RU",
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.route(`${origin}/**`, async (route) => {
  const u = new URL(route.request().url());
  const bytes = await read(u.pathname + u.search);
  await route.fulfill({
    contentType: u.pathname.startsWith("/media/")
      ? "image/webp"
      : "application/json",
    body: u.pathname.startsWith("/media/")
      ? bytes
      : bytes.toString().replaceAll("https://localhost:8787", origin),
  });
});
const metrics = [];
for (const [width, height] of [
  [1280, 720],
  [800, 600],
  [1920, 1080],
]) {
  await page.setViewportSize({ width, height });
  await page.goto("http://127.0.0.1:1420/");
  await expect(page.locator(".port-editorial .port-project")).toHaveCount(2);
  const shot = async (name, target) => {
    await page.locator("main").evaluate((el) => el.scrollTo(0, 0));
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(
        [...document.images].map((i) => i.decode().catch(() => {})),
      );
    });
    await page.screenshot({ path: `${out}/${phase}-${name}-${width}.png` });
    const rect = target
      ? await page.locator(target).first().boundingBox()
      : null;
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth > innerWidth ||
        document.querySelector("main").scrollWidth >
          document.querySelector("main").clientWidth,
    );
    metrics.push({ name, width, height, rect, overflow });
    if (phase === "after") {
      expect(overflow, `${name} ${width}: horizontal overflow`).toBe(false);
      if (rect)
        expect(
          rect.y,
          `${name} ${width}: primary content starts on screen`,
        ).toBeLessThan(height - 32);
    }
  };
  await shot("home", ".port-editorial .port-project");
  await page.getByRole("button", { name: "Каталог", exact: true }).click();
  await expect(page.locator(".hub-project-card")).toHaveCount(2);
  await shot("catalog", ".hub-project-card");
  for (const [key, name] of [
    ["zelda", "Zelda"],
    ["sonic", "Sonic"],
  ]) {
    await page
      .locator(".project-card-wrapper")
      .filter({ hasText: name })
      .locator(".hub-project-card")
      .click();
    await expect(
      page.getByRole("button", { name: "Скачать для Windows", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".project-hero img").first()).toBeVisible();
    await shot(key, ".project-download-button");
    if (phase === "after") {
      const b = await page.locator(".project-download-button").boundingBox();
      expect(b.y + b.height).toBeLessThanOrEqual(height);
    }
    await page.getByRole("button", { name: "Каталог", exact: true }).click();
  }
  await page.getByRole("button", { name: "Загрузки", exact: true }).click();
  await shot("downloads");
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await shot("settings");
}
expect(errors).toEqual([]);
await fs.writeFile(
  `${out}/${phase}-geometry.json`,
  JSON.stringify(
    {
      metrics,
      errors,
      source:
        "Read-only local public CMS replay; real artwork, browser screenshots, not native evidence",
    },
    null,
    2,
  ),
);
await browser.close();
console.log(`${phase}: ${metrics.length} screenshots captured`);
