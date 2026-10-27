import { test, expect } from "@playwright/test";
import fixture from "../fixtures/catalog/skate3-v1.json" with { type: "json" };
import endpoint from "../src/catalog-endpoint.json" with { type: "json" };
import type { PublishedGame } from "../src/services/catalog";
import { supportsInstall } from "../src/services/adapters";

test("compiled Skate identity cannot be borrowed by foreign metadata", () => {
  const g = fixture.games[0] as PublishedGame;
  expect(supportsInstall(g)).toBe(true);
  for (const change of [
    { id: "foreign" },
    { collectionId: "foreign" },
    { adapterId: "foreign" },
    { implementation: "native-port" },
    { sourceConsole: "PlayStation 3" },
    { windowsBuild: "unavailable" },
    { compatibility: { status: "unavailable", notes: "" } },
  ]) {
    expect(supportsInstall({ ...g, ...change } as PublishedGame)).toBe(false);
  }
});

test("local publication activates ISO form and shared destination/shortcut flow", async ({
  page,
}) => {
  await page.addInitScript(
    ({ fixture, endpoint }) => {
      const w = window as any;
      w.isTauri = true;
      w.qaCalls = [];
      w.qaStatus = {
        phase: "idle",
        active: false,
        total: 0,
        completed: 0,
        message: "",
      };
      w.__TAURI_INTERNALS__ = {
        invoke: async (command: string, args: any = {}) => {
          w.qaCalls.push({ command, args });
          if (command === "load_catalog" || command === "sync_catalog")
            return {
              endpoint,
              catalog: fixture,
              images: {},
              known: [],
              source: "cache",
              warning: "",
              syncedAt: "2026-10-27T00:00:00Z",
            };
          if (command === "load_settings")
            return {
              theme: "dark",
              installDir: "D:\\Games",
              reducedMotion: true,
              compactCards: false,
            };
          if (command === "load_media")
            return { hero: "", banner: "", cover: "", gallery: [] };
          if (
            command === "list_installations" ||
            command === "running_installations"
          )
            return [];
          if (command === "take_launch_request") return null;
          if (command === "install_status") return w.qaStatus;
          if (command === "install_skate3") {
            w.qaStatus = {
              phase: "setup",
              active: true,
              total: 0,
              completed: 0,
              message:
                "Завершите официальный мастер Title Update 3, затем закройте игру.",
            };
            return null;
          }
          if (command === "plugin:dialog|open") return "D:\\Own\\Skate_3.iso";
          if (command === "inspect_skate3_iso")
            return {
              bytes: 6_396_955_444,
              files: 101,
              titleId: "454108E6",
              version: "retail",
              warning: "QA fixture",
            };
          if (command === "check_install_destination")
            return {
              id: "123-45",
              root: "D:\\Games\\PORT-Skate3-123-45",
              required: 7_000_000_000,
              available: 100_000_000_000,
            };
          return null;
        },
      };
    },
    { fixture, endpoint },
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Подробнее: Skate 3" }).click();
  await page.getByRole("button", { name: "Установить", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Установка Skate 3");
  await expect(dialog.getByText(/основной PKG/)).toHaveCount(0);
  await dialog.getByRole("button", { name: "Выбрать Xbox 360 ISO" }).click();
  await expect(dialog).toContainText("454108E6");
  await expect(dialog).toContainText("PORT-Skate3-123-45");
  await dialog.getByRole("checkbox").check();
  await dialog
    .getByRole("button", { name: "Установить из ISO", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText(
    "Завершите официальный мастер Title Update 3",
  );
  await expect(
    dialog.getByRole("button", { name: "Установить из ISO", exact: true }),
  ).toBeDisabled();
  const calls = await page.evaluate(() => (window as any).qaCalls);
  expect(
    calls.find((c: any) => c.command === "check_install_destination").args
      .adapterId,
  ).toBe("skate3");
  expect(
    calls.find((c: any) => c.command === "install_skate3").args,
  ).toMatchObject({
    source: "D:\\Own\\Skate_3.iso",
    parent: "D:\\Games",
    destinationId: "123-45",
    desktopShortcut: true,
  });
  expect(
    calls.some((c: any) =>
      ["install_packages", "import_game_folder"].includes(c.command),
    ),
  ).toBe(false);
});

test("release has no Skate card until an owner publication arrives", async ({
  page,
}) => {
  await page.route(endpoint, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...fixture, games: [] }),
    }),
  );
  await page.goto("http://127.0.0.1:1421");
  await page.getByRole("button", { name: "Каталог", exact: true }).click();
  await expect(
    page.getByText("Опубликованных игр пока нет.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Подробнее: Skate 3" }),
  ).toHaveCount(0);
  await page.route(endpoint, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(fixture),
    }),
  );
  await page.getByRole("button", { name: "Обновить каталог" }).click();
  await page.getByRole("button", { name: "Подробнее: Skate 3" }).click();
  await page.getByRole("button", { name: "Установить", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Установка Skate 3");
  await expect(
    page.getByRole("button", { name: "Выбрать Xbox 360 ISO" }),
  ).toBeDisabled();
});
