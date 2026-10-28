import { expect, test } from "@playwright/test";
import fixture from "../fixtures/catalog/published-v1.json" with { type: "json" };
import endpoint from "../src/catalog-endpoint.json" with { type: "json" };
import { fromV1, fromV2 } from "../src/hub/catalog-model";

test("project adapters expose only supplied public description and official links", () => {
  const project = fromV1(fixture.games[0] as any);
  expect(project.description).toBe(fixture.games[0].description);
  expect(project.officialLinks).toEqual([
    { label: "Проект на GitHub", url: fixture.games[0].project.github },
  ]);
  expect(project.name).toBeNull();
  const summary = fromV2(
    {
      id: "future",
      name: "Future project",
      gameIds: [],
      sourcePlatforms: [],
      kind: "source-port",
      lifecycle: "unknown",
    },
    [],
  );
  expect(summary.description).toBeNull();
  expect(summary.officialLinks).toEqual([]);
  expect(summary.platforms).toEqual([]);
  expect(summary.windows).toBe("unknown");
  expect(summary.legacy).toBeNull();
});

test("catalog project shows v1 facts and returns with query, filters, sort and page intact", async ({
  page,
}) => {
  const games = Array.from({ length: 26 }, (_, n) => ({
    ...fixture.games[0],
    id: `qa-${n}`,
    collectionId: `qa-${n}`,
    adapterId: "future-adapter",
    title: `QA Project ${String(n).padStart(2, "0")}`,
    description: "Published description. <script>unsafe()</script>",
    media: { gallery: [] },
  }));
  await page.addInitScript(
    (url) => localStorage.setItem("port.catalog.endpoint.v1", url),
    endpoint,
  );
  await page.route(endpoint, (r) => r.fulfill({ json: { ...fixture, games } }));
  await page.goto("/");
  await page.getByRole("button", { name: "Каталог", exact: true }).click();
  await page.getByLabel("Поиск по игре или проекту").fill("QA Project");
  await page
    .getByRole("combobox", { name: "Исходная платформа", exact: true })
    .selectOption("PlayStation 4");
  await page
    .getByRole("combobox", { name: "Технология", exact: true })
    .selectOption("compatibility-runtime");
  await page
    .getByRole("combobox", { name: "Стадия разработки", exact: true })
    .selectOption("unknown");
  await page.getByRole("button", { name: "Доступны", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Сортировка", exact: true })
    .selectOption("name-desc");
  await page.getByRole("button", { name: "Далее", exact: true }).click();
  const cards = page.locator(".hub-project-card");
  await expect(cards).toHaveCount(2);
  await cards.first().focus();
  await page.keyboard.press("Enter");
  const overview = page.getByRole("region", { name: "О проекте", exact: true });
  await expect(overview.getByRole("heading", { level: 1 })).toHaveText(
    "QA Project 01",
  );
  await expect(overview).toContainText("Описание");
  await expect(overview).toContainText(games[0].description);
  await expect(overview.locator("script")).toHaveCount(0);
  await expect(overview.locator("dd")).toHaveText([
    "Не указано",
    "PlayStation 4",
    "Слой совместимости",
    "Доступна по данным каталога",
  ]);
  await expect(overview).toContainText("Обложка недоступна");
  const link = overview.getByRole("link", { name: "Проект на GitHub" });
  await expect(link).toHaveAttribute("href", games[0].project.github);
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  await expect(page.getByText(/Установка недоступна:/)).toBeVisible();
  await page.getByRole("button", { name: "Назад в каталог" }).click();
  await expect(page.getByLabel("Поиск по игре или проекту")).toHaveValue(
    "QA Project",
  );
  for (const [name, value] of [
    ["Исходная платформа", "PlayStation 4"],
    ["Технология", "compatibility-runtime"],
    ["Стадия разработки", "unknown"],
    ["Сортировка", "name-desc"],
  ])
    await expect(page.getByRole("combobox", { name, exact: true })).toHaveValue(
      value,
    );
  await expect(
    page.getByRole("button", { name: "Доступны", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toHaveAccessibleName("Подробнее: QA Project 01");
});
