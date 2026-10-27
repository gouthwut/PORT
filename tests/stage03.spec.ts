import { test, expect } from "@playwright/test";
test("web preview exposes honest folder/PKG states without fake installation", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Установить", exact: true }).click();
  for (const name of [
    "Выбрать папку с файлами игры",
    "Установить из папки",
    "Проверить и установить основной PKG",
    "Подготовить только runtime",
  ])
    await expect(
      page.getByRole("button", { name, exact: true }),
    ).toBeDisabled();
  await page.screenshot({
    path: ".local/evidence/03-browser-installer-preview.png",
  });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Библиотека", exact: true }).click();
  await expect(page.getByText("0 установленных игр")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Играть", exact: true }),
  ).toHaveCount(0);
});
test("native IPC UI contract: folder import and explicit cancellation (mocked backend)", async ({
  page,
}) => {
  await page.addInitScript(() => {
    let state = {
      phase: "",
      active: false,
      completed: 0,
      total: 0,
      message: "",
    };
    Object.assign(window, {
      isTauri: true,
      __TAURI_INTERNALS__: {
        invoke: async (command: string, args: Record<string, unknown>) => {
          if (command === "load_settings")
            return {
              theme: "dark",
              installDir: "",
              compactCards: false,
              reducedMotion: true,
            };
          if (command === "load_media")
            return { hero: "", cover: "", banner: "", gallery: [] };
          if (command === "download_status")
            return {
              phase: "ready",
              active: false,
              completed: 1,
              total: 1,
              message: "QA mocked cache",
            };
          if (command === "pkg_install_available") return true;
          if (command === "install_status") return state;
          if (command === "plugin:dialog|open") {
            const options = (args.options ?? args) as Record<string, unknown>;
            return options.directory
              ? String(options.title).includes("назначения")
                ? "C:\\QA-target"
                : "C:\\QA-source"
              : null;
          }
          if (command === "inspect_game_folder")
            return {
              path: args.path,
              version: null,
              titleId: "CUSA03173",
              files: 28808,
              bytes: 31_000_000_000,
              warning: "QA: версия неизвестна",
            };
          if (command === "import_game_folder") {
            Object.assign(window, { importArgs: args });
            state = {
              phase: "copying",
              active: true,
              completed: 10,
              total: 100,
              message: "QA copying",
            };
            return;
          }
          if (command === "cancel_install") {
            state = {
              ...state,
              phase: "cancelled",
              active: false,
              message: "QA отменено; staging очищен",
            };
            return;
          }
          throw Error(command);
        },
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Установить", exact: true }).click();
  await page
    .getByRole("button", { name: "Выбрать папку с файлами игры", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Версия не определена");
  await page
    .getByRole("button", { name: "Выбрать папку назначения", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Установить из папки", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("QA copying");
  expect(
    await page.evaluate(
      () => (window as unknown as { importArgs: object }).importArgs,
    ),
  ).toMatchObject({ source: "C:\\QA-source", parent: "C:\\QA-target" });
  await page
    .getByRole("button", { name: "Отменить установку", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("QA отменено");
});
test("native IPC UI contract: registered library, launch error, verify and confirmed removal (mocked backend)", async ({
  page,
}) => {
  await page.addInitScript(() => {
    let items = [
      {
        id: "qa",
        collectionId: "bloodborne",
        root: "C:\\QA",
        dataPath: "C:\\QA\\CUSA03173",
        runtimePath: "C:\\QA\\bbport-windows",
        version: "01.09",
        manifestSha256: "QA",
      },
    ];
    Object.assign(window, {
      isTauri: true,
      __TAURI_INTERNALS__: {
        invoke: async (command: string, args: Record<string, unknown>) => {
          if (command === "load_settings")
            return {
              theme: "dark",
              installDir: "",
              compactCards: false,
              reducedMotion: true,
            };
          if (command === "load_media")
            return { hero: "", cover: "", banner: "", gallery: [] };
          if (command === "list_installations") return items;
          if (command === "launch_status") return "";
          if (command === "launch_installation")
            throw Error("QA: Windows отказал в запуске");
          if (command === "verify_installation") return "QA: SHA-256 совпадает";
          if (command === "remove_installation") {
            if (args.confirmed !== true) throw Error("Confirmation missing");
            items = [];
            return "QA: сохранения оставлены";
          }
          throw Error(command);
        },
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Библиотека", exact: true }).click();
  await expect(page.getByText(/APP_VER 01.09/)).toBeVisible();
  await expect(page.getByText(/Игровые данные: C:/)).toBeVisible();
  await page.getByRole("button", { name: "Играть", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Windows отказал");
  await page
    .getByRole("button", { name: "Проверить целостность", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("SHA-256 совпадает");
  await page.screenshot({
    path: ".local/evidence/03-browser-library-mocked-ipc.png",
  });
  await page.getByRole("button", { name: "Удалить", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("сохранения");
  await page
    .getByRole("button", { name: "Оставить игру", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Играть", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Удалить", exact: true }).click();
  await page
    .getByRole("button", { name: "Подтвердить удаление", exact: true })
    .click();
  await expect(page.getByText("0 установленных игр")).toBeVisible();
});
