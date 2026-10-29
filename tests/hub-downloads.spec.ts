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
  await page
    .getByRole("button", { name: "Скачать для Windows", exact: true })
    .click();
  const panel = page.getByRole("complementary", { name: "Загрузка файла" });
  await expect(panel.getByRole("progressbar")).toHaveAttribute(
    "value",
    "524288",
  );
  await expect(panel).toContainText("50%");
  await expect(panel).toContainText("0.3 МиБ/с");
  await expect(
    page.getByRole("button", { name: "Скачать для Windows", exact: true }),
  ).toBeDisabled();
  const calls = await page.evaluate(() =>
    (
      window as unknown as { qaCalls: { command: string; args: unknown }[] }
    ).qaCalls.filter((c) => c.command === "start_hub_download"),
  );
  expect(calls).toEqual([
    {
      command: "start_hub_download",
      args: {
        projectId: "port-a",
        buildId: "build-a",
        projectName: "Download project",
      },
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
      path: "C:\\PORT\\.local\\13f выбранная папка\\build.zip",
    };
  });
  await expect(panel).toContainText("Загрузка завершена");
  await expect(panel.getByLabel("Путь сохранения")).toHaveCount(0);
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
    name: "Скачать для Windows",
    exact: true,
  });
  await expect(buttons).toHaveCount(1);
  for (const button of await buttons.all()) await expect(button).toBeDisabled();
  await expect(
    page.getByText("Файл сборки пока не опубликован", { exact: true }),
  ).toBeVisible();
});

