// Actual release WebView + Rust IPC. No install, game launch or publication mutations.
import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
import endpoint from "../src/catalog-endpoint.json" with { type: "json" };
const dir = ".local/evidence/05c";
const before = JSON.parse(await fs.readFile(`${dir}/before.json`, "utf8"));
const baseline = before.installations.map(([, raw]) => JSON.parse(raw));
const mode = "production";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
try {
  const pages = () =>
    browser
      .contexts()
      .flatMap((c) => c.pages())
      .find((p) => /tauri\.localhost|tauri:\/\//.test(p.url()));
  await expect.poll(() => !!pages(), { timeout: 10000 }).toBe(true);
  const page = pages();
  if (!page) throw Error("Actual release WebView missing");
  const call = (command, args = {}) =>
    page.evaluate(
      ({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args),
      { command, args },
    );
  expect(await call("list_installations")).toEqual(baseline);
  await page.getByRole("button", { name: "Каталог", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Каталог.", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Каталог обновлён", { exact: true })).toBeVisible(
    { timeout: 60000 },
  );
  const snapshot = await call("load_catalog");
  expect(snapshot.source).toBe("cache");
  expect(snapshot.endpoint).toBe(endpoint);
  expect(Object.keys(snapshot.images)).toHaveLength(6);
  expect(snapshot.warning).toBe("");
  await fs.writeFile(
    `${dir}/production-snapshot.json`,
    JSON.stringify(snapshot),
  );
  await expect(
    page.getByRole("button", { name: "Подробнее: Bloodborne" }),
  ).toBeVisible();
  await page.waitForTimeout(350); // Settle native Motion page transition for evidence.
  await page.screenshot({ path: `${dir}/native-${mode}-catalog.png` });
  await page.getByRole("button", { name: "Подробнее: Bloodborne" }).click();
  await expect(page.locator(".detail-banner h1")).toHaveText("Bloodborne");
  await expect(
    page.getByRole("button", { name: "Играть", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Установить", exact: true }),
  ).toHaveCount(0);
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${dir}/native-${mode}-details.png` });
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await expect(page.getByLabel("HTTPS API каталога")).toHaveCount(0);
  await expect(
    page.getByText("Для разработчиков · онлайн-каталог"),
  ).toHaveCount(0);
  await expect(page.getByText("Подробности ошибки")).toHaveCount(0);
  await expect(call("configure_catalog", { endpoint })).rejects.toBeDefined();
  await page.getByRole("button", { name: "Библиотека", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Библиотека.", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".installed-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Выбрать: Bloodborne" }).click();
  await expect(
    page.getByRole("button", { name: "Играть", exact: true }),
  ).toBeEnabled();
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${dir}/native-${mode}-library.png` });
  expect(await call("list_installations")).toEqual(baseline);
  await fs.writeFile(
    `${dir}/native-${mode}-result.json`,
    JSON.stringify(
      {
        mode,
        endpoint: snapshot.endpoint,
        revision: snapshot.catalog.revision,
        games: snapshot.catalog.games.length,
        images: Object.keys(snapshot.images).length,
        installationUnchanged: true,
        version: baseline[0].version,
        playEnabled: true,
        noGameLaunch: true,
      },
      null,
      2,
    ),
  );
  console.log(
    `Actual native ${mode}: catalog, release settings guard, one unchanged Bloodborne 01.09 and Play passed.`,
  );
} finally {
  await browser.close();
}
