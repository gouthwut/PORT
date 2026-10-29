import { createHash } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { project14Fixture } from "./helpers/project14-fixture";

const origin = "https://port-catalog-cms.port-catalog-cms.workers.dev";
async function fixture(page: Page, count = 2) {
  const { project, build } = await project14Fixture(page, true);
  const items = Array.from({ length: count }, (_, i) => ({
    ...project,
    id: `stage18e-qa-${i}`,
    name: `QA project ${i + 1}`,
    media: {
      ...project.media,
      screenshots: [...project.media.screenshots],
    } as typeof project.media & { hero?: string; banner?: string },
  }));
  await page.route(`${origin}/v2/projects**`, (r) => {
    const path = new URL(r.request().url()).pathname;
    if (path === "/v2/projects")
      return r.fulfill({
        json: {
          schemaVersion: 2,
          items,
          total: items.length,
          nextCursor: null,
        },
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
  return items;
}
async function image(page: Page, width: number, height: number) {
  const base64 = await page.evaluate(
    ({ width, height }) => {
      const c = document.createElement("canvas");
      c.width = width;
      c.height = height;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#594577";
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "white";
      ctx.font = "22px sans-serif";
      ctx.fillText("QA ONLY", 20, 40);
      return c.toDataURL("image/webp").split(",")[1];
    },
    { width, height },
  );
  const bytes = Buffer.from(base64, "base64");
  const url = `${origin}/media/${createHash("sha256").update(bytes).digest("hex")}.webp`;
  await page.route(url, (r) =>
    r.fulfill({ contentType: "image/webp", body: bytes }),
  );
  return url;
}

for (const [width, height] of [
  [800, 600],
  [1280, 720],
  [1600, 900],
]) {
  test(`Stage 18E: universal banner and four equal cards at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    const items = await fixture(page, 4);
    const cover = await image(page, 400, 600);
    const gallery = await image(page, 1600, 900);
    const banner = await image(page, 1500, 500);
    items[0].media = { cover, screenshots: [gallery], hero: gallery, banner };
    items[1].media = { cover, screenshots: [gallery] };
    items[2].media = { cover, screenshots: [] };
    items[3].media = { cover: "", screenshots: [] };
    await page.reload();
    const kinds = ["wide", "wide", "portrait", "brand"];
    for (const [i, kind] of kinds.entries())
      await expect(
        page.locator(".featured-slide .universal-hero").nth(i),
      ).toHaveAttribute("data-artwork", kind);
    const hero = page.locator(".featured-slide .universal-hero").first();
    await expect(hero.locator(".universal-banner")).toHaveJSProperty(
      "naturalWidth",
      1500,
    );
    await expect(hero.locator(".universal-banner")).toHaveCSS(
      "object-fit",
      "cover",
    );
    async function cards(screen: string) {
      const cards = page.locator(".hub-project-card");
      await expect(cards).toHaveCount(4);
      for (const [i, kind] of kinds.entries())
        await expect(
          page.locator(".project-card-wrapper").nth(i),
        ).toHaveAttribute("data-artwork", kind);
      await expect(
        cards.first().locator(".port-project-image > img"),
      ).toHaveJSProperty("naturalWidth", 1500);
      const sizes = await cards.evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          return { width: r.width, height: r.height };
        }),
      );
      for (const size of sizes) {
        expect(Math.abs(size.height - sizes[0].height)).toBeLessThan(1);
        expect(Math.abs(size.width - sizes[0].width)).toBeLessThan(1);
        expect(size.height).toBeGreaterThan(320);
      }
      await expect(cards.nth(2).locator(".port-project-image > img")).toHaveCSS(
        "object-fit",
        "contain",
      );
      expect(
        await page
          .locator("main")
          .evaluate((el) => el.scrollWidth > el.clientWidth),
      ).toBe(false);
      await page.screenshot({
        path: `.local/evidence/stage18e/fixture-${screen}-${width}.png`,
        fullPage: true,
      });
    }
    await cards("home");
    await page.getByRole("button", { name: "Каталог", exact: true }).click();
    await cards("catalog");
    for (const [i, kind] of kinds.entries()) {
      await page.locator(".hub-project-card").nth(i).click();
      await expect(page.locator(".project-hero")).toHaveAttribute(
        "data-artwork",
        kind,
      );
      if (i === 0) {
        await expect(
          page.locator(".project-hero .universal-banner"),
        ).toHaveJSProperty("naturalWidth", 1500);
        await expect(page.locator(".project-hero .universal-banner")).toHaveCSS(
          "object-position",
          "50% 50%",
        );
      }
      await page.screenshot({
        path: `.local/evidence/stage18e/fixture-project-${i}-${width}.png`,
        fullPage: true,
      });
      await page.getByRole("button", { name: "Каталог", exact: true }).click();
    }
    // Bad optional fields cannot suppress working gallery fallback or issue foreign requests.
    const foreign: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("untrusted.example")) foreign.push(r.url());
    });
    for (const bad of [
      "https://untrusted.example/banner.webp",
      "javascript:alert(1)",
      { url: banner },
      null,
    ]) {
      Object.assign(items[0].media, { banner: bad });
      await page.reload();
      await expect(
        page.locator(".featured-slide .universal-frame").first(),
      ).toHaveJSProperty("naturalWidth", 1600);
    }
    expect(foreign).toEqual([]);
  });
}
