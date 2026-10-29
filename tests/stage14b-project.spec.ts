import { test, expect } from "@playwright/test";
import { project14Fixture } from "./helpers/project14-fixture";

for (const sonic of [false, true]) {
  test(`Stage 14B: ${sonic ? "Sonic" : "Zelda"} responsive gallery, keyboard, facts and disclosures`, async ({
    page,
  }) => {
    const { name } = await project14Fixture(page, sonic);
    await expect(
      page.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
    await expect(page.locator(".project-hero img")).toBeVisible();
    await expect(page.locator(".project-facts")).toContainText("QA-команда");
    await expect(page.locator(".project-facts")).toContainText(
      "Windows · Linux",
    );
    await expect(page.locator(".hub-project-page")).not.toContainText(
      /Не указано|upstreamAssetId|unknown|stage14b-build/,
    );
    const changelog = page.locator(".project-changelog");
    await expect(changelog).not.toHaveAttribute("open", "");
    await expect(changelog.locator("p")).toBeHidden();
    await changelog.locator("summary").click();
    await expect(changelog.locator("p")).toBeVisible();
    await changelog.locator("summary").click();
    await page.getByText("Инструкция", { exact: true }).click();
    await expect(
      page.getByText("Тестовая инструкция:", { exact: false }),
    ).toBeVisible();
    for (const [width, height] of [
      [1440, 960],
      [1024, 768],
      [800, 600],
      [480, 800],
    ]) {
      await page.setViewportSize({ width, height });
      await page.locator("main").evaluate((el) => el.scrollTo(0, 0));
      const button = page.getByRole("button", {
        name: "Скачать для Windows",
        exact: true,
      });
      await expect(button).toBeVisible();
      const bounds = await button.boundingBox();
      expect(bounds!.y).toBeGreaterThan(0);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(height);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `.local/evidence/14b/browser-${sonic ? "sonic" : "zelda"}-${width}.png`,
        fullPage: true,
      });
    }
    const strip = page.locator(".project-gallery .screenshot-grid");
    await page
      .getByRole("button", { name: "Прокрутить скриншоты вперёд" })
      .click();
    await expect
      .poll(() => strip.evaluate((el) => el.scrollLeft))
      .toBeGreaterThan(0);
    const first = page.getByRole("button", {
      name: "Открыть скриншот 1",
      exact: true,
    });
    await first.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toContainText("скриншот 1 / 4");
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("dialog")).toContainText("скриншот 2 / 4");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(first).toBeFocused();
  });
}
