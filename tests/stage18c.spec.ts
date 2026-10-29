import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import { project14Fixture } from "./helpers/project14-fixture";

const origin = "https://port-catalog-cms.port-catalog-cms.workers.dev";
test("Stage 18C: shared cards skip portrait and low-resolution gallery frames", async ({
  page,
}) => {
  const { project } = await project14Fixture(page, true);
  for (const [width, height] of [
    [300, 450],
    [640, 360],
    [1600, 900],
  ]) {
    const encoded = await page.evaluate(
      ({ width, height }) => {
        const c = document.createElement("canvas");
        c.width = width;
        c.height = height;
        const ctx = c.getContext("2d")!;
        ctx.fillStyle = "#30486b";
        ctx.fillRect(0, 0, width, height);
        return c.toDataURL("image/webp").split(",")[1];
      },
      { width, height },
    );
    const bytes = Buffer.from(encoded, "base64");
    const url = `${origin}/media/${createHash("sha256").update(bytes).digest("hex")}.webp`;
    await page.route(url, (r) =>
      r.fulfill({ contentType: "image/webp", body: bytes }),
    );
    project.media.screenshots.unshift(url);
  }
  await page.reload();
  const home = page.locator('.port-editorial [data-artwork="wide"]');
  await expect(home).toHaveCount(1);
  await expect
    .poll(() =>
      home
        .locator(".port-project-image > img")
        .evaluate((i: HTMLImageElement) => i.naturalWidth),
    )
    .toBe(1600);
  await page.getByRole("button", { name: "Каталог", exact: true }).click();
  const card = page.locator('[data-artwork="wide"]');
  await expect(card).toHaveCount(1);
  await expect
    .poll(() =>
      card
        .locator(".port-project-image > img")
        .evaluate((i: HTMLImageElement) => i.naturalWidth),
    )
    .toBe(1600);
  await card.locator(".hub-project-card").click();
  await expect
    .poll(() =>
      page
        .locator(".project-hero .universal-frame")
        .evaluate((i: HTMLImageElement) => i.naturalWidth),
    )
    .toBe(1600);
  project.media.screenshots = project.media.screenshots.slice(1, 3);
  await page.reload();
  await page.getByRole("button", { name: "Каталог", exact: true }).click();
  await expect(page.locator('[data-artwork="portrait"]')).toHaveCount(1);
  expect(
    (await page.locator(".hub-project-card").boundingBox())!.height,
  ).toBeGreaterThan(320);
  await page.locator(".hub-project-card").click();
  await expect(page.locator(".project-hero[data-artwork='wide']")).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "Открыть скриншот 1", exact: true }),
  ).toBeVisible();
});

for (const count of [10, 30])
  for (const [width, height] of [
    [800, 600],
    [1280, 720],
    [1600, 900],
  ]) {
    test(`Stage 18C: ${count} QA records at ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      const { project, build } = await project14Fixture(page, true);
      const items = Array.from({ length: count }, (_, i) => ({
        ...project,
        id: `stage18c-qa-${i}`,
        name: `QA ${i} — ${"Long project title ".repeat(4)}`,
        media: { cover: project.media.cover, screenshots: [] },
      }));
      await page.route(`${origin}/v2/projects**`, (r) => {
        const path = new URL(r.request().url()).pathname;
        if (path === "/v2/projects")
          return r.fulfill({
            json: { schemaVersion: 2, items, total: count, nextCursor: null },
          });
        const id = path.split("/")[3];
        const p = items.find((p) => p.id === id);
        const builds = [{ ...build, id: `${id}-build`, projectId: id }];
        return r.fulfill({
          json: path.endsWith("/builds")
            ? { schemaVersion: 2, projectId: id, channel: "all", builds }
            : {
                schemaVersion: 2,
                project: p,
                games: [{ id: "stage14b-game", title: "QA original game" }],
                builds,
              },
        });
      });
      await page.reload();
      await page.getByRole("button", { name: "Каталог", exact: true }).click();
      await expect(page.locator(".hub-project-card")).toHaveCount(
        Math.min(24, count),
      );
      await expect(
        page.locator('[aria-label="Обновить каталог"]'),
      ).toBeEnabled();
      expect(
        await page
          .locator("main")
          .evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
      const first = (await page
        .locator(".hub-project-card")
        .first()
        .boundingBox())!;
      expect(first.width).toBeLessThanOrEqual(880);
      expect(first.y).toBeLessThan(height - 60);
      if (count > 24) {
        await page.getByRole("button", { name: "Далее", exact: true }).click();
        await expect(page.locator(".hub-project-card")).toHaveCount(6);
      }
      await page.screenshot({
        path: `.local/evidence/stage18d/qa-${count}-${width}.png`,
      });
    });
  }
