import { expect, test } from "@playwright/test";
import fixture from "../fixtures/catalog/published-v1.json" with { type: "json" };
import endpoint from "../src/catalog-endpoint.json" with { type: "json" };
import {
  defaultCatalogQuery,
  fromV1,
  fromV2,
  selectProjects,
} from "../src/hub/catalog-model";

test("catalog model keeps project identities, missing fields and build evidence separate", () => {
  const legacy = fromV1(fixture.games[0] as any);
  expect(legacy.kind).toBe("compatibility-runtime");
  expect(legacy.name).toBeNull();
  expect(legacy.lifecycle).toBe("unknown");
  expect(legacy.buildEvidence).toBe("editorial-v1");
  const game = { id: "original", title: "Original Game" };
  const a = fromV2(
    {
      id: "port-a",
      name: "Port A",
      gameIds: [game.id],
      sourcePlatforms: ["N64"],
      kind: "decompilation",
      lifecycle: "active",
    },
    [game],
  );
  const b = fromV2(
    {
      id: "port-b",
      name: "Port B",
      gameIds: [game.id],
      sourcePlatforms: ["N64"],
      kind: "recompilation",
      lifecycle: "beta",
    },
    [game],
  );
  expect(
    selectProjects([a, b], { ...defaultCatalogQuery, search: "Original" })
      .total,
  ).toBe(2);
  expect(
    selectProjects([a, b], { ...defaultCatalogQuery, search: "port b" }).items,
  ).toEqual([b]);
  expect(
    selectProjects([a, b], { ...defaultCatalogQuery, windows: "available" })
      .total,
  ).toBe(0);
  expect(
    selectProjects([a, b], {
      ...defaultCatalogQuery,
      kind: "decompilation",
      lifecycle: "active",
    }).items,
  ).toEqual([a]);
  const large = Array.from({ length: 1000 }, (_, n) => ({
    ...a,
    id: `port-${n}`,
  }));
  const last = selectProjects(large, { ...defaultCatalogQuery, page: 999 });
  expect(last.pages).toBe(42);
  expect(last.page).toBe(42);
  expect(last.items).toHaveLength(16);
  expect(
    selectProjects(large, { ...defaultCatalogQuery, page: 2 }).items,
  ).toHaveLength(24);
});

test("catalog paginates, filters, sorts and preserves selection across project navigation", async ({
  page,
}) => {
  const games = Array.from({ length: 63 }, (_, n) => ({
    ...fixture.games[0],
    id: `qa-${n}`,
    title: `QA Project ${String(n).padStart(2, "0")}`,
    sourceConsole: n % 2 ? "Xbox 360" : "PlayStation 4",
    windowsBuild: n % 2 ? "unavailable" : "available",
    media: { gallery: [] },
  }));
  await page.route(endpoint, (r) => r.fulfill({ json: { ...fixture, games } }));
  await page.goto("http://127.0.0.1:1421");
  await page.getByRole("button", { name: "Каталог", exact: true }).click();
  const cards = page.locator(".hub-project-card");
  await expect(cards).toHaveCount(24);
  await page.getByRole("button", { name: "Далее", exact: true }).click();
  await expect(cards.first()).toHaveAccessibleName("Подробнее: QA Project 24");
  await expect(page.getByRole("heading", { name: "Проекты 63" })).toBeFocused();
  await page
    .getByRole("combobox", { name: "Исходная платформа", exact: true })
    .selectOption("Xbox 360");
  await expect(cards).toHaveCount(24);
  await page
    .getByRole("combobox", { name: "Сортировка", exact: true })
    .selectOption("name-desc");
  await expect(cards.first()).toHaveAccessibleName("Подробнее: QA Project 61");
  await page.getByLabel("Поиск по игре или проекту").fill("Project 01");
  await expect(cards).toHaveCount(1);
  await page.keyboard.press("Tab");
  await cards.first().focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".detail-banner h1")).toHaveText("QA Project 01");
  await page.getByRole("button", { name: "Каталог", exact: true }).click();
  await expect(page.getByLabel("Поиск по игре или проекту")).toHaveValue(
    "Project 01",
  );
  await expect(
    page.getByRole("combobox", { name: "Исходная платформа", exact: true }),
  ).toHaveValue("Xbox 360");
  await page.getByRole("button", { name: "Доступны", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Ничего не найдено" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Сбросить фильтры" }).click();
  await page
    .getByRole("combobox", { name: "Стадия разработки", exact: true })
    .selectOption("active");
  await expect(cards).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "Стадия разработки", exact: true })
    .selectOption("unknown");
  await expect(cards).toHaveCount(24);
  await page
    .getByRole("combobox", { name: "Технология", exact: true })
    .selectOption("recompilation");
  await expect(cards).toHaveCount(0);
  await page.getByRole("button", { name: "Сбросить фильтры" }).click();
  await expect(cards).toHaveCount(24);
});

for (const width of [1440, 1024, 800, 480]) {
  test(`catalog responsive layout and long title without art ${width}`, async ({
    page,
  }) => {
    await page.route(endpoint, (r) =>
      r.fulfill({
        json: {
          ...fixture,
          games: [
            {
              ...fixture.games[0],
              id: "qa-long-title",
              title:
                "Очень длинное название независимого проекта и оригинальной игры",
              media: { gallery: [] },
            },
          ],
        },
      }),
    );
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("http://127.0.0.1:1421");
    await page.getByRole("button", { name: "Каталог", exact: true }).click();
    await expect(page.locator(".hub-project-card")).toHaveCount(1);
    await expect(page.locator(".hub-project-card")).toContainText(
      "Обложка недоступна",
    );
    await page.keyboard.press("Tab");
    await page.locator(".hub-project-card").focus();
    await expect(page.locator(".hub-project-card")).toHaveCSS(
      "transform",
      "none",
    );
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
    await page.screenshot({
      path: `design/reviews/stage-11.1-catalog/browser-fallback-${width}.png`,
      fullPage: true,
    });
  });
}

test("catalog loading, error, retry and empty state", async ({ page }) => {
  let fail = true;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(endpoint, async (r) => {
    await gate;
    return fail ? r.abort() : r.fulfill({ json: { ...fixture, games: [] } });
  });
  await page.goto("http://127.0.0.1:1421");
  await page.getByRole("button", { name: "Каталог", exact: true }).click();
  await expect(
    page.getByLabel("Загрузка каталога", { exact: true }),
  ).toBeVisible();
  release();
  await expect(page.getByRole("alert")).toContainText(
    "Не удалось загрузить каталог",
  );
  await page.screenshot({
    path: "design/reviews/stage-11.1-catalog/browser-error.png",
  });
  fail = false;
  await page.getByRole("button", { name: "Повторить", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Каталог пока пуст" }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});
