import { createHash } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { project14Fixture } from "./helpers/project14-fixture";

const origin = "https://port-catalog-cms.port-catalog-cms.workers.dev";
async function fixture(page: Page, count = 2) {
  const { project, build } = await project14Fixture(page, true);
  const items = Array.from({ length: count }, (_, i) => ({
    ...project,
    id: `stage18d-qa-${i}`,
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
const active = (page: Page) => page.locator(".featured-slide.is-active");
for (const count of [0, 1, 2, 12]) {
  test(`Stage 18D: ${count} published QA projects; bounded CMS order`, async ({
    page,
  }) => {
    await fixture(page, count);
    if (!count) {
      await expect(page.locator(".port-hero")).toBeVisible();
      await expect(page.locator(".hero-catalog-state")).toHaveText(
        "Опубликованные проекты появятся здесь.",
      );
      await expect(page.locator(".featured-carousel")).toHaveCount(0);
    } else {
      await expect(page.locator(".featured-slide")).toHaveCount(
        Math.min(count, 6),
      );
      await expect(active(page)).toHaveAttribute(
        "data-project-id",
        "stage18d-qa-0",
      );
      await expect(
        page.getByRole("button", { name: "Следующий проект", exact: true }),
      ).toHaveCount(count > 1 ? 1 : 0);
      await expect(
        active(page).getByRole("button", {
          name: "Открыть проект",
          exact: true,
        }),
      ).toBeEnabled();
      if (count > 1) {
        await page
          .getByRole("button", { name: "Следующий проект", exact: true })
          .click();
        await expect(active(page)).toHaveAttribute(
          "data-project-id",
          "stage18d-qa-1",
        );
      }
      await active(page)
        .getByRole("button", { name: "Открыть проект", exact: true })
        .click();
      await expect(page.locator(".project-hero h1")).toHaveText(
        `QA project ${count > 1 ? 2 : 1}`,
      );
    }
  });
}
test("Stage 18D: quality ranking, cover only, no art and future optional banner validation", async ({
  page,
}) => {
  const items = await fixture(page, 4);
  const cover = await image(page, 400, 600);
  const low = await image(page, 320, 240);
  const wide = await image(page, 1600, 900);
  const smaller = await image(page, 960, 540);
  const foreign: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("untrusted.example")) foreign.push(r.url());
  });
  items[0].media = { cover, screenshots: [low] };
  items[1].media = { cover, screenshots: [] };
  items[2].media = {
    cover: "",
    screenshots: [],
    hero: "https://untrusted.example/hero.webp",
  };
  items[3].media = { cover, screenshots: [smaller, wide] };
  await page.reload();
  for (const [i, kind] of ["portrait", "portrait", "brand", "wide"].entries())
    await expect(
      page.locator(".featured-slide").nth(i).locator(".universal-hero"),
    ).toHaveAttribute("data-artwork", kind);
  await expect(
    page.locator(".featured-slide").nth(3).locator(".universal-frame"),
  ).toHaveJSProperty("naturalWidth", 1600);
  await expect(
    page.locator(".featured-slide").nth(0).locator(".universal-cover"),
  ).toHaveJSProperty("naturalWidth", 400);
  items[3].media.banner = smaller;
  await page.reload();
  await expect(
    page.locator(".featured-slide").nth(3).locator(".universal-frame"),
  ).toHaveJSProperty("naturalWidth", 960);
  await page.getByRole("button", { name: "Каталог", exact: true }).click();
  await expect(
    page.locator('.project-card-wrapper[data-artwork="portrait"]'),
  ).toHaveCount(2);
  await expect(
    page.locator('.project-card-wrapper[data-artwork="brand"]'),
  ).toHaveCount(1);
  await page.locator(".hub-project-card").first().click();
  await expect(
    page.locator('.project-hero[data-artwork="portrait"]'),
  ).toBeVisible();
  await expect(page.locator(".project-hero .universal-cover")).toHaveJSProperty(
    "naturalWidth",
    400,
  );
  expect(
    await page
      .locator(".project-hero .universal-cover")
      .evaluate((el) => getComputedStyle(el).objectFit),
  ).toBe("contain");
  expect(foreign).toEqual([]);
  await page.screenshot({
    path: ".local/evidence/stage18d/qa-cover-composition.png",
  });
});
test("Stage 18D: autoplay, hover/focus, interaction pause, blur, hidden state and cleanup", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.clock.install();
  await fixture(page, 2);
  await expect(page.locator(".featured-carousel")).toHaveAttribute(
    "data-playing",
    "true",
  );
  await page.clock.fastForward(7000);
  await expect(active(page)).toHaveAttribute(
    "data-project-id",
    "stage18d-qa-1",
  );
  await page.locator(".featured-carousel").hover();
  await page.clock.fastForward(14000);
  await expect(active(page)).toHaveAttribute(
    "data-project-id",
    "stage18d-qa-1",
  );
  await page.mouse.move(1, 1);
  await page
    .getByRole("button", { name: "Следующий проект", exact: true })
    .focus();
  await page.clock.fastForward(14000);
  await expect(active(page)).toHaveAttribute(
    "data-project-id",
    "stage18d-qa-1",
  );
  await page.evaluate(() => (document.activeElement as HTMLElement).blur());
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(page.locator(".featured-carousel")).toHaveAttribute(
    "data-playing",
    "false",
  );
  await page.clock.fastForward(14000);
  await expect(active(page)).toHaveAttribute(
    "data-project-id",
    "stage18d-qa-1",
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.fastForward(14000);
  await expect(active(page)).toHaveAttribute(
    "data-project-id",
    "stage18d-qa-1",
  );
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page
    .getByRole("button", { name: "Предыдущий проект", exact: true })
    .click();
  await page.mouse.move(1, 1);
  await page.evaluate(() => (document.activeElement as HTMLElement).blur());
  await page.clock.fastForward(14000);
  await expect(active(page)).toHaveAttribute(
    "data-project-id",
    "stage18d-qa-0",
  );
  await page
    .getByRole("button", { name: "Включить автосмену", exact: true })
    .click();
  await page.mouse.move(1, 1);
  await page.evaluate(() => (document.activeElement as HTMLElement).blur());
  await page.clock.fastForward(7000);
  await expect(active(page)).toHaveAttribute(
    "data-project-id",
    "stage18d-qa-1",
  );
  await page.getByRole("button", { name: "Каталог", exact: true }).click();
  await page.clock.fastForward(70000);
  await page.getByRole("button", { name: "Главная", exact: true }).click();
  await expect(active(page)).toHaveAttribute(
    "data-project-id",
    "stage18d-qa-0",
  );
});
test("Stage 18D: next slide decoded before switching; reduced motion is static", async ({
  page,
}) => {
  await fixture(page, 2);
  await expect(
    page.locator(".featured-slide").nth(1).locator(".universal-frame"),
  ).toHaveJSProperty("complete", true);
  await expect(
    page.locator(".featured-slide").nth(1).locator(".universal-frame"),
  ).toHaveJSProperty("naturalWidth", 1280);
  await expect(page.locator(".featured-carousel")).toHaveAttribute(
    "data-playing",
    "false",
  );
  await expect(page.locator(".featured-slide").first()).toHaveCSS(
    "transition-duration",
    "0s",
  );
  await page.clock.install();
  await page.clock.fastForward(21000);
  await expect(active(page)).toHaveAttribute(
    "data-project-id",
    "stage18d-qa-0",
  );
  await page
    .getByRole("button", { name: "Следующий проект", exact: true })
    .click();
  await expect(active(page)).toHaveAttribute(
    "data-project-id",
    "stage18d-qa-1",
  );
  await expect(
    page.locator('.featured-slide[aria-hidden="true"]'),
  ).toHaveAttribute("inert", "");
});
for (const [width, height] of [
  [800, 600],
  [1280, 720],
  [1600, 900],
]) {
  test(`Stage 18D: stable hero and responsive content at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    const items = await fixture(page, 2);
    items[1].name = "QA very long project title ".repeat(4);
    await page.reload();
    const before = (await page.locator(".featured-carousel").boundingBox())!;
    await page
      .getByRole("button", { name: "Следующий проект", exact: true })
      .click();
    const after = (await page.locator(".featured-carousel").boundingBox())!;
    expect(after.height).toBe(before.height);
    const cta = (await active(page)
      .getByRole("button", { name: "Открыть проект", exact: true })
      .boundingBox())!;
    const controls = (await page.locator(".featured-controls").boundingBox())!;
    expect(cta.y + cta.height).toBeLessThanOrEqual(controls.y);
    expect(
      await page
        .locator("main")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await active(page)
      .getByRole("button", { name: "Открыть проект", exact: true })
      .click();
    expect(
      await page
        .locator("main")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await page.screenshot({
      path: `.local/evidence/stage18d/qa-long-title-${width}.png`,
    });
  });
}
test("Stage 18D: unavailable catalog keeps branded fallback and clear error", async ({
  page,
}) => {
  await page.route(`${origin}/**`, (r) =>
    r.fulfill({ status: 503, body: "unavailable" }),
  );
  await page.goto("/");
  await expect(page.locator(".port-hero")).toBeVisible();
  await expect(page.locator(".hero-catalog-state")).toHaveText(
    "Каталог не удалось загрузить.",
  );
});

test("Stage 18D: publication without an approved build only offers project navigation", async ({
  page,
}) => {
  const items = await fixture(page, 1);
  await page.route(`${origin}/v2/projects/stage18d-qa-0**`, (r) => {
    const path = new URL(r.request().url()).pathname;
    return r.fulfill({
      json: path.endsWith("/builds")
        ? {
            schemaVersion: 2,
            projectId: items[0].id,
            channel: "all",
            builds: [],
          }
        : {
            schemaVersion: 2,
            project: items[0],
            games: [{ id: "stage14b-game", title: "QA original game" }],
            builds: [],
          },
    });
  });
  await page.reload();
  await expect(
    active(page).getByRole("button", { name: "Открыть проект", exact: true }),
  ).toBeEnabled();
  await expect(active(page).locator(".featured-build")).toHaveCount(0);
  await active(page)
    .getByRole("button", { name: "Открыть проект", exact: true })
    .click();
  await expect(page.locator(".project-unavailable")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Скачать для Windows", exact: true }),
  ).toHaveCount(0);
});
