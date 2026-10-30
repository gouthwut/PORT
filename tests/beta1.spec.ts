import { test, expect } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] }, locale: "en-US" });

test("new users start in English and retain an explicit language choice", async ({
  page,
}) => {
  await page.route(
    "https://port-catalog-cms.port-catalog-cms.workers.dev/v2/**",
    (route) =>
      route.fulfill({
        json: { schemaVersion: 2, items: [], total: 0, nextCursor: null },
      }),
  );
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByText(/0\.1\.0-beta\.3/).first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: "New versions on GitHub" }),
  ).toBeVisible();
  await page
    .locator("select")
    .filter({ has: page.locator('option[value="de"]') })
    .selectOption("de");
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
});

test("existing language preferences are preserved on upgrade", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "port.settings.v1",
      JSON.stringify({
        theme: "dark",
        language: "fr",
        installDir: "",
        reducedMotion: false,
        compactCards: false,
      }),
    ),
  );
  await page.route(
    "https://port-catalog-cms.port-catalog-cms.workers.dev/v2/**",
    (route) =>
      route.fulfill({
        json: { schemaVersion: 2, items: [], total: 0, nextCursor: null },
      }),
  );
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(
    page.getByRole("button", { name: "Paramètres", exact: true }),
  ).toBeVisible();
});

test("displays clean and polished empty state in Home and Catalog when catalog has 0 projects", async ({
  page,
}) => {
  await page.route(
    "https://port-catalog-cms.port-catalog-cms.workers.dev/v2/**",
    (route) =>
      route.fulfill({
        json: { schemaVersion: 2, items: [], total: 0, nextCursor: null },
      }),
  );
  await page.goto("/");
  // Home view empty state
  await expect(
    page.getByText("No projects available yet").first(),
  ).toBeVisible();
  await expect(
    page
      .getByText(
        "New ports and recompilations will appear here as they're added to the catalog.",
      )
      .first(),
  ).toBeVisible();

  // Navigate to Catalog / Discover view
  await page.getByRole("button", { name: "Catalog", exact: true }).click();
  await expect(
    page.getByText("No projects available yet").first(),
  ).toBeVisible();
  await expect(
    page
      .getByText(
        "New ports and recompilations will appear here as they're added to the catalog.",
      )
      .first(),
  ).toBeVisible();
});
