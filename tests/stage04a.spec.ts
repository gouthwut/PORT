import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const item = {
      id: "qa",
      collectionId: "bloodborne",
      root: "C:/QA",
      dataPath: "C:/QA/CUSA03173",
      runtimePath: "C:/QA/runtime",
      version: "01.00",
      manifestSha256: "QA",
    };
    const qa = {
      items: [] as (typeof item)[],
      running: [] as string[],
      launches: 0,
      cancels: 0,
      operation: {
        phase: "",
        active: false,
        completed: 0,
        total: 0,
        message: "",
      },
      item,
    };
    Object.assign(window, {
      qa,
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
          if (command === "list_installations")
            return structuredClone(qa.items);
          if (command === "running_installations") return [...qa.running];
          if (command === "install_status") return { ...qa.operation };
          if (command === "launch_installation") {
            qa.launches++;
            qa.running = [String(args.id)];
            return "QA process";
          }
          if (command === "cancel_install") {
            qa.cancels++;
            qa.operation.active = false;
            qa.operation.phase = "cancelled";
            return;
          }
          if (command === "remove_installation") {
            if (!args.confirmed) throw Error("Missing confirmation");
            qa.items = [];
            return "QA removed";
          }
          throw Error(command);
        },
      },
    });
  });
});

test("shared home/focus, details and library follow install, running and removal", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Установить", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    const q = (window as any).qa;
    q.operation = {
      phase: "copying",
      active: true,
      completed: 25,
      total: 100,
      message: "QA",
    };
  });
  await expect(
    page.getByRole("progressbar", { name: "Прогресс установки" }),
  ).toHaveAttribute("value", "25");
  await page
    .getByRole("button", { name: "Отменить установку", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Установить", exact: true }),
  ).toBeEnabled();
  await page.evaluate(() => {
    const q = (window as any).qa;
    q.items = [q.item];
    q.operation = { ...q.operation, phase: "ready", active: false };
  });
  await expect(
    page.getByRole("button", { name: "Играть", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Подробнее", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Играть", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Библиотека", exact: true }).click();
  await page.getByRole("button", { name: "Выбрать: Bloodborne" }).click();
  await expect(page.getByText("C:/QA/CUSA03173", { exact: true })).toBeHidden();
  await page.getByText("Техническая информация", { exact: true }).click();
  await expect(
    page.getByText("C:/QA/CUSA03173", { exact: true }),
  ).toBeVisible();
  await page.getByText("Техническая информация", { exact: true }).click();
  await page.screenshot({
    path: ".local/evidence/04a-browser-library-mocked.png",
  });
  await page.getByRole("button", { name: "Играть", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Уже запущена", exact: true }),
  ).toBeDisabled();
  expect(await page.evaluate(() => (window as any).qa.launches)).toBe(1);
  await page.getByRole("button", { name: "Главная", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Уже запущена", exact: true }),
  ).toBeDisabled();
  await page.evaluate(() => {
    (window as any).qa.running = [];
  });
  await page.getByRole("button", { name: "Библиотека", exact: true }).click();
  await page.getByRole("button", { name: "Выбрать: Bloodborne" }).click();
  await page.getByText("Управление игрой", { exact: true }).click();
  await page.getByRole("button", { name: "Удалить", exact: true }).click();
  await page
    .getByRole("button", { name: "Подтвердить удаление", exact: true })
    .click();
  await expect(page.getByText("0 установленных игр")).toBeVisible();
  await page.getByRole("button", { name: "Главная", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Установить", exact: true }),
  ).toBeEnabled();
});

test("fresh startup reads installed/running backend state and supports many keyboard selectable cards", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const q = (window as any).qa;
    q.items = Array.from({ length: 24 }, (_, i) => ({
      ...q.item,
      id: `qa-${i}`,
      collectionId: i === 0 ? "bloodborne" : `QA game ${i}`,
    }));
    q.running = ["qa-0"];
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Уже запущена", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Библиотека", exact: true }).click();
  await expect(page.locator(".installed-card")).toHaveCount(24);
  await page
    .getByRole("button", { name: "Выбрать: QA game 1", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("region", {
      name: "Выбранная игра: QA game 1",
      exact: true,
    }),
  ).toBeVisible();
  await page.setViewportSize({ width: 480, height: 900 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});

test("incomplete install offers supported installer retry and never claims ready", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const q = (window as any).qa;
    q.operation = {
      phase: "error",
      active: false,
      completed: 20,
      total: 100,
      message: "QA interrupted",
    };
  });
  await page.goto("/");
  await expect(page.getByText(/Установка не завершена/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Установить", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Играть", exact: true }),
  ).toHaveCount(0);
});

test("unavailable SQLite state disables primary action instead of assuming not installed", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const ipc = (window as any).__TAURI_INTERNALS__;
    const original = ipc.invoke;
    ipc.invoke = (command: string, args: unknown) => {
      if (command === "list_installations")
        return Promise.reject(Error("QA database unavailable"));
      return original(command, args);
    };
  });
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText(
    "QA database unavailable",
  );
  await expect(
    page.getByRole("button", { name: "Загрузка…", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Установить", exact: true }),
  ).toHaveCount(0);
});
