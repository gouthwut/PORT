import { test, expect, type Page } from "@playwright/test";

async function fixture(page: Page, installed = false) {
  await page.addInitScript(
    ({ installed }) => {
      const item = {
        id: "123-45",
        collectionId: "bloodborne",
        version: "01.09",
        root: "D:\\Games\\PORT-Bloodborne-123-45",
        dataPath: "D:\\Games\\PORT-Bloodborne-123-45\\CUSA03173",
        runtimePath: "D:\\Games\\PORT-Bloodborne-123-45\\bbport-windows",
        manifestSha256: "fixture",
      };
      let items = installed ? [item] : [];
      let status = {
        phase: "",
        active: false,
        completed: 0,
        total: 0,
        message: "",
      };
      Object.assign(window, {
        isTauri: true,
        qaCalls: [] as unknown[],
        qaFolder: null,
        qaShortcutWarning: false,
        qaLaunch: null,
        __TAURI_INTERNALS__: {
          invoke: async (command: string, args: Record<string, any> = {}) => {
            (window as any).qaCalls.push({ command, args });
            if (command === "load_settings")
              return {
                theme: "dark",
                installDir: "D:\\Games",
                compactCards: false,
                reducedMotion: true,
              };
            if (command === "load_media")
              return { hero: "", cover: "", banner: "", gallery: [] };
            if (command === "load_catalog" || command === "sync_catalog")
              throw Error("fixture offline");
            if (command === "take_launch_request") {
              const id = (window as any).qaLaunch;
              (window as any).qaLaunch = null;
              return id;
            }
            if (command === "list_installations") return items;
            if (command === "running_installations") return [];
            if (command === "install_status") return status;
            if (command === "pkg_install_available") return true;
            if (command === "download_status")
              return {
                phase: "ready",
                active: false,
                total: 1,
                completed: 1,
                message: "Fixture cache",
              };
            if (command === "plugin:dialog|open")
              return args.options.directory
                ? (window as any).qaFolder
                : ["D:\\source\\base.pkg"];
            if (command === "inspect_packages")
              return {
                metadataCompatible: true,
                installable: true,
                issues: [],
                summary: "Основной PKG выбран",
                items: [
                  {
                    fileName: "base.pkg",
                    inspection: {
                      role: "base",
                      size: 30_000_000_000,
                      version: "01.00",
                    },
                    error: null,
                  },
                ],
              };
            if (command === "check_install_destination") {
              if (args.parent.includes("Windows"))
                throw Error("Выберите папку вне системных каталогов");
              if (args.parent.includes("full"))
                throw Error("Недостаточно места: выберите другой диск");
              return {
                id: "123-45",
                root: args.parent + "\\PORT-Bloodborne-123-45",
                required: 34_000_000_000,
                available: 100_000_000_000,
              };
            }
            if (command === "install_packages") {
              items = [
                { ...item, root: args.parent + "\\PORT-Bloodborne-123-45" },
              ];
              status = {
                phase: "ready",
                active: false,
                completed: 1,
                total: 1,
                message: (window as any).qaShortcutWarning
                  ? "Игра установлена, но ярлык создать не удалось. Запускайте её из библиотеки PORT."
                  : "Игра установлена",
              };
              return;
            }
            if (command === "launch_installation")
              return "QA: launch routed by ID";
            if (command === "open_installation_folder")
              return "QA: Explorer opened by ID";
            if (command === "verify_installation") return "QA: integrity";
            if (command === "remove_installation") {
              if (!args.confirmed) throw Error("Confirmation required");
              items = [];
              return "QA: removed";
            }
            throw Error(command);
          },
        },
      });
    },
    { installed },
  );
}

for (const shortcut of [false, true])
  test(`PKG → destination → opt-in shortcut ${shortcut}; folder cancel and warning (mocked IPC)`, async ({
    page,
  }) => {
    await fixture(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Установить", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByText("Основной PKG выбран", { exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByText("D:\\Games\\PORT-Bloodborne-123-45", { exact: true }),
    ).toBeVisible();
    const checkbox = dialog.getByRole("checkbox", {
      name: "Создать ярлык на рабочем столе",
    });
    await expect(checkbox).not.toBeChecked();
    await dialog
      .getByRole("button", { name: "Выбрать папку назначения" })
      .click();
    await expect(
      dialog.getByLabel("Папка установки", { exact: true }),
    ).toHaveValue("D:\\Games");
    await page.evaluate(() =>
      Object.assign(window, { qaFolder: "E:\\Мои игры" }),
    );
    await dialog
      .getByRole("button", { name: "Выбрать папку назначения" })
      .click();
    await expect(
      dialog.getByText("E:\\Мои игры\\PORT-Bloodborne-123-45", { exact: true }),
    ).toBeVisible();
    if (shortcut) {
      await checkbox.check();
      await page.evaluate(() =>
        Object.assign(window, { qaShortcutWarning: true }),
      );
    }
    await page.screenshot({
      path: `.local/evidence/04d/browser-install-${shortcut}.png`,
    });
    await dialog
      .getByRole("button", { name: "Проверить и установить основной PKG" })
      .click();
    await expect(dialog).toContainText(
      shortcut ? "ярлык создать не удалось" : "Игра установлена",
    );
    const calls = await page.evaluate(() => (window as any).qaCalls);
    expect(
      calls.find((c: any) => c.command === "install_packages").args,
    ).toMatchObject({
      parent: "E:\\Мои игры",
      destinationId: "123-45",
      desktopShortcut: shortcut,
      paths: ["D:\\source\\base.pkg"],
    });
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Библиотека", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Выбрать: Bloodborne" }),
    ).toBeVisible();
  });

