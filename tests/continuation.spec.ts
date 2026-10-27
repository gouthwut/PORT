import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";

test("private bundled art is present by default and remains available offline", async ({
  page,
}) => {
  test.skip(
    !existsSync("src/assets/bloodborne-local/hero.webp"),
    "Public checkout has no redistribution-restricted art",
  );
  await page.goto("/");
  await expect(page.locator(".hero img.game-art")).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator(".hero img")
        .evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth > 0),
    )
    .toBeTruthy();
  expect(
    await page.evaluate(() => localStorage.getItem("port.media.v1")),
  ).toBeNull();
  // Block all external destinations, including on cold navigations. Local Vite stands in for bundled assets.
  await page.route("**/*", (route) =>
    new URL(route.request().url()).hostname === "127.0.0.1"
      ? route.continue()
      : route.abort(),
  );
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await page.getByRole("button", { name: "Подробнее: Bloodborne" }).click();
  await expect(page.locator(".detail-banner img").first()).toBeVisible();
  const thumb = page.getByRole("button", {
    name: "Открыть скриншот 1",
    exact: true,
  });
  await thumb.click();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("dialog")).toContainText("4 / 4");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("dialog")).toContainText("1 / 4");
  await expect
    .poll(() =>
      page
        .getByRole("dialog")
        .locator("img")
        .evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth > 0),
    )
    .toBeTruthy();
  await page.keyboard.press("Escape");
  await expect(thumb).toBeFocused();
});

// These test only frontend IPC wiring; real OS-dialog evidence is recorded separately.
for (const choice of ["single", "multiple", "cancel", "error"] as const) {
  test(`PKG picker UI contract (${choice}, mocked native IPC)`, async ({
    page,
  }) => {
    await page.addInitScript((choice) => {
      const paths =
        choice === "single"
          ? ["C:\\fixture\\base.pkg"]
          : ["C:\\fixture\\update.pkg", "C:\\fixture\\base.pkg"];
      Object.assign(window, {
        isTauri: true,
        __TAURI_INTERNALS__: {
          invoke: async (command: string, args: Record<string, unknown>) => {
            if (command === "take_launch_request") return null;
            if (command === "running_installations") return [];
            if (command === "list_installations") return [];
            if (command === "install_status")
              return {
                phase: "",
                active: false,
                completed: 0,
                total: 0,
                message: "",
              };
            if (command === "load_settings")
              return {
                theme: "dark",
                installDir: "",
                reducedMotion: true,
                compactCards: false,
              };
            if (command === "load_media")
              return { hero: "", cover: "", banner: "", gallery: [] };
            if (command === "install_status")
              return {
                phase: "",
                active: false,
                completed: 0,
                total: 0,
                message: "",
              };
            if (command === "download_status")
              return {
                phase: "idle",
                completed: 0,
                total: 189268960,
                speed: 0,
                message: "QA",
                path: null,
                active: false,
              };
            if (command === "plugin:dialog|open") {
              Object.assign(window, { pickerOptions: args.options });
              return choice === "cancel" ? null : paths;
            }
            if (command === "inspect_packages") {
              Object.assign(window, { inspectedPaths: args.paths });
              if (choice === "error") throw new Error("QA: повреждённый PKG");
              return {
                items: paths.map((path, i) => ({
                  fileName: path.split("\\").pop(),
                  error: null,
                  inspection: {
                    format: "PS4 Orbis CNT",
                    contentId: "EP9000-CUSA03173_00-QA",
                    titleId: "CUSA03173",
                    region: "Европа",
                    version:
                      choice === "multiple" && i === 0 ? "01.09" : "01.00",
                    packageType: "PS4",
                    role: choice === "multiple" && i === 0 ? "update" : "base",
                    category: "QA",
                    pfsEncrypted: true,
                    size: 1024,
                    compatible: false,
                    reason: "QA",
                  },
                })),
                metadataCompatible: true,
                installable: false,
                issues: [],
                summary: "QA: согласованы по метаданным",
              };
            }
            throw new Error(`Unexpected mock command: ${command}`);
          },
        },
      });
    }, choice);
    await page.goto("/");
    await page.getByRole("button", { name: "Установить", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Выбрать PKG", exact: true }),
    ).toBeEnabled();
    const options = await page.evaluate(
      () => (window as unknown as { pickerOptions: object }).pickerOptions,
    );
    expect(options).toMatchObject({
      multiple: true,
      directory: false,
      filters: [{ name: "PS4 PKG", extensions: ["pkg"] }],
    });
    if (choice === "cancel") {
      expect(await page.evaluate(() => "inspectedPaths" in window)).toBeFalsy();
      await expect(page.locator(".package-component")).toHaveCount(0);
    } else if (choice === "error") {
      await expect(page.getByRole("alert")).toContainText("повреждённый PKG");
    } else {
      await expect(page.locator(".package-component")).toHaveCount(
        choice === "single" ? 1 : 2,
      );
      await expect(page.getByRole("dialog")).toContainText(
        "Bloodborne — основная игра",
      );
      if (choice === "multiple")
        await expect(page.getByRole("dialog")).toContainText(
          "Bloodborne — обновление 01.09",
        );
      await expect(page.getByRole("dialog")).toContainText(
        "Установка не выполнена",
      );
    }
  });
}
