import { test, expect } from "@playwright/test";

test("multi-source recipe checks compatibility and consent before installing; DLC, cancel and narrow layout", async ({
  page,
}) => {
  await page.addInitScript(() => {
    let picks = 0,
      checks = 0;
    let status = {
      phase: "idle",
      active: false,
      completed: 0,
      total: 0,
      message: "",
    };
    Object.assign(window, {
      isTauri: true,
      recipeInstalls: [],
      recipeFixture: {
        id: "synthetic",
        collectionId: "synthetic",
        title: "Synthetic multi-source QA",
        supported: true,
        sourceKind: "folder",
        titleId: null,
        requiredFiles: ["data.bin"],
        runtimeSize: 1024,
        dependencies: [],
        setup: true,
        sources: [
          {
            role: "titleUpdate",
            required: true,
            repeatable: false,
            target: "tu",
            operation: "upstream-setup",
            source: {
              kind: "xbox360-content",
              titleId: "1234ABCD",
              requiredFiles: [],
            },
          },
          {
            role: "dlc",
            required: false,
            repeatable: true,
            target: "dlc",
            operation: "copy-tree",
            source: { kind: "folder", requiredFiles: ["dlc.bin"] },
          },
        ],
      },
      __TAURI_INTERNALS__: {
        invoke: async (command: string, args: any = {}) => {
          if (command === "install_status") return { ...status };
          if (command === "plugin:dialog|open")
            return [
              "C:\\Inputs\\base",
              "C:\\Inputs\\tu00000000",
              "C:\\Inputs\\dlc-a",
              "C:\\Inputs\\dlc-b",
            ][picks++];
          if (command === "inspect_recipe_sources") {
            if (++checks === 1) throw "Несовместимый Media ID";
            return "Предварительные проверки пройдены; содержимое проверит штатный мастер.";
          }
          if (command === "install_recipe") {
            (window as any).recipeInstalls.push(args);
            status = {
              phase: "setup",
              active: true,
              completed: 0,
              total: 0,
              message:
                "Выберите подготовленные источники в штатном мастере и закройте игру",
            };
          }
          if (command === "cancel_install")
            status = {
              ...status,
              phase: "cancelled",
              active: false,
              message:
                "Отменено. Файлы мастера сохранены в .port-preserved-fixture",
            };
          return null;
        },
      },
    });
  });
  await page.goto("/tests/fixtures/recipe-install.html");
  const install = page.getByRole("button", { name: "Установить", exact: true });
  const check = page.getByRole("button", {
    name: "Проверить источники",
    exact: true,
  });
  await expect(install).toBeDisabled();
  await page.getByRole("button", { name: "Указать файлы игры" }).click();
  await page.getByRole("button", { name: "Выбрать titleUpdate" }).click();
  await page.getByRole("button", { name: "Выбрать dlc" }).click();
  await page.getByRole("button", { name: "Выбрать dlc" }).click();
  await expect(check).toBeDisabled();
  await page.getByRole("checkbox").check();
  await check.click();
  await expect(page.getByRole("alert")).toHaveText("Несовместимый Media ID");
  await expect(install).toBeDisabled();
  await check.click();
  await expect(install).toBeEnabled();
  await page.getByRole("checkbox").uncheck();
  await expect(install).toBeDisabled();
  await page.getByRole("checkbox").check();
  await check.click();
  await install.click();
  await expect
    .poll(() => page.evaluate(() => (window as any).recipeInstalls.length))
    .toBe(1);
  const request = await page.evaluate(() => (window as any).recipeInstalls[0]);
  expect(request.setupConsent).toBe(true);
  expect(request.sources.titleUpdate).toEqual(["C:\\Inputs\\tu00000000"]);
  expect(request.sources.dlc).toHaveLength(2);
  await page.getByRole("button", { name: "Отменить", exact: true }).click();
  await expect(page.getByText(/Файлы мастера сохранены/)).toBeVisible();
  await page.setViewportSize({ width: 480, height: 900 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: ".local/evidence/stage102-recipe-browser.png",
    fullPage: true,
  });
});
