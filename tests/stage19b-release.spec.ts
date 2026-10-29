import { test, expect } from "@playwright/test";

test("release uses production v2 for both catalog and project despite dev overrides", async ({
  page,
}) => {
  const origin = "https://port-catalog-cms.port-catalog-cms.workers.dev";
  const requests: string[] = [];
  const project = {
    id: "release-check",
    name: "Release routing QA",
    gameIds: ["fiction"],
    kind: "recompilation",
    lifecycle: "active",
    sourcePlatforms: ["Xbox 360"],
    targetPlatforms: ["windows"],
  };
  page.on("request", (r) => {
    if (r.url().includes("/v2/")) requests.push(r.url());
  });
  await page.route(`${origin}/v2/**`, (r) => {
    const p = new URL(r.request().url()).pathname;
    return r.fulfill({
      json:
        p === "/v2/projects"
          ? { schemaVersion: 2, items: [project], nextCursor: null, total: 1 }
          : p === "/v2/games"
            ? {
                schemaVersion: 2,
                items: [{ id: "fiction", title: "Fictional QA" }],
                nextCursor: null,
              }
            : {
                schemaVersion: 2,
                project,
                games: [{ id: "fiction", title: "Fictional QA" }],
                builds: [],
              },
    });
  });
  await page.goto("http://127.0.0.1:1421/");
  await expect(page.locator(".hub-project-card")).toHaveCount(1);
  await page.locator(".hub-project-card").click();
  await expect(page.locator("main")).toContainText("Release routing QA");
  await expect
    .poll(() =>
      requests.some(
        (u) => new URL(u).pathname === "/v2/projects/release-check",
      ),
    )
    .toBe(true);
  expect(requests.length).toBeGreaterThan(1);
  expect(requests.every((u) => u.startsWith(`${origin}/v2/`))).toBe(true);
});
