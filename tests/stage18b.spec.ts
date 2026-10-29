import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import { project14Fixture } from "./helpers/project14-fixture";

for (const [width, height] of [
  [800, 600],
  [1280, 720],
  [1600, 900],
]) {
  test(`Stage 18B: cinema artwork, CTA and gallery at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await project14Fixture(page, true);
    await expect(page.locator(".project-hero-wide")).toBeVisible();
    const hero = (await page.locator(".project-hero").boundingBox())!;
    const artwork = (await page.locator(".project-hero > img").boundingBox())!;
    expect(Math.abs(artwork.width - hero.width)).toBeLessThan(3);
    expect(Math.abs(artwork.height - hero.height)).toBeLessThan(3);
    const action = (await page
      .locator(".project-download-button")
      .boundingBox())!;
    expect(action.y + action.height).toBeLessThan(height);
    await expect(page.locator(".project-download-button")).toBeDisabled();
    const gallery = (await page.locator(".project-gallery").boundingBox())!;
    expect(gallery.y - hero.y - hero.height).toBeLessThan(32);
    expect(
      await page
        .locator("main")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await page.evaluate(() =>
      document.documentElement.classList.add("no-backdrop"),
    );
    await expect(page.locator(".project-hero")).toHaveCSS(
      "backdrop-filter",
      "none",
    );
    await expect(page.locator(".project-hero > img")).toBeVisible();
  });
}

test("Stage 18B: skip portrait gallery frame; compact cover fallback has no empty gallery", async ({
  page,
}) => {
  const { project } = await project14Fixture(page);
  const portrait = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 300;
    canvas.height = 450;
    return canvas.toDataURL("image/webp").split(",")[1];
  });
  const bytes = Buffer.from(portrait, "base64");
  const url = `https://port-catalog-cms.port-catalog-cms.workers.dev/media/${createHash("sha256").update(bytes).digest("hex")}.webp`;
  await page.route(url, (route) =>
    route.fulfill({ contentType: "image/webp", body: bytes }),
  );
  project.media.screenshots.unshift(url);
  await page.reload();
  await page.getByRole("button", { name: "Каталог", exact: true }).click();
  await page.locator(".hub-project-card").click();
  await expect(page.locator(".project-hero-wide")).toBeVisible();
  expect(
    await page
      .locator(".project-hero > img")
      .evaluate((el: HTMLImageElement) => el.naturalWidth),
  ).toBe(1280);
  project.media.screenshots = [];
  await page.reload();
  await page.getByRole("button", { name: "Каталог", exact: true }).click();
  await page.locator(".hub-project-card").click();
  await expect(page.locator(".project-hero-wide")).toHaveCount(0);
  await expect(page.locator(".project-gallery")).toHaveCount(0);
  expect(
    (await page.locator(".project-hero").boundingBox())!.height,
  ).toBeLessThan(400);
});
