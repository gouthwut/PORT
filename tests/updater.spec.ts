import { test, expect } from "@playwright/test";

test("browser preview clearly disables the native updater", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  const updates = page.locator(".launcher-updates");
  await expect(
    updates.getByText("Обновления доступны в Windows-приложении"),
  ).toBeVisible();
  await expect(
    updates.getByRole("button", { name: "Проверить обновления" }),
  ).toBeDisabled();
});

test("update states, retry, plain changelog, progress and explicit consent", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const state = {
      phase: "available",
      currentVersion: "0.1.0",
      version: "0.2.0",
      channel: "isolated-test",
      notes: "Исправление\n<script>unsafe()</script>",
      completed: 0,
      total: 100,
      downloaded: false,
      message: "",
    };
    let checks = 0;
    Object.assign(window, {
      isTauri: true,
      updateInstalls: 0,
      __TAURI_INTERNALS__: {
        invoke: async (command: string, args: any = {}) => {
          if (command === "updater_status") return { ...state };
          if (command === "check_app_update") {
            checks++;
            state.phase =
              checks === 1 ? "error" : checks === 2 ? "current" : "available";
            state.message = checks === 1 ? "Нет сети. Повторите попытку." : "";
            state.version = checks > 2 ? "0.2.0" : "";
          }
          if (command === "download_app_update") {
            state.phase = "downloading";
            await new Promise((r) => setTimeout(r, 1400));
            state.completed = 100;
            state.downloaded = true;
            state.phase = "ready";
          }
          if (command === "install_app_update") {
            if (!args.confirmed) throw "Confirmation missing";
            (window as any).updateInstalls++;
            state.phase = "error";
            state.message = "Закройте запущенную игру перед обновлением PORT";
            throw state.message;
          }
          if (command === "load_settings")
            return {
              theme: "dark",
              installDir: "",
              compactCards: false,
              reducedMotion: true,
            };
          if (command === "load_media")
            return { hero: "", cover: "", banner: "", gallery: [] };
          if (command === "load_catalog" || command === "sync_catalog")
            throw "Offline fixture";
          if (
            command === "list_installations" ||
            command === "running_installations"
          )
            return [];
          if (command === "install_status") return { phase: "", active: false };
          return null;
        },
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  const updates = page.locator(".launcher-updates");
  await updates.getByRole("button", { name: "Проверить обновления" }).click();
  await expect(updates.getByRole("alert")).toContainText("Нет сети");
  await updates.getByRole("button", { name: "Проверить обновления" }).click();
  await expect(
    updates.getByText("Установлена актуальная версия"),
  ).toBeVisible();
  await updates.getByRole("button", { name: "Проверить обновления" }).click();
  await expect(
    updates.getByText("<script>unsafe()</script>", { exact: false }),
  ).toBeVisible();
  await updates.getByRole("button", { name: "Загрузить обновление" }).click();
  await expect(updates.getByRole("progressbar")).toBeVisible();
  await expect(
    updates.getByRole("button", { name: "Установить и перезапустить" }),
  ).toBeEnabled();
  await updates
    .getByRole("button", { name: "Установить и перезапустить" })
    .click();
  await page.getByRole("button", { name: "Позже", exact: true }).click();
  expect(await page.evaluate(() => (window as any).updateInstalls)).toBe(0);
  await updates
    .getByRole("button", { name: "Установить и перезапустить" })
    .click();
  await page
    .getByRole("button", { name: "Подтвердить и перезапустить" })
    .click();
  await expect(updates.getByRole("alert")).toContainText(
    "Закройте запущенную игру",
  );
  expect(await page.evaluate(() => (window as any).updateInstalls)).toBe(1);
});
