import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { join } from "node:path";

async function main() {
  const preview = spawn(
    "npx",
    ["vite", "preview", "--port", "4173", "--strictPort"],
    {
      shell: true,
      stdio: "inherit",
      cwd: process.cwd(),
    },
  );

  // Wait 3 seconds for server to boot
  await new Promise((r) => setTimeout(r, 3000));

  try {
    const browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1.5,
      locale: "en-US",
    });
    const page = await context.newPage();

    // 1. Home
    console.log("Navigating to Home...");
    await page.goto("http://localhost:4173/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);
    await page.screenshot({ path: "docs/images/screenshot-home.png" });
    console.log("Captured Home screenshot.");

    // 2. Catalog
    console.log("Navigating to Catalog...");
    await page.getByRole("button", { name: "Catalog", exact: true }).click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: "docs/images/screenshot-catalog.png" });
    console.log("Captured Catalog screenshot.");

    // 2b. Project Details
    console.log("Navigating to Project Details...");
    const projectCard = page.locator(".hub-project-card").first();
    if (await projectCard.isVisible()) {
      await projectCard.click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: "docs/images/screenshot-details.png" });
      console.log("Captured Project Details screenshot.");
    }

    // 3. Downloads
    console.log("Navigating to Downloads...");
    await page.getByRole("button", { name: "Downloads", exact: true }).click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: "docs/images/screenshot-downloads.png" });
    console.log("Captured Downloads screenshot.");

    // 4. Settings
    console.log("Navigating to Settings...");
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: "docs/images/screenshot-settings.png" });
    console.log("Captured Settings screenshot.");

    await browser.close();
    console.log("Screenshots captured successfully!");
  } finally {
    preview.kill();
  }
}

main().catch((err) => {
  console.error("Screenshot error:", err);
  process.exit(1);
});