test("browser preview never starts a native download", async ({ page }) => {
  await setup(page, [build], false);
  await expect(
    page.getByRole("button", { name: "Скачать для Windows", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText("Скачивание доступно в приложении PORT для Windows"),
  ).toBeVisible();
});

test("folder selection locks new downloads and cancelling the dialog leaves no error", async ({
  page,
}) => {
  await setup(page);
  const panel = page.getByRole("complementary", { name: "Загрузка файла" });
  await page.evaluate(() => {
    (window as unknown as { qaStatus: unknown }).qaStatus = {
      phase: "selecting",
      name: "",
      completed: 0,
      total: null,
      speed: 0,
      message: "Выберите папку для сохранения файла",
      path: null,
    };
  });
  await expect(panel).toContainText("Выберите папку");
  await expect(
    page.getByRole("button", { name: "Скачать для Windows", exact: true }),
  ).toBeDisabled();
  await expect(
    panel.getByRole("button", { name: "Отменить загрузку" }),
  ).toHaveCount(0);
  await page.evaluate(() => {
    (window as unknown as { qaStatus: unknown }).qaStatus = {
      phase: "",
      name: "",
      completed: 0,
      total: null,
      speed: 0,
      message: "",
      path: null,
    };
  });
  await expect(panel).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Скачать для Windows", exact: true }),
  ).toBeEnabled();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("completion hides after seven unpaused seconds; hover, focus, errors and new transfers", async ({
  page,
}) => {
  await setup(page);
  await page.clock.install();
  await page
    .getByRole("button", { name: "Скачать для Windows", exact: true })
    .click();
  const panel = page.getByRole("complementary", { name: "Загрузка файла" });
  await page.clock.runFor(10000);
  await expect(panel).toBeVisible();
  await expect(panel.getByLabel("Закрыть уведомление")).toHaveCount(0);
  await panel.hover();
  await page.evaluate(() => {
    Object.assign((window as unknown as { qaStatus: object }).qaStatus, {
      phase: "completed",
      path: "\\\\?\\C:\\PORT\\file.zip",
    });
  });
  await page.clock.runFor(500);
  await expect(panel).toContainText("Загрузка завершена");
  await expect(panel).not.toContainText("C:");
  await page.clock.runFor(10000);
  await expect(panel).toBeVisible();
  await page.mouse.move(0, 0);
  await page.clock.runFor(3000);
  await panel.hover();
  await page.clock.runFor(10000);
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "Открыть папку" }).focus();
  await page.mouse.move(0, 0);
  await page.clock.runFor(10000);
  await expect(panel).toBeVisible();
  await page.getByRole("button", { name: "Назад в каталог" }).focus();
  await page.clock.runFor(3500);
  await expect(panel).toBeVisible();
  await page.clock.runFor(1000);
  await expect(panel).toHaveCount(0);
  await page.clock.runFor(2000);
  await expect(panel).toHaveCount(0);
  expect(
    await page.evaluate(
      () => (window as unknown as { qaStatus: { path: string } }).qaStatus.path,
    ),
  ).toContain("C:");
  await page.evaluate(() => {
    Object.assign((window as unknown as { qaStatus: object }).qaStatus, {
      phase: "error",
      message: "Соединение прервано",
    });
  });
  await page.clock.runFor(20000);
  await expect(panel).toContainText("Ошибка загрузки");
  await panel.getByLabel("Закрыть уведомление").click();
  await page.clock.runFor(1000);
  await expect(panel).toHaveCount(0);
  await page.evaluate(() => {
    Object.assign((window as unknown as { qaStatus: object }).qaStatus, {
      phase: "downloading",
      path: null,
    });
  });
  await page.clock.runFor(500);
  await expect(panel.getByRole("progressbar")).toBeVisible();
});

test("source-only projects never offer a binary download", async ({ page }) => {
  await setup(page, [
    {
      ...build,
      url: "https://github.com/owner/project/archive/refs/tags/v1.zip",
    },
  ]);
  await expect(
    page.getByRole("button", { name: "Скачать для Windows" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Одобренные сборки для Windows пока не опубликованы.", {
      exact: false,
    }),
  ).toBeVisible();
});

test("successful notification can be closed manually without changing the saved file status", async ({
  page,
}) => {
  await setup(page);
  await page
    .getByRole("button", { name: "Скачать для Windows", exact: true })
    .click();
  await page.evaluate(() =>
    Object.assign((window as unknown as { qaStatus: object }).qaStatus, {
      phase: "completed",
      path: "C:\\PORT\\saved.zip",
    }),
  );
  const panel = page.getByRole("complementary", { name: "Загрузка файла" });
  await panel.getByLabel("Закрыть уведомление").click();
  await expect(panel).toHaveCount(0);
  await page.getByRole("button", { name: "Главная", exact: true }).click();
  await expect(panel).toHaveCount(0);
  const calls = await page.evaluate(() =>
    (window as unknown as { qaCalls: { command: string }[] }).qaCalls.map(
      (c) => c.command,
    ),
  );
  expect(calls.filter((c) => /cancel|remove|delete/.test(c))).toEqual([]);
  expect(
    await page.evaluate(
      () => (window as unknown as { qaStatus: { path: string } }).qaStatus.path,
    ),
  ).toBe("C:\\PORT\\saved.zip");
});

test("Windows version choice preserves availability and approved-build gates", async ({
  page,
}) => {
  await setup(page, [
    build,
    { ...build, id: "unknown", version: "2.0", availability: "unknown" },
    { ...build, id: "revoked", version: "Revoked", review: "revoked" },
  ]);
  const choice = page.getByRole("combobox", { name: "Версия для Windows" });
  await expect(choice.locator("option")).toHaveCount(2);
  await choice.selectOption("unknown");
  await expect(
    page.getByRole("button", { name: "Скачать для Windows", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText("Доступность файла не подтверждена", { exact: true }),
  ).toBeVisible();
  await choice.selectOption("build-a");
  await page
    .getByRole("button", { name: "Скачать для Windows", exact: true })
    .click();
  expect(
    await page.evaluate(
      () =>
        (
          window as unknown as { qaCalls: { command: string; args: unknown }[] }
        ).qaCalls.find((c) => c.command === "start_hub_download")?.args,
    ),
  ).toEqual({
    projectId: "port-a",
    buildId: "build-a",
    projectName: "Download project",
  });
});
