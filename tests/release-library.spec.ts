import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";

// Mocked IPC only: does not launch/remove any real game or access owner data.
async function library(page: Page, language = "ru", shortcut = false) {
  await page.addInitScript(
    ({ language, shortcut }) => {
      const w = window as any;
      w.isTauri = true;
      w.libraryQA = {
        calls: [],
        running: [],
        fail: false,
        shortcut: shortcut ? "qa-skate" : null,
        items: [
          {
            id: "qa-bloodborne",
            collectionId: "bloodborne",
            version: "01.09",
            health: "installed",
            root: "D:\\QA\\Bloodborne",
            dataPath: "D:\\QA\\Bloodborne\\data",
            runtimePath: "D:\\QA\\Bloodborne\\runtime",
            manifestSha256: "a".repeat(64),
          },
          {
            id: "qa-skate",
            collectionId: "skate3",
            version: "2.0.2",
            health: "installed",
            root: "D:\\QA\\Skate",
            dataPath: "D:\\QA\\Skate\\data",
            runtimePath: "D:\\QA\\Skate\\runtime",
            manifestSha256: "b".repeat(64),
          },
        ],
      };
      w.__TAURI_INTERNALS__ = {
        async invoke(command: string, args: any) {
          const q = w.libraryQA;
          q.calls.push({ command, args });
          if (command === "load_settings")
            return {
              theme: "dark",
              language,
              reducedMotion: true,
              compactCards: false,
              installDir: "",
            };
          if (command === "load_hub_preferences")
            return { favorites: [], recent: [] };
          if (command === "hub_download_history") return [];
          if (command === "hub_download_status")
            return {
              phase: "",
              completed: 0,
              name: "",
              message: "",
              total: null,
              path: null,
              speed: 0,
            };
          if (command === "list_installations") {
            if (q.fail) throw Error("PRIVATE-SQL-DIAGNOSTIC");
            return structuredClone(q.items);
          }
          if (command === "running_installations") return [...q.running];
          if (command === "install_status")
            return {
              phase: "",
              active: false,
              completed: 0,
              total: 0,
              message: "",
            };
          if (command === "take_launch_request") {
            const id = q.shortcut;
            q.shortcut = null;
            return id;
          }
          if (command === "launch_installation") {
            q.running.push(args.id);
            return "launched";
          }
          if (command === "verify_installation") return "verified";
          if (command === "remove_installation") {
            q.items = q.items.filter((i: any) => i.id !== args.id);
            return "removed";
          }
          return null;
        },
      };
    },
    { language, shortcut },
  );
  await page.route(
    "https://port-catalog-cms.port-catalog-cms.workers.dev/**",
    (r) => r.fulfill({ status: 503 }),
  );
  await page.goto("/");
}

test("library works independently of catalog and uses native ID actions with removal confirmation", async ({
  page,
}) => {
  await library(page);
  await page.getByRole("button", { name: "Библиотека", exact: true }).click();
  const bloodborne = page
    .locator(".port-library-card")
    .filter({ hasText: "Bloodborne" });
  const skate = page
    .locator(".port-library-card")
    .filter({ hasText: "Skate 3" });
  await expect(bloodborne).toContainText("01.09");
  await skate
    .getByRole("button", { name: "Открыть папку", exact: true })
    .click();
  await skate.locator("summary").click();
  await skate.getByRole("button", { name: "Проверить целостность" }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Целостность файлов подтверждена" }),
  ).toBeVisible();
  await skate.getByRole("button", { name: "Удалить", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(
    await page.evaluate(() =>
      (window as any).libraryQA.calls.filter(
        (c: any) => c.command === "remove_installation",
      ),
    ),
  ).toEqual([]);
  await page.getByRole("button", { name: "Отмена", exact: true }).click();
  await expect(skate).toBeVisible();
  await bloodborne.getByRole("button", { name: "Играть", exact: true }).click();
  await expect(
    bloodborne.getByRole("button", { name: "Играть", exact: true }),
  ).toBeDisabled();
  const calls = await page.evaluate(() =>
    (window as any).libraryQA.calls.filter((c: any) =>
      [
        "open_installation_folder",
        "verify_installation",
        "launch_installation",
      ].includes(c.command),
    ),
  );
  expect(calls.map((c: any) => [c.command, c.args.id])).toEqual([
    ["open_installation_folder", "qa-skate"],
    ["verify_installation", "qa-skate"],
    ["launch_installation", "qa-bloodborne"],
  ]);
  expect(calls.every((c: any) => !Object.hasOwn(c.args, "path"))).toBe(true);
  await skate.getByRole("button", { name: "Удалить", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Удалить", exact: true })
    .click();
  await expect(page.locator(".port-library-card")).toHaveCount(1);
  await expect(bloodborne).toBeVisible();
  expect(
    await page.evaluate(() =>
      (window as any).libraryQA.calls
        .filter((c: any) => c.command === "remove_installation")
        .map((c: any) => c.args),
    ),
  ).toEqual([{ id: "qa-skate", setup: false, confirmed: true }]);
});

test("shortcut request is consumed outside library; failed reads block actions without exposing diagnostics", async ({
  page,
}) => {
  await library(page, "ru", true);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).libraryQA.calls.filter(
            (c: any) => c.command === "launch_installation",
          ).length,
      ),
    )
    .toBe(1);
  await page.evaluate(() => {
    (window as any).libraryQA.fail = true;
  });
  await page.getByRole("button", { name: "Библиотека", exact: true }).click();
  await expect(page.locator(".port-library [role=alert]")).toContainText(
    "Не удалось загрузить библиотеку",
  );
  await expect(page.locator(".port-library")).not.toContainText(
    "PRIVATE-SQL-DIAGNOSTIC",
  );
  for (const button of await page
    .locator(".port-library-card")
    .getByRole("button", { name: "Играть", exact: true })
    .all())
    await expect(button).toBeDisabled();
  await page.evaluate(() => {
    (window as any).libraryQA.fail = false;
  });
  await page.getByRole("button", { name: "Повторить", exact: true }).click();
  await expect(page.locator(".port-library [role=alert]")).toHaveCount(0);
});

for (const [language, label, play] of [
  ["ru", "Библиотека", "Играть"],
  ["en", "Library", "Play"],
  ["es", "Biblioteca", "Jugar"],
  ["fr", "Bibliothèque", "Jouer"],
]) {
  test(`library ${language} remains usable in small and large windows`, async ({
    page,
  }) => {
    await library(page, language);
    await page.getByRole("button", { name: label, exact: true }).click();
    await expect(
      page
        .locator(".port-library-card")
        .first()
        .getByRole("button", { name: play, exact: true }),
    ).toBeVisible();
    for (const [width, height] of [
      [800, 600],
      [1600, 900],
    ]) {
      await page.setViewportSize({ width, height });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (language === "ru") {
        await mkdir(".local/evidence/final-release", { recursive: true });
        await page.screenshot({
          path: `.local/evidence/final-release/library-${width}.png`,
        });
      }
    }
  });
}