test("destination errors block confirmation; responsive styled install (mocked IPC)", async ({
  page,
}) => {
  await fixture(page);
  await page.setViewportSize({ width: 480, height: 850 });
  await page.goto("/");
  await page.getByRole("button", { name: "Установить", exact: true }).click();
  const input = page.getByLabel("Папка установки", { exact: true });
  await input.fill("C:\\Windows");
  await expect(page.getByRole("alert")).toContainText("системных");
  await expect(
    page.getByRole("button", { name: "Проверить и установить основной PKG" }),
  ).toBeDisabled();
  await input.fill("D:\\full");
  await expect(page.getByRole("alert")).toContainText("Недостаточно места");
  await input.fill("D:\\Games");
  await expect(
    page.getByRole("button", { name: "Проверить и установить основной PKG" }),
  ).toBeEnabled();
  const dialog = page.getByRole("dialog");
  expect(
    await dialog.evaluate((e) => e.scrollWidth <= e.clientWidth),
  ).toBeTruthy();
  await page.screenshot({
    path: ".local/evidence/04d/browser-mobile-installer.png",
  });
});

test("library context menu mouse, keyboard, dismissal and shared actions (mocked IPC)", async ({
  page,
}) => {
  await fixture(page, true);
  await page.goto("/");
  await page.getByRole("button", { name: "Библиотека", exact: true }).click();
  const card = page.getByRole("button", { name: "Выбрать: Bloodborne" });
  await card.click();
  await expect(card).toHaveAttribute("aria-pressed", "true");
  await card.click({ button: "right" });
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await card.focus();
  await page.keyboard.press("Shift+F10");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.screenshot({
    path: ".local/evidence/04d/browser-library-context.png",
  });
  await page
    .getByRole("menuitem", { name: "Просмотреть локальные файлы" })
    .click();
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(
    page.getByRole("status").filter({ hasText: "Explorer opened" }),
  ).toBeVisible();
  await card.click({ button: "right" });
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Home");
  await page.keyboard.press("Enter");
  await expect
    .poll(
      async () =>
        await page.evaluate(
          () =>
            (window as any).qaCalls.filter(
              (c: any) => c.command === "launch_installation",
            ).length,
        ),
    )
    .toBe(1);
  await card.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Проверить целостность" }).click();
  await expect(page.getByText("Целостность файлов подтверждена")).toBeVisible();
  await card.click({ button: "right" });
  await page.mouse.click(1300, 85);
  await expect(page.getByRole("menu")).toHaveCount(0);
  await card.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Удалить игру" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Подтвердить удаление" }).click();
  await expect(page.getByText("0 установленных игр")).toBeVisible();
});

test("shortcut request resolves existing ID and rejects absent installation (mocked IPC)", async ({
  page,
}) => {
  await fixture(page, true);
  await page.goto("/");
  await page.evaluate(() => Object.assign(window, { qaLaunch: "123-45" }));
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          (window as any).qaCalls.filter(
            (c: any) => c.command === "launch_installation",
          ).length,
      ),
    )
    .toBe(1);
  await page.evaluate(() => Object.assign(window, { qaLaunch: "999-1" }));
  await expect(
    page.getByText("Игра из ярлыка не найдена в библиотеке PORT"),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (window as any).qaCalls.filter(
          (c: any) => c.command === "launch_installation",
        ).length,
    ),
  ).toBe(1);
});

test("04E card Play reuses the guarded ID action and glass stays outside card grids (mocked IPC)", async ({
  page,
}) => {
  await fixture(page, true);
  await page.setViewportSize({ width: 800, height: 600 });
  await page.goto("/");
  await page.getByRole("button", { name: "Библиотека", exact: true }).click();
  const play = page.getByRole("button", {
    name: "Играть в Bloodborne",
    exact: true,
  });
  await expect(play).toBeEnabled();
  await expect(page.locator(".installed-tile")).toHaveCSS(
    "backdrop-filter",
    "none",
  );
  await expect
    .poll(() =>
      page.locator("main").evaluate((e) => e.scrollWidth <= e.clientWidth),
    )
    .toBeTruthy();
  await page
    .getByRole("button", { name: "Выбрать: Bloodborne", exact: true })
    .focus();
  await page.keyboard.press("Tab");
  await expect(play).toBeFocused();
  await expect(play).toHaveCSS("outline-style", "solid");
  await page.screenshot({
    path: ".local/evidence/04e/browser-library-800-mocked.png",
  });
  await page.keyboard.press("Enter");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).qaCalls.filter(
            (c: any) => c.command === "launch_installation",
          ).length,
      ),
    )
    .toBe(1);
  expect(
    await page.evaluate(() =>
      (window as any).qaCalls.filter((c: any) =>
        /install_packages|import_game_folder|update_installation|remove_installation|save_settings/.test(
          c.command,
        ),
      ),
    ),
  ).toEqual([]);
});
