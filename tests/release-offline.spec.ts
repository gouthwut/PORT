import { expect, test } from "@playwright/test";

const origin = "https://port-catalog-cms.port-catalog-cms.workers.dev";
const key = "port.hub.catalog.v2";
const project = {
  id: "saved-project",
  name: "Saved project",
  summary: "Public description",
  gameIds: ["original"],
  kind: "recompilation",
  lifecycle: "active",
  sourcePlatforms: ["Nintendo 64"],
  targetPlatforms: ["windows"],
  cover: null,
};

test("complete public catalog survives reload offline; failed partial refresh cannot replace it", async ({
  page,
}) => {
  let mode = "online";
  await page.route(`${origin}/v2/**`, (r) => {
    const u = new URL(r.request().url());
    if (mode === "offline" || u.searchParams.has("cursor"))
      return r.fulfill({ status: 503 });
    if (u.pathname === "/v2/projects")
      return r.fulfill({
        json: {
          schemaVersion: 2,
          items: [
            mode === "partial"
              ? { ...project, id: "partial-only", name: "Never commit partial" }
              : project,
          ],
          total: mode === "partial" ? 2 : 1,
          nextCursor: mode === "partial" ? "1" : null,
        },
      });
    if (u.pathname === "/v2/games")
      return r.fulfill({
        json: {
          schemaVersion: 2,
          items: [{ id: "original", title: "Original title" }],
          nextCursor: null,
        },
      });
    return r.fulfill({ status: 503 });
  });
  await page.goto("/");
  await expect(page.locator(".hub-project-card").first()).toContainText(
    "Saved project",
  );
  await expect
    .poll(() => page.evaluate((key) => !!localStorage.getItem(key), key))
    .toBe(true);
  const saved = await page.evaluate((key) => localStorage.getItem(key), key);
  mode = "partial";
  await page.getByRole("button", { name: "Каталог", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Обновить каталог" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Обновить каталог" }).click();
  await expect(page.locator(".hub-catalog-error")).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(
    saved,
  );
  mode = "offline";
  await page.reload();
  await expect(
    page.getByText(
      "Показан сохранённый каталог. Для актуальных сборок подключитесь к интернету.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Каталог", exact: true }).click();
  await expect(page.locator(".hub-project-card")).toHaveCount(1);
  await expect(page.locator(".hub-project-card")).toContainText(
    "Saved project",
  );
  await expect(page.locator(".hub-project-card")).not.toContainText(
    "Never commit partial",
  );
  await expect(page.locator(".hub-project-card")).toContainText(
    "Сборка не указана",
  );
  await expect(
    page.getByText("Каталог сохранён на компьютере", { exact: true }),
  ).toBeVisible();
});

test("cache revalidates source, version, IDs and bounded complete data without trusting build claims", async ({
  page,
}) => {
  await page.route(`${origin}/**`, (r) => r.fulfill({ status: 503 }));
  await page.goto("/");
  const result = await page.evaluate(
    async ({ origin, key, project }) => {
      const modulePath = "/src/hub/catalog-cache.ts";
      const { readCatalogCache, saveCatalogCache } = await import(modulePath);
      const snapshot = {
        projects: [
          {
            ...project,
            media: { cover: "", gallery: [] },
            windows: "available",
            buildEvidence: "approved-v2",
          },
        ],
        games: [{ id: "original", title: "Original title" }],
      };
      await saveCatalogCache(origin + "/", snapshot);
      const valid = await readCatalogCache(origin);
      const cache = JSON.parse(localStorage.getItem(key)!);
      const cases = [
        { ...cache, source: "https://foreign.invalid" },
        { ...cache, format: 2 },
        { ...cache, savedAt: Date.now() + 120000 },
        {
          ...cache,
          snapshot: {
            ...snapshot,
            projects: [...snapshot.projects, ...snapshot.projects],
          },
        },
        {
          ...cache,
          snapshot: {
            ...snapshot,
            projects: [{ ...snapshot.projects[0], id: "../escape" }],
          },
        },
        {
          ...cache,
          snapshot: {
            ...snapshot,
            projects: [{ ...snapshot.projects[0], kind: "invented" }],
          },
        },
      ];
      const rejected = [];
      for (const value of cases) {
        localStorage.setItem(key, JSON.stringify(value));
        rejected.push((await readCatalogCache(origin)) === null);
      }
      localStorage.setItem(key, "{");
      rejected.push((await readCatalogCache(origin)) === null);
      return {
        rejected,
        valid: valid?.map((p: any) => ({
          id: p.id,
          windows: p.windows,
          buildEvidence: p.buildEvidence,
        })),
      };
    },
    { origin, key, project },
  );
  expect(result.rejected).toEqual(Array(7).fill(true));
  expect(result.valid).toEqual([
    { id: "saved-project", windows: "unknown", buildEvidence: "unknown" },
  ]);
});
