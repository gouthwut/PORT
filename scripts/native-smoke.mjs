// Launch the built exe with a loopback WebView2 debugging port before this script.
// Test-only environment; no debug port is configured in production Tauri settings.
import { chromium, expect } from "@playwright/test";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => /tauri\.localhost|tauri:\/\//.test(p.url()));
if (!page) throw new Error("No native Tauri WebView found");
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await expect(
  page.getByRole("heading", { name: "За пределами консоли." }),
).toBeVisible();
await expect(page.locator(".build-label")).toContainText("WINDOWS");
await expect(page.locator("main > div")).toHaveCSS("opacity", "1");
await page.screenshot({ path: "screenshots/11-native-home.png" });
await page.getByRole("button", { name: "Установить", exact: true }).click();
await expect(page.getByRole("dialog")).toContainText(
  "Функция ещё не реализована",
);
await page.keyboard.press("Escape");
await page.getByRole("button", { name: "Настройки", exact: true }).click();
await expect(
  page.getByText("Настройки хранятся в SQLite на этом компьютере."),
).toBeVisible();
const reduced = page.getByRole("switch", { name: "Меньше анимаций" });
const original = await reduced.isChecked();
await reduced.click();
await expect(reduced).toBeChecked({ checked: !original });
await page.reload();
await page.getByRole("button", { name: "Настройки", exact: true }).click();
await expect(reduced).toBeChecked({ checked: !original });
await expect(page.locator("main > div")).toHaveCSS("opacity", "1");
await page.screenshot({ path: "screenshots/12-native-settings.png" });
// Restore the user's settings after the test; a second process launch validates them.
await reduced.click();
await expect(reduced).toBeChecked({ checked: original });
if (errors.length) throw new Error(errors.join("\n"));
console.log(
  "Native WebView smoke passed: Windows marker, installer dialog, SQLite persistence across reload, restored settings; no JS errors.",
);
await browser.close();
