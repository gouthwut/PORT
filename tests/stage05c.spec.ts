import { test, expect } from "@playwright/test";
import endpoint from "../src/catalog-endpoint.json" with { type: "json" };
import fixture from "../fixtures/catalog/published-v1.json" with { type: "json" };

test.use({ baseURL: "http://127.0.0.1:1421" });

test("release defaults to anonymous catalog; publications, reconnect, timer and offline cache need no configuration", async ({
  page,
}) => {
  let current = structuredClone(fixture);
  let requests = 0;
  let offline = false;
  await page.route(endpoint, async (route) => {
    requests++;
    expect(route.request().headers()["authorization"]).toBeUndefined();
    expect(route.request().headers()["cookie"]).toBeUndefined();
    if (offline) return route.abort("internetdisconnected");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(current),
    });
  });
  await page.clock.install();
  await page.goto("/");
  await page.getByRole("button", { name: "Каталог", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Подробнее: Bloodborne" }),
  ).toBeVisible();
  expect(requests).toBeGreaterThan(0);
  await expect(page.getByText("Локальные тестовые данные")).toHaveCount(0);
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await expect(page.getByLabel("HTTPS API каталога")).toHaveCount(0);
  await expect(
    page.getByText("Для разработчиков · онлайн-каталог"),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Каталог", exact: true }).click();
  current.revision = "qa-next-publication";
  current.games.push({
    ...structuredClone(fixture.games[0]),
    id: "qa-future",
    collectionId: "qa-future",
    title: "QA future card",
    adapterId: "unreviewed",
  });
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(
    page.getByRole("button", { name: "Подробнее: QA future card" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Подробнее: QA future card" }).click();
  await expect(page.getByText(/Установка недоступна: поддержка/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Установить", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Каталог", exact: true }).click();
  current.games = [];
  current.revision = "qa-unpublished";
  await page.clock.fastForward(5 * 60 * 1000);
  await expect(
    page.getByRole("button", { name: "Подробнее: QA future card" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Подробнее: Bloodborne" }),
  ).toHaveCount(0);
  current = structuredClone(fixture);
  await page.getByRole("button", { name: "Обновить каталог" }).click();
  await expect(
    page.getByRole("button", { name: "Подробнее: Bloodborne" }),
  ).toBeVisible();
  offline = true;
  await page.reload();
  await page.getByRole("button", { name: "Каталог", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Подробнее: Bloodborne" }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(
    "Не удалось обновить каталог",
  );
  await expect(page.getByText("Подробности ошибки")).toHaveCount(0);
  expect(
    await page.evaluate(() => localStorage.getItem("port.catalog.endpoint.v1")),
  ).toBeNull();
});
