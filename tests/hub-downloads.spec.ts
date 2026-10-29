import { test, expect, type Page } from "@playwright/test";

const origin = "https://port-catalog-cms.port-catalog-cms.workers.dev";
const project = {
  id: "port-a",
  name: "Download project",
  gameIds: ["game"],
  kind: "recompilation",
  lifecycle: "active",
  sourcePlatforms: ["Xbox 360"],
  targetPlatforms: ["windows"],
};
const build = {
  id: "build-a",
  projectId: "port-a",
  version: "1.0",
  os: "windows",
  arch: "x64",
  channel: "stable",
  availability: "available",
  url: "https://github.com/owner/project/releases/download/v1/build.zip",
};
async function setup(page: Page, builds: unknown[] = [build], native = true) {
  if (native)
    await page.addInitScript(() => {
      const w = window as unknown as {
        isTauri: boolean;
        __TAURI_INTERNALS__: unknown;
        qaStatus: Record<string, unknown>;
        qaCalls: { command: string; args: unknown }[];
      };
      w.isTauri = true;
      w.qaStatus = {
        phase: "",
        name: "",
        completed: 0,
        total: null,
        speed: 0,
        message: "",
      };
      w.qaCalls = [];
      w.__TAURI_INTERNALS__ = {
        async invoke(command: string, args: unknown) {
          w.qaCalls.push({ command, args });
          if (command === "load_settings")
            return {
              theme: "dark",
              installDir: "",
              compactCards: false,
              reducedMotion: true,
            };
          if (command === "hub_download_status") return { ...w.qaStatus };
          if (command === "start_hub_download")
            w.qaStatus = {
              phase: "downloading",
              name: "build.zip",
              completed: 524288,
              total: 1048576,
              speed: 262144,
              message: "Скачивание официального файла…",
            };
          if (command === "cancel_hub_download")
            w.qaStatus = {
              ...w.qaStatus,
              phase: "cancelled",
              message: "Загрузка отменена",
            };
          return null;
        },
      };
    });
  await page.route(`${origin}/v2/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    const json =
      path === "/v2/projects"
        ? { schemaVersion: 2, items: [project], total: 1, nextCursor: null }
        : path === "/v2/games"
          ? {
              schemaVersion: 2,
              items: [{ id: "game", title: "Original game" }],
              nextCursor: null,
            }
          : {
              schemaVersion: 2,
              project,
              games: [{ id: "game", title: "Original game" }],
              builds,
            };
    return route.fulfill({ json });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Каталог", exact: true }).click();
  await page.locator(".hub-project-card").first().click();
  await expect(
    page.getByRole("heading", { name: "Сборки", exact: true }),
  ).toBeVisible();
}

test("single native-shaped download: progress survives navigation, cancellation and folder action", async ({
  page,
}) => {
  await setup(page);
  await page.getByRole("button", { name: "Скачать файл", exact: true }).click();
  const panel = page.getByRole("complementary", { name: "Загрузка файла" });
  await expect(panel.getByRole("progressbar")).toHaveAttribute(
    "value",
    "524288",
  );
  await expect(panel).toContainText("50%");
  await expect(panel).toContainText("0.3 МиБ/с");
  await expect(
    page.getByRole("button", { name: "Скачать файл", exact: true }),
  ).toBeDisabled();
  const calls = await page.evaluate(() =>
    (
      window as unknown as { qaCalls: { command: string; args: unknown }[] }
    ).qaCalls.filter((c) => c.command === "start_hub_download"),
  );
  expect(calls).toEqual([
    {
      command: "start_hub_download",
      args: { projectId: "port-a", buildId: "build-a" },
    },
  ]);
  await page.getByRole("button", { name: "Назад в каталог" }).click();
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "Отменить загрузку" }).click();
  await expect(panel).toContainText("Загрузка отменена");
  await expect(
    panel.getByRole("button", { name: "Открыть папку" }),
  ).toHaveCount(0);
  await page.evaluate(() => {
    (window as unknown as { qaStatus: unknown }).qaStatus = {
      phase: "completed",
      name: "build.zip",
      completed: 1048576,
      total: 1048576,
      speed: 0,
      message: "Файл сохранён",
    };
  });
  await panel.getByRole("button", { name: "Открыть папку" }).click();
  expect(
    await page.evaluate(() =>
      (window as unknown as { qaCalls: { command: string }[] }).qaCalls.some(
        (c) => c.command === "open_hub_download_folder",
      ),
    ),
  ).toBe(true);
  await page.evaluate(() => {
    (window as unknown as { qaStatus: unknown }).qaStatus = {
      phase: "error",
      name: "build.zip",
      completed: 3,
      total: 100,
      speed: 0,
      message: "Соединение прервано. Повторите скачивание.",
    };
  });
  await expect(panel).toContainText("Соединение прервано");
  await expect(
    panel.getByRole("button", { name: "Открыть папку" }),
  ).toHaveCount(0);
});

test("missing files, source archives, unavailable and proposed builds cannot download", async ({
  page,
}) => {
  await setup(page, [
    { ...build, id: "missing", url: null },
    {
      ...build,
      id: "sources",
      url: "https://github.com/owner/project/archive/refs/tags/v1.zip",
    },
    { ...build, id: "unknown", availability: "unknown" },
    { ...build, id: "linux", os: "linux" },
    { ...build, id: "proposed", review: "proposed" },
  ]);
  const buttons = page.getByRole("button", {
    name: "Скачать файл",
    exact: true,
  });
  await expect(buttons).toHaveCount(4);
  for (const button of await buttons.all()) await expect(button).toBeDisabled();
  await expect(
    page.getByText("Прямой URL файла не указан", { exact: true }),
  ).toBeVisible();
});

test("browser preview never starts a native download", async ({ page }) => {
  await setup(page, [build], false);
  await expect(
    page.getByRole("button", { name: "Скачать файл", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText("Скачивание доступно в приложении PORT для Windows"),
  ).toBeVisible();
});
