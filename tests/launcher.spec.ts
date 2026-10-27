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
  await page.screenshot({ path: ".local/evidence/02-cont-home.png" });
  await page.getByRole("button", { name: "Установить", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Только чтение заголовка",
  );
  await expect(page.locator("main > div")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: ".local/evidence/02-cont-07-installer.png" });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "Каталог", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Каталог." })).toBeVisible();
  await expect(page.locator("main > div")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: ".local/evidence/02-cont-02-catalog.png" });
  await page.getByRole("button", { name: /Подробнее: Bloodborne/ }).click();
  await expect(
    page.getByRole("heading", { name: "Системные требования" }),
  ).toBeVisible();
  await expect(page.locator("main > div")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: ".local/evidence/02-cont-03-bloodborne.png" });
  await page.getByRole("button", { name: "Библиотека", exact: true }).click();
  await expect(page.getByText("Здесь начнётся ваша история")).toBeVisible();
  await expect(page.locator("main > div")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: ".local/evidence/02-cont-04-library.png" });
  await page.getByRole("button", { name: /^Загрузки/ }).click();
  await expect(
    page.getByRole("button", { name: "Скачать компоненты" }),
  ).toBeDisabled();
  await expect(
    page.getByText("WEB PREVIEW · реальные загрузки", { exact: false }),
  ).toBeVisible();
  await expect(page.locator("main > div")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: ".local/evidence/02-cont-05-downloads.png" });
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Настройки." })).toBeVisible();
  await expect(page.locator("main > div")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: ".local/evidence/02-cont-06-settings.png" });
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
  await expect(
    page.getByRole("button", { name: "Подробнее: Bloodborne" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Без адаптера", exact: true }).click();
  await expect(page.getByText("Ничего не найдено")).toBeVisible();
  await page.getByRole("button", { name: "Все", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Подробнее: Bloodborne" }),
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
  await page.screenshot({ path: ".local/evidence/02-cont-10-offline.png" });
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
    await page.screenshot({
      path: `.local/evidence/02-cont-08-home-${width}.png`,
    });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await page.emulateMedia({ colorScheme: "light" });
  await page.getByRole("combobox").selectOption("system");
  await expect(page.locator(".app-shell")).toHaveCSS(
    "background-color",
    "rgb(245, 242, 250)",
  );
  await expect(page.locator("main > div")).toHaveCSS("opacity", "1");
  await page.screenshot({
    path: ".local/evidence/02-cont-09-settings-system-light.png",
  });
  expect(errors).toEqual([]);
});

test("local media import, persistence, gallery keyboard and offline lightbox", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Подробнее: Bloodborne" }).click();
  await expect(
    page.getByRole("heading", { name: "Системные требования" }),
  ).toBeVisible();
  await page.getByText("Заменить оформление на своё", { exact: true }).click();
  const png = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 640;
    c.height = 360;
    const x = c.getContext("2d")!;
    x.fillStyle = "#252432";
    x.fillRect(0, 0, 640, 360);
    x.fillStyle = "#c4b5fd";
    x.font = "24px sans-serif";
    x.fillText("PORT QA FIXTURE - NOT GAME ART", 50, 180);
    return c.toDataURL("image/png").split(",")[1];
  });
  const file = {
    name: "qa-only.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  };
  for (const name of ["Главный hero", "Обложка 2:3", "Баннер страницы"]) {
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name, exact: true }).click();
    await (await chooser).setFiles(file);
    await expect(
      page.getByRole("button", { name: `${name} ✓`, exact: true }),
    ).toBeEnabled();
  }
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Скриншоты (0/10)" }).click();
  await (
    await chooser
  ).setFiles(
    Array.from({ length: 6 }, (_, i) => ({ ...file, name: `qa-${i}.png` })),
  );
  await expect(
    page.getByRole("button", { name: "Скриншоты (6/10)" }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Открыть скриншот 1", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("1 / 6");
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("dialog")).toContainText("6 / 6");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("dialog")).toContainText("1 / 6");
  await page.screenshot({
    path: ".local/evidence/02-cont-gallery-qa-fixture.png",
  });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Открыть скриншот 1", exact: true }),
  ).toBeFocused();
  await page.reload();
  await page.getByRole("button", { name: "Подробнее: Bloodborne" }).click();
  await page.getByText("Заменить оформление на своё", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Скриншоты (6/10)" }),
  ).toBeVisible();
  await context.setOffline(true);
  await page
    .getByRole("button", { name: "Открыть скриншот 3", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("3 / 6");
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 800, height: 600 });
  expect(
    await page.locator("main").evaluate((e) => e.scrollWidth <= e.clientWidth),
  ).toBeTruthy();
});
