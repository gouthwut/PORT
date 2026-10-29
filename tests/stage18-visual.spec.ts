import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { stage18Fixture } from "./helpers/stage18-fixture";

const evidenceDir = path.resolve(
  process.cwd(),
  ".local/evidence/stage18d/regression-stage18",
);

test.beforeAll(() => {
  if (!fs.existsSync(evidenceDir)) {
    fs.mkdirSync(evidenceDir, { recursive: true });
  }
});

test("Stage 18: Home screen visual capture and first-screen density at 1280x720 and 1600x900", async ({
  page,
}) => {
  // 1. Check 1280x720 (Primary desktop baseline)
  await page.setViewportSize({ width: 1280, height: 720 });
  await stage18Fixture(page);
  await page.waitForTimeout(600);

  // Verify first screen: hero and first game card must be visible without scrolling
  const hero = page.locator(".featured-carousel");
  await expect(hero).toBeVisible();
  const heroBox = await hero.boundingBox();
  expect(heroBox).toBeTruthy();
  expect(heroBox!.y + heroBox!.height).toBeLessThan(450);

  const firstCard = page.locator(".port-editorial .port-project").first();
  await expect(firstCard).toBeVisible();
  const cardBox = await firstCard.boundingBox();
  expect(cardBox).toBeTruthy();
  // Must be visible within viewport height (720px) without scrolling!
  expect(cardBox!.y).toBeLessThan(720 - 60);

  // Verify no horizontal overflow
  const overflowInfo1280 = await page.locator("main").evaluate((el) => {
    return {
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      diff: el.scrollWidth - el.clientWidth,
    };
  });
  expect(overflowInfo1280.scrollWidth <= overflowInfo1280.clientWidth).toBe(
    true,
  );

  // Take screenshot at 1280x720
  await page.screenshot({
    path: path.join(evidenceDir, "01-home-1280x720.png"),
    fullPage: false,
  });

  // 2. Check 1600x900 (High-res presentation)
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.waitForTimeout(300);
  await page.screenshot({
    path: path.join(evidenceDir, "02-home-1600x900.png"),
    fullPage: false,
  });

  // 3. Check 800x600 (Compact desktop)
  await page.setViewportSize({ width: 800, height: 600 });
  await page.waitForTimeout(300);
  const overflowInfo800 = await page.locator("main").evaluate((el) => {
    return {
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      diff: el.scrollWidth - el.clientWidth,
    };
  });
  expect(overflowInfo800.scrollWidth <= overflowInfo800.clientWidth).toBe(true);
  await page.screenshot({
    path: path.join(evidenceDir, "03-home-800x600.png"),
    fullPage: false,
  });
});

test("Stage 18: Catalog screen visual capture across viewports", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await stage18Fixture(page);
  await page.getByRole("button", { name: "Каталог", exact: true }).click();
  await page.waitForTimeout(600);

  // Verify game cards are visible in first screen
  const cards = page.locator(".hub-project-card");
  await expect(cards.first()).toBeVisible();
  const cardBox = await cards.first().boundingBox();
  expect(cardBox!.y).toBeLessThan(720 - 80);

  await page.screenshot({
    path: path.join(evidenceDir, "04-catalog-1280x720.png"),
    fullPage: false,
  });

  // 1600x900
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.waitForTimeout(300);
  await page.screenshot({
    path: path.join(evidenceDir, "05-catalog-1600x900.png"),
    fullPage: false,
  });

  // 800x600
  await page.setViewportSize({ width: 800, height: 600 });
  await page.waitForTimeout(300);
  await page.screenshot({
    path: path.join(evidenceDir, "06-catalog-800x600.png"),
    fullPage: false,
  });
});

test("Stage 18: Project detail screen — Sonic Unleashed and Zelda 64 Recompiled", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await stage18Fixture(page);

  // Open Sonic Unleashed
  await page.getByRole("button", { name: "Каталог", exact: true }).click();
  await page
    .locator(".hub-project-card")
    .filter({ hasText: "Sonic Unleashed" })
    .click();
  await page.waitForTimeout(800);

  // Verify download button is visible
  const downloadBtn = page.getByRole("button", {
    name: "Скачать для Windows",
    exact: true,
  });
  await expect(downloadBtn).toBeVisible();

  await page.screenshot({
    path: path.join(evidenceDir, "07-project-sonic-1280x720.png"),
    fullPage: false,
  });

  // Switch to 1600x900
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.waitForTimeout(300);
  await page.screenshot({
    path: path.join(evidenceDir, "08-project-sonic-1600x900.png"),
    fullPage: false,
  });

  // Back to Catalog and Open Zelda
  await page.getByRole("button", { name: "Назад в каталог" }).click();
  await page.locator(".hub-project-card").filter({ hasText: "Zelda" }).click();
  await page.waitForTimeout(800);

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(300);
  await page.screenshot({
    path: path.join(evidenceDir, "09-project-zelda-1280x720.png"),
    fullPage: false,
  });
});

test("Stage 18: Downloads Center and Settings screens", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await stage18Fixture(page);

  // Downloads Center
  await page.getByRole("button", { name: "Загрузки", exact: true }).click();
  await page.waitForTimeout(400);
  await page.screenshot({
    path: path.join(evidenceDir, "10-downloads-1280x720.png"),
    fullPage: false,
  });

  // Settings
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await page.waitForTimeout(400);
  await page.screenshot({
    path: path.join(evidenceDir, "11-settings-1280x720.png"),
    fullPage: false,
  });
});

test("Stage 18: Hover states and fallback mode", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await stage18Fixture(page);

  // 1. Hover on primary CTA button on Home
  const cta = page.locator(".featured-slide.is-active .port-cta");
  await cta.hover();
  await page.waitForTimeout(250);
  await page.screenshot({
    path: path.join(evidenceDir, "12-home-hover-cta.png"),
    fullPage: false,
  });

  // 2. Hover on Catalog game card
  await page.getByRole("button", { name: "Каталог", exact: true }).click();
  const sonicCard = page
    .locator(".hub-project-card")
    .filter({ hasText: "Sonic Unleashed" });
  await sonicCard.hover();
  await page.waitForTimeout(250);
  await page.screenshot({
    path: path.join(evidenceDir, "13-catalog-hover-card.png"),
    fullPage: false,
  });

  // 3. Project page hover on button
  await sonicCard.click();
  await page.waitForTimeout(600);
  const downloadBtn = page.getByRole("button", {
    name: "Скачать для Windows",
    exact: true,
  });
  await expect(downloadBtn).toBeVisible();
  await page.screenshot({
    path: path.join(evidenceDir, "14-project-download-button.png"),
    fullPage: false,
  });

  // 4. Fallback mode (no-backdrop class)
  await page.evaluate(() => {
    document.documentElement.classList.add("no-backdrop");
  });
  await page.waitForTimeout(200);
  await page.screenshot({
    path: path.join(evidenceDir, "15-fallback-no-backdrop.png"),
    fullPage: false,
  });
});
