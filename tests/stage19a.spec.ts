import { expect, test } from "@playwright/test";

const origin = "https://port-catalog-cms.port-catalog-cms.workers.dev";
for (const failure of [401, 403, 404, 429, "network"] as const) {
  test(`beta: ${failure} leaves an honest empty catalog`, async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("workers.dev")) requests.push(r.url());
    });
    await page.route(`${origin}/**`, (r) =>
      failure === "network"
        ? r.abort("failed")
        : r.fulfill({ status: failure, body: "Unavailable" }),
    );
    await page.goto("/");
    await expect(page.locator(".hub-project-card")).toHaveCount(0);
    await expect(
      page.getByText("Каталог не удалось загрузить.", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Каталог", exact: true }).click();
    await expect(page.locator(".hub-project-card")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Скачать для Windows", exact: true }),
    ).toHaveCount(0);
    expect(requests.every((url) => !url.includes("/v1/"))).toBe(true);
  });
}
