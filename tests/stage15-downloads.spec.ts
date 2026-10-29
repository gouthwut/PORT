import { test, expect, type Page } from "@playwright/test";

// IPC-shaped fixture only. Real filesystem, transfer and restart are checked separately.
async function nativeFixture(page: Page) {
  await page.addInitScript(() => {
    const w = window as any;
    w.isTauri = true;
    const empty = {
      phase: "",
      name: "",
      completed: 0,
      total: null,
      speed: 0,
      message: "",
      path: null,
    };
    w.qa15 = { ...empty };
    w.qa15Calls = [];
    const saved = () =>
      JSON.parse(localStorage.getItem("qa15.history") || "[]");
    if (!localStorage.getItem("qa15.history"))
      localStorage.setItem(
        "qa15.history",
        JSON.stringify([
          {
            ...empty,
            id: "1",
            projectId: "project-a",
            projectName: "Project A",
            buildId: "build-a",
            version: "1.0.0",
            arch: "x64",
            channel: "stable",
            phase: "completed",
            name: "archive.zip",
            path: "C:\\PORT\\QA\\archive.zip",
            completed: 100,
            total: 100,
          },
        ]),
      );
    w.__TAURI_INTERNALS__ = {
      async invoke(command: string, args: any) {
        w.qa15Calls.push({ command, args });
        if (command === "remove_hub_download" && w.qa15RemoveFails)
          throw "Database write failed";
        if (command === "load_settings")
          return {
            theme: "dark",
            reducedMotion: true,
            compactCards: false,
            installDir: "",
            language: "ru",
          };
        if (command === "load_hub_preferences")
          return { favorites: [], recent: [] };
        if (command === "hub_download_status") return w.qa15;
        if (command === "hub_download_history") return saved();
        if (command === "remove_hub_download")
          localStorage.setItem(
            "qa15.history",
            JSON.stringify(saved().filter((r: any) => r.id !== args.id)),
          );
        if (command === "open_hub_download_folder")
          throw "Скачанный файл больше не найден";
        if (command === "start_hub_download")
          w.qa15 = {
            ...empty,
            ...args,
            id: "2",
            phase: "downloading",
            name: "archive.zip",
            completed: 25,
            total: 100,
            speed: 25,
            message: "Скачивание официального файла…",
          };
        if (command === "cancel_hub_download") {
          w.qa15 = {
            ...w.qa15,
            phase: "cancelled",
            path: null,
            speed: 0,
            message: "Загрузка отменена",
          };
          localStorage.setItem(
            "qa15.history",
            JSON.stringify([w.qa15, ...saved()]),
          );
        }
        return null;
      },
    };
  });
  await page.route(
    "https://port-catalog-cms.port-catalog-cms.workers.dev/**",
    (r) => r.fulfill({ status: 503, body: "offline fixture" }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Загрузки", exact: true }).click();
  await expect(page.locator(".download-history-row")).toHaveCount(1);
}
test("history survives reload, missing-file reveal is clear and removal only sends record ID", async ({
  page,
}) => {
  await nativeFixture(page);
  await expect(page.locator(".download-history-row")).toContainText("1.0.0");
  await page.reload();
  await page.getByRole("button", { name: "Загрузки", exact: true }).click();
  await expect(page.locator(".download-history-row")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Открыть папку", exact: true })
    .click();
  await expect(page.locator(".downloads-center [role=alert]")).toHaveText(
    "Скачанный файл больше не найден",
  );
  await page
    .getByRole("button", { name: "Убрать из истории", exact: true })
    .click();
  await expect(page.locator(".download-history-row")).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      (window as any).qa15Calls.filter(
        (c: any) => c.command === "remove_hub_download",
      ),
    ),
  ).toEqual([{ command: "remove_hub_download", args: { id: "1" } }]);
  await expect(page.locator(".port-download-panel")).toHaveCount(0);
});
test("retry restarts by IDs with explicit repeat, cancellation retains history and no completed-file action", async ({
  page,
}) => {
  await nativeFixture(page);
  await page.getByRole("button", { name: "Повторить", exact: true }).click();
  await expect(page.locator(".download-history-row")).toHaveCount(2);
  await expect(
    page.locator(".download-history-row").first().getByRole("progressbar"),
  ).toHaveAttribute("value", "25");
  await expect(
    page
      .locator(".download-history-row")
      .last()
      .getByRole("button", { name: "Повторить" }),
  ).toBeDisabled();
  expect(
    await page.evaluate(
      () =>
        (window as any).qa15Calls.find(
          (c: any) => c.command === "start_hub_download",
        ).args,
    ),
  ).toEqual({
    projectId: "project-a",
    buildId: "build-a",
    projectName: "Project A",
    repeat: true,
  });
  await page
    .getByRole("button", { name: "Отменить загрузку", exact: true })
    .click();
  const row = page.locator(".download-history-row").first();
  await expect(row).toContainText("Загрузка отменена");
  await expect(row.getByRole("button", { name: "Открыть папку" })).toHaveCount(
    0,
  );
  await page.screenshot({
    path: ".local/evidence/15/browser-downloads.png",
    fullPage: true,
  });
});

test("history write warnings persist and failed history removal keeps the record", async ({
  page,
}) => {
  await page.clock.install();
  await nativeFixture(page);
  await page.evaluate(() => {
    const w = window as any;
    w.qa15RemoveFails = true;
    w.qa15 = {
      ...JSON.parse(localStorage.getItem("qa15.history")!)[0],
      historyError: true,
      message: "Не удалось сохранить историю. Файл на диске не удалён.",
    };
  });
  await page
    .getByRole("button", { name: "Убрать из истории", exact: true })
    .click();
  await expect(page.locator(".downloads-center [role=alert]")).toContainText(
    "Не удалось очистить запись",
  );
  await expect(page.locator(".download-history-row")).toHaveCount(1);
  await page.getByRole("button", { name: "Главная", exact: true }).click();
  await page.clock.fastForward(1000);
  const panel = page.locator(".port-download-panel");
  await expect(panel).toContainText("Файл на диске не удалён");
  await page.clock.fastForward(10000);
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "Закрыть уведомление" }).click();
  await page.clock.fastForward(250);
  await expect(panel).toHaveCount(0);
});
