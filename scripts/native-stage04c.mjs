// Read-only installation QA against the actual release WebView/Rust IPC.
// --cache expects an explicitly seeded LOCAL fixture in the separate catalog tables.
// No server, real publication, game launch, install, update or removal is simulated.
import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
const evidence = ".local/evidence/04c";
const before = JSON.parse(await fs.readFile(`${evidence}/before.json`, "utf8"));
const baseline = before.installations.map(([, raw]) => JSON.parse(raw));
const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
try {
  const page = browser
    .contexts()
    .flatMap((c) => c.pages())
    .find((p) => /tauri\.localhost|tauri:\/\//.test(p.url()));
  if (!page) throw Error("Actual native PORT WebView missing");
  const call = (command, args = {}) =>
    page.evaluate(
      ({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args),
      { command, args },
    );
  expect(await call("list_installations")).toEqual(baseline);
  const snapshot = await call("load_catalog");
  const endpoint = snapshot.endpoint;
  for (const endpoint of [
    "http://localhost/api",
    "https://127.0.0.1/a",
    "https://user:pass@example.com/a",
    "javascript:alert(1)",
  ]) {
    let rejected = false;
    try {
      await call("configure_catalog", { endpoint });
    } catch {
      rejected = true;
    }
    expect(rejected).toBe(true);
  }
  expect((await call("load_catalog")).endpoint).toBe(endpoint);
  await page.getByRole("button", { name: "Каталог", exact: true }).click();
  if (process.argv.includes("--cache")) {
    expect(snapshot.source).toBe("cache");
    expect(Object.keys(snapshot.images)).toHaveLength(1);
    await page
      .getByRole("button", {
        name: "Подробнее: Native QA fixture · local cache",
      })
      .click();
    await expect(page.getByText(/Установка недоступна: адаптер/)).toBeVisible();
    await expect(page.locator(".detail-banner img")).toHaveAttribute(
      "src",
      /^data:image\/webp;base64,/,
    );
    await page.screenshot({
      path: `${evidence}/native-cached-fixture-details.png`,
    });
  } else if (process.argv.includes("--removed")) {
    expect(snapshot.catalog.games).toEqual([]);
    await expect(
      page.getByRole("button", { name: "Подробнее: Bloodborne" }),
    ).toHaveCount(0);
  } else {
    expect(snapshot.source).toBe("demo");
    await expect(page.getByText(/Локальные тестовые данные/)).toBeVisible();
  }
  await page.getByRole("button", { name: "Библиотека", exact: true }).click();
  await expect(page.locator(".installed-card")).toHaveCount(baseline.length);
  await page.getByRole("button", { name: "Выбрать: Bloodborne" }).click();
  await expect(
    page.getByRole("button", { name: "Играть", exact: true }),
  ).toBeEnabled();
  await page.screenshot({
    path: `${evidence}/native-library-${process.argv.includes("--removed") ? "unpublished" : snapshot.source}.png`,
  });
  if (process.argv.includes("--verify")) {
    await call("verify_installation", { id: baseline[0].id });
    const deadline = Date.now() + 20 * 60 * 1000;
    for (;;) {
      const status = await call("install_status");
      if (!status.active) {
        expect(status.phase).toBe("ready");
        console.log(
          "Native full immutable verification passed:",
          status.message,
        );
        break;
      }
      if (Date.now() > deadline)
        throw Error(
          "Verification timeout; no cancellation or game mutation attempted",
        );
      console.log(`Native verification: ${status.completed}/${status.total}`);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  expect(await call("list_installations")).toEqual(baseline);
  await fs.writeFile(
    `${evidence}/native-${process.argv.includes("--removed") ? "unpublished" : snapshot.source}-result.json`,
    JSON.stringify(
      {
        unchangedInstallations: true,
        source: snapshot.source,
        catalogGames: snapshot.catalog.games.length,
        cachedImages: Object.keys(snapshot.images).length,
        libraryCount: baseline.length,
        version: baseline[0].version,
        verified: process.argv.includes("--verify"),
        noGameLaunchInstallUpdateRemoval: true,
      },
      null,
      2,
    ),
  );
  console.log(
    "Actual native catalog, URL rejection, library identity and Play availability passed.",
  );
} finally {
  await browser.close();
}
