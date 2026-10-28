import { test, expect } from "@playwright/test";

test("update selection, progress, cancellation and one installation with the same identity", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const item = {
      id: "base",
      collectionId: "bloodborne",
      root: "C:/QA/base",
      dataPath: "C:/QA/base/CUSA03173",
      runtimePath: "C:/QA/base/runtime",
      version: "01.00",
      manifestSha256: "QA",
    };
    const q = {
      items: [item],
      running: [] as string[],
      updates: 0,
      cancels: 0,
      picks: 0,
      launched: "",
      mergeId: "",
      operation: {
        phase: "",
        active: false,
        completed: 0,
        total: 0,
        message: "",
      },
    };
    Object.assign(window, {
      qa: q,
      isTauri: true,
      __TAURI_INTERNALS__: {
        invoke: async (command: string, args: any) => {
          if (command === "take_launch_request") return null;
          if (command === "load_settings")
            return {
              theme: "dark",
              installDir: "",
              compactCards: false,
              reducedMotion: true,
            };
          if (command === "load_media")
            return { hero: "", cover: "", banner: "", gallery: [] };
          if (command === "list_installations") return structuredClone(q.items);
          if (command === "running_installations") return [...q.running];
          if (command === "install_status") return { ...q.operation };
          if (command === "plugin:dialog|open") {
            q.picks++;
            return q.picks === 1 ? null : "C:/QA/update.pkg";
          }
          if (command === "update_installation") {
            if (args.id !== "base" || args.path !== "C:/QA/update.pkg")
              throw Error("Wrong selection");
            q.updates++;
            q.mergeId = String(args.updatedId || "");
            q.operation = {
              phase: "updating",
              active: true,
              completed: 25,
              total: 100,
              message: "Проверка новой 1.09",
            };
            return;
          }
          if (command === "cancel_install") {
            q.cancels++;
            q.operation = { ...q.operation, active: false, phase: "cancelled" };
            return;
          }
          if (command === "launch_installation") {
            q.launched = args.id;
            return "QA";
          }
          throw Error(command);
        },
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Библиотека", exact: true }).click();
  await page.getByRole("button", { name: "Выбрать: Bloodborne" }).click();
  await page.getByText("Управление игрой", { exact: true }).click();
  const update = page.getByRole("button", {
    name: "Установить обновление",
    exact: true,
  });
  await update.click();
  expect(await page.evaluate(() => (window as any).qa.updates)).toBe(0);
  await page.evaluate(() => ((window as any).qa.running = ["base"]));
  await expect(update).toBeDisabled();
  await page.evaluate(() => ((window as any).qa.running = []));
  await expect(update).toBeEnabled();
  await update.click();
  await expect(
    page.getByRole("progressbar", { name: "Прогресс установки" }),
  ).toHaveAttribute("value", "25");
  await expect(update).toBeDisabled();
  await page.getByRole("button", { name: "Главная", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Консольные миры на твоём ПК" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 480, height: 850 });
  await expect(
    page.getByRole("progressbar", { name: "Прогресс установки" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const progress = await page
    .getByRole("progressbar", { name: "Прогресс установки" })
    .boundingBox();
  const hero = await page.locator(".port-home-activity").boundingBox();
  expect(progress!.y + progress!.height).toBeLessThan(hero!.y + hero!.height);
  await page.screenshot({
    path: ".local/evidence/04b/browser-mobile-update-mocked.png",
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Библиотека", exact: true }).click();
  await page.getByRole("button", { name: "Выбрать: Bloodborne" }).click();
  await page.getByText("Управление игрой", { exact: true }).click();
  await page
    .getByRole("button", { name: "Отменить обновление", exact: true })
    .click();
  await expect(update).toBeEnabled();
  expect(await page.evaluate(() => (window as any).qa.cancels)).toBe(1);
  await page.evaluate(() => {
    const q = (window as any).qa;
    q.items.push({ ...q.items[0], id: "side", version: "01.09" });
  });
  const merge = page.getByRole("button", {
    name: "Объединить версии",
    exact: true,
  });
  await expect(merge).toBeEnabled();
  await page.evaluate(() => {
    (window as any).qa.running = ["side"];
  });
  await expect(merge).toBeDisabled();
  await page.evaluate(() => {
    (window as any).qa.running = [];
  });
  await expect(merge).toBeEnabled();
  await merge.click();
  await expect
    .poll(() => page.evaluate(() => (window as any).qa.mergeId))
    .toBe("side");
  await page.evaluate(() => {
    const q = (window as any).qa;
    q.items = q.items.filter((i: { id: string }) => i.id === "base");
    q.items[0].version = "01.09";
    q.operation = {
      phase: "ready",
      active: false,
      completed: 100,
      total: 100,
      message: "Обновление проверено",
    };
  });
  await expect(page.locator(".installed-card")).toHaveCount(1);
  await expect(update).toHaveCount(0);
  await expect(merge).toHaveCount(0);
  await expect(page.locator(".installed-card").first()).toContainText("01.09");
  await page.getByRole("button", { name: "Главная", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Консольные миры на твоём ПК" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Открыть проект Bloodborne", exact: true })
    .click();
  await page.getByRole("button", { name: "Играть", exact: true }).click();
  expect(await page.evaluate(() => (window as any).qa.launched)).toBe("base");
});
