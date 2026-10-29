import { expect, test } from "@playwright/test";

test("browser controls are explicit; shell and dialog fit below the title bar", async ({
  page,
}) => {
  await page.goto("/");
  const bar = page.getByRole("banner", { name: "Окно PORT" });
  await expect(bar).toHaveCSS("height", "40px");
  for (const button of await bar.getByRole("button").all())
    await expect(button).toBeDisabled();
  for (const viewport of [
    { width: 1440, height: 960 },
    { width: 800, height: 600 },
  ]) {
    await page.setViewportSize(viewport);
    await page.getByRole("button", { name: "Настройки", exact: true }).click();
    const bounds = await page.locator(".app-shell").boundingBox();
    expect(bounds?.y).toBe(40);
    expect(bounds!.y + bounds!.height).toBe(viewport.height);
    const sidebar = await page.locator(".port-sidebar").boundingBox();
    expect(sidebar!.y + sidebar!.height).toBe(viewport.height);
    await page.getByRole("button", { name: "О PORT" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box!.y).toBeGreaterThan(40);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
    await page.keyboard.press("Escape");
  }
});

test("official window commands, restored state, keyboard and failure feedback", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const w = window as unknown as {
      isTauri: boolean;
      __TAURI_INTERNALS__: unknown;
      qaMaximized: boolean;
      qaFail: boolean;
      qaCalls: string[];
    };
    w.isTauri = true;
    w.qaMaximized = false;
    w.qaFail = false;
    w.qaCalls = [];
    w.__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: "main" } },
      async invoke(command: string) {
        w.qaCalls.push(command);
        if (command === "load_settings")
          return {
            theme: "dark",
            installDir: "",
            compactCards: false,
            reducedMotion: true,
          };
        if (command === "plugin:window|is_maximized") return w.qaMaximized;
        if (command === "hub_download_status")
          return {
            phase: "downloading",
            name: "fixture.zip",
            completed: 512,
            total: 1024,
            speed: 256,
            message: "Загрузка",
          };
        if (command === "plugin:window|toggle_maximize")
          w.qaMaximized = !w.qaMaximized;
        if (command === "plugin:window|minimize" && w.qaFail)
          throw Error("denied");
        return null;
      },
    };
  });
  await page.goto("/");
  const bar = page.getByRole("banner", { name: "Окно PORT" });
  const panel = page.getByRole("complementary", { name: "Загрузка файла" });
  await expect(panel).toBeVisible();
  for (const viewport of [
    { width: 1440, height: 960 },
    { width: 800, height: 600 },
  ]) {
    await page.setViewportSize(viewport);
    const panelBox = await panel.boundingBox();
    expect(panelBox!.y).toBeGreaterThanOrEqual(40);
    expect(panelBox!.y + panelBox!.height).toBeLessThanOrEqual(viewport.height);
    expect(panelBox!.x).toBeGreaterThanOrEqual(0);
    expect(panelBox!.x + panelBox!.width).toBeLessThanOrEqual(viewport.width);
    await page.getByRole("button", { name: "О PORT", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // DOM hit testing only; this does not certify native nonclient hit testing.
    expect(
      await page.evaluate(() =>
        document
          .elementFromPoint(100, 20)
          ?.classList.contains("dialog-overlay"),
      ),
    ).toBe(true);
    const dialogBox = await dialog.boundingBox();
    expect(dialogBox!.y).toBeGreaterThan(40);
    expect(dialogBox!.y + dialogBox!.height).toBeLessThanOrEqual(
      viewport.height,
    );
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(panel).toBeVisible();
  }
  await bar.getByRole("button", { name: "Свернуть окно" }).focus();
  await page.keyboard.press("Enter");
  await bar.getByRole("button", { name: "Развернуть окно" }).click();
  await expect(
    bar.getByRole("button", { name: "Восстановить окно" }),
  ).toBeVisible();
  await bar.getByRole("button", { name: "Восстановить окно" }).click();
  await expect(
    bar.getByRole("button", { name: "Развернуть окно" }),
  ).toBeVisible();
  await page.evaluate(() => {
    const w = window as unknown as { qaMaximized: boolean };
    w.qaMaximized = true;
    window.dispatchEvent(new Event("resize"));
  });
  await expect(
    bar.getByRole("button", { name: "Восстановить окно" }),
  ).toBeVisible();
  await bar.getByRole("button", { name: "Закрыть окно" }).click();
  expect(
    await page.evaluate(
      () => (window as unknown as { qaCalls: string[] }).qaCalls,
    ),
  ).toEqual(
    expect.arrayContaining([
      "plugin:window|minimize",
      "plugin:window|toggle_maximize",
      "plugin:window|close",
    ]),
  );
  await expect(bar.locator("button[data-tauri-drag-region]")).toHaveCount(0);
  await expect(bar.locator(".port-titlebar-drag")).toHaveAttribute(
    "data-tauri-drag-region",
    "true",
  );
  await page.evaluate(() => {
    (window as unknown as { qaFail: boolean }).qaFail = true;
  });
  await bar.getByRole("button", { name: "Свернуть окно" }).click();
  await expect(page.locator(".toast")).toContainText(
    "Не удалось выполнить действие с окном",
  );
});

for (const scale of [1.25, 1.5]) {
  test.describe(`rendering at ${scale * 100}% device scale (not Windows DPI)`, () => {
    test.use({ deviceScaleFactor: scale });

    test("title bar, navigation and dialog retain their logical bounds", async ({
      page,
    }) => {
      await page.goto("/");
      expect(await page.evaluate(() => devicePixelRatio)).toBe(scale);
      for (const viewport of [
        { width: 1024, height: 688 },
        { width: 800, height: 600 },
      ]) {
        await page.setViewportSize(viewport);
        const bar = page.getByRole("banner", { name: "Окно PORT" });
        await expect(bar).toHaveCSS("height", "40px");
        await expect
          .poll(async () => {
            const bounds = await page.locator(".app-shell").boundingBox();
            return bounds!.y + bounds!.height;
          })
          .toBe(viewport.height);
        const shell = await page.locator(".app-shell").boundingBox();
        expect(shell!.y).toBe(40);
        expect(shell!.y + shell!.height).toBe(viewport.height);
        const controls = await bar.getByRole("button").all();
        for (const control of controls) {
          const box = await control.boundingBox();
          expect(box!.y).toBeGreaterThanOrEqual(0);
          expect(box!.y + box!.height).toBeLessThanOrEqual(40);
          expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
        }
        await page
          .getByRole("button", { name: "Каталог", exact: true })
          .click();
        await expect(page.locator(".hub-catalog")).toBeVisible();
        await page.getByRole("button", { name: "О PORT", exact: true }).click();
        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible();
        const box = await dialog.boundingBox();
        expect(box!.y).toBeGreaterThan(40);
        expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
        await page.keyboard.press("Escape");
        await page
          .getByRole("button", { name: "Главная", exact: true })
          .click();
      }
    });
  });
}
