import { test, expect } from "@playwright/test";
import { project14Fixture } from "./helpers/project14-fixture";

for (const [width, height] of [
  [1280, 720],
  [800, 600],
  [1920, 1080],
]) {
  test(`Stage 16: first-screen content, filter disclosure and project anchors ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await project14Fixture(page, true);
    const download = page.getByRole("button", {
      name: "Скачать для Windows",
      exact: true,
    });
    const action = await download.boundingBox();
    expect(action!.y + action!.height).toBeLessThanOrEqual(height);
    // Stage 18B accepts suitable 1280px CMS frames for the artwork area.
    await expect(
      page.locator(".project-hero[data-artwork='wide']"),
    ).toHaveCount(1);
    await expect(
      page.locator('.project-section-nav a[href="#project-issues"]'),
    ).toHaveCount(0);
    await page
      .locator('.project-section-nav a[href="#project-install"]')
      .click();
    await expect(page.locator("#project-install")).toHaveAttribute("open", "");
    await expect(page.locator("#project-install ol")).toBeVisible();
    await page.getByRole("button", { name: "Главная", exact: true }).click();
    const homeCardLocator = page
      .locator(".port-editorial .port-project")
      .first();
    await homeCardLocator.waitFor({ state: "visible" });
    const homeCard = await homeCardLocator.boundingBox();
    // The featured carousel keeps the first artwork visible even at 800×600.
    expect(homeCard!.y).toBeLessThan(height - 32);
    await page.getByRole("button", { name: "Каталог", exact: true }).click();
    const card = page.locator(".hub-project-card");
    await card.first().waitFor({ state: "visible" });
    const rect = await card.first().boundingBox();
    expect(rect!.y).toBeLessThan(height - 100);
    // Stage 18C uses wide artwork cards and a single column on compact windows.
    expect(rect!.width).toBeLessThanOrEqual(880);
    if (width === 800) {
      const toggle = page.getByRole("button", {
        name: "Фильтры каталога",
        exact: true,
      });
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await expect(
        page.getByLabel("Исходная платформа", { exact: true }),
      ).toBeHidden();
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      await page
        .getByLabel("Исходная платформа", { exact: true })
        .selectOption("Xbox 360");
      await toggle.click();
      await expect(card).toHaveCount(1);
      await expect(toggle).toContainText("●");
    }
    expect(
      await page
        .locator("main")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await page.getByRole("button", { name: "Загрузки", exact: true }).click();
    await page
      .getByRole("button", { name: "Исследовать каталог", exact: true })
      .click();
    await expect(card).toHaveCount(1);
  });
}

test("Stage 16: sufficiently wide CMS image stays bounded", async ({
  page,
}) => {
  await project14Fixture(page, false, true);
  await expect(page.locator(".project-hero[data-artwork='wide']")).toHaveCount(
    1,
  );
  const image = page.locator(".project-hero .universal-frame");
  expect((await image.boundingBox())!.width).toBeLessThanOrEqual(
    (await page.locator(".project-hero").boundingBox())!.width,
  );
  expect(await image.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(
    1600,
  );
});

test("Stage 16: large catalog uses dense columns and bounded covers", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const { project } = await project14Fixture(page);
  const items = Array.from({ length: 40 }, (_, i) => ({
    ...project,
    id: `qa-density-${i}`,
  }));
  await page.route(/\/v2\/projects(\?.*)?$/, (route) =>
    route.fulfill({
      json: { schemaVersion: 2, items, total: items.length, nextCursor: null },
    }),
  );
  await page.reload();
  await page.getByRole("button", { name: "Каталог", exact: true }).click();
  await expect(page.locator(".hub-project-card")).toHaveCount(24);
  expect(
    await page
      .locator(".hub-catalog-grid")
      .evaluate(
        (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
      ),
  ).toBeGreaterThanOrEqual(3);
  expect(
    (await page.locator(".hub-project-card").first().boundingBox())!.width,
  ).toBeLessThanOrEqual(520);
  await page.getByRole("button", { name: "Далее", exact: true }).click();
  await expect(page.locator(".hub-project-card")).toHaveCount(16);
});
