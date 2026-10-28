import { expect, test } from "@playwright/test";

for (const [width, height] of [
  [1440, 900],
  [1024, 768],
  [800, 700],
  [480, 850],
]) {
  test(`Home layout, real hero asset and keyboard navigation ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/?hubDemo=240");
    await expect(
      page.getByRole("heading", { name: "Консольные миры на твоём ПК" }),
    ).toBeVisible();
    await expect(page.locator(".port-project")).toHaveCount(1);
    expect(
      await page
        .locator(".port-hero-art")
        .evaluate(
          (img: HTMLImageElement) => img.complete && img.naturalWidth > 1000,
        ),
    ).toBe(true);
    expect(
      await page
        .locator("main")
        .evaluate((e) => e.scrollWidth <= e.clientWidth),
    ).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const platforms = page.getByRole("navigation", {
      name: "Быстрый выбор платформы",
    });
    await platforms
      .getByRole("button", { name: "PlayStation 4", exact: true })
      .click();
    await expect(
      platforms.getByRole("button", { name: "PlayStation 4", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await platforms
      .getByRole("button", { name: "Все платформы", exact: true })
      .click();
    const card = page.getByRole("button", {
      name: "Открыть проект Bloodborne",
      exact: true,
    });
    await card.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".detail-banner h1")).toHaveText("Bloodborne");
    await page.getByRole("button", { name: "Главная", exact: true }).click();
    await page
      .getByRole("button", { name: "Исследовать каталог", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Каталог.", exact: true }),
    ).toBeVisible();
  });
}

test("Home search shortcut and legacy library remain reachable", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("textbox", { name: "Поиск игр" })).toBeFocused();
  await page.getByRole("textbox", { name: "Поиск игр" }).fill("not-a-project");
  await expect(
    page.getByRole("heading", { name: "Ничего не найдено" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Библиотека", exact: true }).click();
  await expect(page.getByText("0 установленных игр")).toBeVisible();
  expect(errors).toEqual([]);
});
import endpoint from "../src/catalog-endpoint.json" with { type: "json" };
import fixture from "../fixtures/catalog/published-v1.json" with { type: "json" };

test("Home keeps hero and retry through empty catalog and network failure", async ({
  page,
}) => {
  let fail = false;
  await page.route(endpoint, (route) =>
    fail
      ? route.abort("internetdisconnected")
      : route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ...fixture, games: [] }),
        }),
  );
  await page.goto("http://127.0.0.1:1421");
  await expect(
    page.getByText("Опубликованные проекты появятся здесь."),
  ).toBeVisible();
  await expect(page.locator(".port-project")).toHaveCount(0);
  fail = true;
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Повторить", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".port-hero-art")).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "Повторить", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Повторить", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Опубликованные проекты появятся здесь."),
  ).toBeVisible();
});

test("Home shelves use build and compatibility fields and follow platform selection", async ({
  page,
}) => {
  const games = [
    {
      ...fixture.games[0],
      id: "available-project",
      title: "Доступный проект",
      sourceConsole: "PlayStation 4",
      windowsBuild: "available",
      compatibility: {
        status: "playable",
        notes: "Synthetic compatibility metadata",
      },
    },
    {
      ...fixture.games[0],
      id: "experimental-project",
      title: "Экспериментальный проект с длинным названием",
      sourceConsole: "Xbox 360",
      windowsBuild: "unavailable",
      compatibility: {
        status: "experimental",
        notes: "Synthetic compatibility metadata",
      },
      media: { gallery: [] },
    },
  ];
  await page.route(endpoint, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...fixture, games }),
    }),
  );
  await page.setViewportSize({ width: 480, height: 850 });
  await page.goto("http://127.0.0.1:1421");
  const builds = page.getByRole("region", {
    name: "Сборки для Windows",
    exact: true,
  });
  const experimental = page.getByRole("region", {
    name: "Экспериментальные проекты",
    exact: true,
  });
  await expect(builds.getByRole("button")).toHaveCount(1);
  await expect(
    builds.getByText("Доступный проект", { exact: true }),
  ).toBeVisible();
  await expect(experimental.getByRole("button")).toHaveCount(1);
  await expect(page.locator(".port-project")).toHaveCount(2);
  await page.getByRole("button", { name: "Xbox 360", exact: true }).click();
  await expect(page.locator(".port-project")).toHaveCount(1);
  await expect(builds.getByRole("button")).toHaveCount(0);
  await expect(builds).toHaveCount(0);
  await expect(page.locator(".port-image-missing")).toBeVisible();
  expect(
    await page.locator("main").evaluate((e) => e.scrollWidth === e.clientWidth),
  ).toBe(true);
  const project = experimental.getByRole("button");
  await page.keyboard.press("Tab");
  await project.focus();
  await expect(project).toBeFocused();
  expect(await project.evaluate((e) => getComputedStyle(e).outlineStyle)).toBe(
    "solid",
  );
  await page.keyboard.press("Enter");
  await expect(page.locator(".detail-banner h1")).toHaveText(games[1].title);
});

test("Home collections never repeat projects and hide redundant sections", async ({
  page,
}) => {
  let games = [
    {
      ...fixture.games[0],
      id: "available-experiment",
      title: "Очень длинное название экспериментального проекта без сокращений",
      windowsBuild: "available",
      compatibility: { status: "experimental", notes: "Synthetic metadata" },
      media: { gallery: [] },
    },
    {
      ...fixture.games[0],
      id: "unavailable-build",
      title: "Проект без сборки",
      windowsBuild: "unavailable",
      compatibility: { status: "playable", notes: "Synthetic metadata" },
    },
  ];
  await page.route(endpoint, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...fixture, games }),
    }),
  );
  await page.goto("http://127.0.0.1:1421");
  const builds = page.getByRole("region", {
    name: "Сборки для Windows",
    exact: true,
  });
  const experimental = page.getByRole("region", {
    name: "Экспериментальные проекты",
    exact: true,
  });
  await expect(builds.getByRole("button")).toHaveCount(1);
  await expect(experimental).toHaveCount(0);
  await expect(builds.getByText("Windows", { exact: true })).toBeVisible();
  await expect(
    builds.getByText("Экспериментальный", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".port-compact-project")).toHaveCount(1);
  for (const width of [1440, 1024, 800, 480]) {
    await page.setViewportSize({ width, height: 850 });
    await builds.scrollIntoViewIfNeeded();
    expect(
      await page
        .locator("main")
        .evaluate((e) => e.scrollWidth === e.clientWidth),
    ).toBe(true);
    expect(
      await page
        .locator(".port-compact-project")
        .evaluate((e) => e.scrollWidth <= e.clientWidth),
    ).toBe(true);
    await expect(
      builds.getByRole("img", { name: "Обложка недоступна" }),
    ).toBeVisible();
  }
  games = [games[1]];
  await page.reload();
  await expect(page.locator(".port-project")).toHaveCount(1);
  await expect(page.locator(".port-discovery")).toHaveCount(0);
});
