import { test, expect } from "@playwright/test";
test("navigation, honest installer and all primary screen screenshots", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "За пределами консоли." }),
  ).toBeVisible();
  await expect(page.locator("main > div")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: "screenshots/01-home-1440.png" });
  await page.getByRole("button", { name: "Установить", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Функция ещё не реализована",
  );
  await expect(page.locator("main > div")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: "screenshots/07-installer-plan.png" });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "Каталог", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Каталог." })).toBeVisible();
  await expect(page.locator("main > div")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: "screenshots/02-catalog.png" });
  await page
    .getByRole("button", { name: /The Nathan Drake Collection Uncharted/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Системные требования" }),
  ).toBeVisible();
  await expect(page.locator("main > div")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: "screenshots/03-uncharted.png" });
  await page.getByRole("button", { name: "Библиотека", exact: true }).click();
  await expect(page.getByText("Здесь начнётся ваша история")).toBeVisible();
  await expect(page.locator("main > div")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: "screenshots/04-library.png" });
  await page.getByRole("button", { name: /^Загрузки/ }).click();
  await expect(page.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "0",
  );
  await expect(
    page.getByRole("button", { name: "Приостановить загрузку" }),
  ).toBeDisabled();
  await expect(page.locator("main > div")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: "screenshots/05-downloads.png" });
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Настройки." })).toBeVisible();
  await expect(page.locator("main > div")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: "screenshots/06-settings.png" });
  expect(errors).toEqual([]);
});
test("search, filters, settings persistence and reset", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("textbox", { name: "Поиск игр" }).fill("does-not-exist");
  await expect(
    page.getByRole("heading", { name: "Ничего не найдено" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Сбросить фильтры" }).click();
  await page.getByRole("button", { name: "Готовы к установке" }).click();
  await expect(page.getByText("Ничего не найдено")).toBeVisible();
  await page
    .getByRole("button", { name: "Запланировано", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "The Nathan Drake Collection",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  const reduced = page.getByRole("switch", { name: "Меньше анимаций" });
  await reduced.click();
  await expect(reduced).toBeChecked();
  await page.getByRole("switch", { name: "Компактные карточки" }).click();
  await expect(
    page.getByRole("switch", { name: "Компактные карточки" }),
  ).toBeChecked();
  await page
    .getByRole("combobox", { name: "Тема приложения" })
    .selectOption("system");
  await expect(page.locator(".app-shell")).toHaveClass(/system-theme/);
  await page.reload();
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await expect(reduced).toBeChecked();
  await expect(page.getByRole("combobox")).toHaveValue("system");
  await page.getByRole("button", { name: "Сбросить", exact: true }).click();
  await page.getByRole("button", { name: "Отмена", exact: true }).click();
  await expect(reduced).toBeChecked();
  await page.getByRole("button", { name: "Сбросить", exact: true }).click();
  await page
    .getByRole("button", { name: "Сбросить настройки", exact: true })
    .click();
  await expect(reduced).not.toBeChecked();
  await expect(page.getByRole("combobox")).toHaveValue("dark");
});
test("offline, keyboard, light theme and responsive layouts", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "За пределами консоли." }),
  ).toBeVisible();
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("textbox", { name: "Поиск игр" })).toBeFocused();
  await context.setOffline(true);
  await expect(
    page.getByText("Нет сети. Каталог и локальные настройки доступны."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Библиотека", exact: true }).click();
  await expect(page.getByText("Здесь начнётся ваша история")).toBeVisible();
  await expect(page.locator("main > div")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: "screenshots/10-offline.png" });
  await context.setOffline(false);
  await page.getByRole("button", { name: "Главная", exact: true }).click();
  for (const [width, height] of [
    [1024, 768],
    [800, 600],
    [480, 850],
  ]) {
    await page.setViewportSize({ width, height });
    await expect(
      page.getByRole("heading", { name: "За пределами консоли." }),
    ).toBeVisible();
    expect(
      await page
        .locator("main")
        .evaluate((e) => e.scrollWidth <= e.clientWidth),
    ).toBeTruthy();
    await expect(page.locator("main > div")).toHaveCSS("opacity", "1");
    await page.screenshot({ path: `screenshots/08-home-${width}.png` });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await page.emulateMedia({ colorScheme: "light" });
  await page.getByRole("combobox").selectOption("system");
  await expect(page.locator(".app-shell")).toHaveCSS(
    "background-color",
    "rgb(245, 244, 248)",
  );
  await expect(page.locator("main > div")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: "screenshots/09-settings-system-light.png" });
  expect(errors).toEqual([]);
});
