// Read-only Stage 04A checks against the actual release WebView and Rust IPC.
import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
try {
  const page = browser
    .contexts()
    .flatMap((c) => c.pages())
    .find((p) => /tauri\.localhost|tauri:\/\//.test(p.url()));
  if (!page) throw Error("Actual PORT WebView not found");
  const call = (command) =>
    page.evaluate((c) => window.__TAURI_INTERNALS__.invoke(c), command);
  const baseline = JSON.parse(
    await fs.readFile(".local/stage03/native-installations.json", "utf8"),
  );
  const records = await call("list_installations");
  expect(records).toEqual(baseline);
  const running = await call("running_installations");
  if (await page.getByRole("dialog").isVisible())
    await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Главная", exact: true }).click();
  const label = running.includes(records[0].id) ? "Уже запущена" : "Играть";
  await expect(
    page.getByRole("button", { name: label, exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: ".local/evidence/04a-native-home.png" });
  await page.getByRole("button", { name: "Подробнее", exact: true }).click();
  await expect(
    page.getByRole("button", { name: label, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Библиотека", exact: true }).click();
  await expect(page.locator(".installed-card")).toHaveCount(1);
  await page.screenshot({
    path: ".local/evidence/04a-native-library-grid.png",
  });
  await page.getByRole("button", { name: "Выбрать: Bloodborne" }).click();
  await expect(
    page.getByRole("button", { name: label, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(records[0].dataPath, { exact: true }),
  ).toBeHidden();
  await page.locator(".library-detail").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: ".local/evidence/04a-native-library-detail.png",
  });
  await page.getByText("Техническая информация", { exact: true }).click();
  await expect(
    page.getByText(records[0].dataPath, { exact: true }),
  ).toBeVisible();
  await page.getByText("Техническая информация", { exact: true }).click();
  expect(await call("list_installations")).toEqual(records);
  const stat = await fs.stat(records[0].dataPath + "/eboot.bin");
  expect(stat.size).toBeGreaterThan(0);
  await fs.writeFile(
    ".local/evidence/04a-native-result.json",
    JSON.stringify(
      {
        unchangedRecords: true,
        primaryEbootPresent: true,
        running,
        action: label,
        noGameLaunchOrRemoval: true,
      },
      null,
      2,
    ),
  );
  console.log(
    "Native persisted installation, home/details/library action, hidden technical data and cover grid pass; no game launch/removal performed.",
  );
} finally {
  await browser.close();
}
