import { test, expect, type Page } from "@playwright/test";
const origin = "https://port-catalog-cms.port-catalog-cms.workers.dev";
async function fixture(page: Page) {
  const projects = [
    {
      id: "zelda",
      name: "Zelda64Recomp",
      gameIds: ["zelda-game"],
      kind: "recompilation",
      sourcePlatforms: ["Nintendo 64"],
    },
    {
      id: "sonic",
      name: "Sonic Unleashed Recompiled",
      gameIds: ["sonic-game"],
      kind: "recompilation",
      sourcePlatforms: ["Xbox 360"],
    },
    {
      id: "source",
      name: "Source only",
      gameIds: [],
      kind: "native-port",
      sourcePlatforms: ["Nintendo 64"],
    },
  ].map((p) => ({ ...p, targetPlatforms: ["windows"], lifecycle: "active" }));
  const games = [
    { id: "zelda-game", title: "The Legend of Zelda" },
    { id: "sonic-game", title: "Sonic Unleashed" },
  ];
  const builds = (id: string) =>
    id === "source"
      ? []
      : [
          {
            id: `${id}-build`,
            projectId: id,
            version: "1.2.3",
            os: "windows",
            arch: "x64",
            channel: "stable",
            availability: "available",
            url: `https://github.com/owner/${id}/releases/download/v1/build.zip`,
            size: 100,
          },
        ];
  await page.route(`${origin}/v2/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    const id = path.split("/")[3];
    return route.fulfill({
      json:
        path === "/v2/projects"
          ? {
              schemaVersion: 2,
              items: projects,
              total: projects.length,
              nextCursor: null,
            }
          : path === "/v2/games"
            ? { schemaVersion: 2, items: games, nextCursor: null }
            : path.endsWith("/builds")
              ? {
                  schemaVersion: 2,
                  projectId: id,
                  channel: "all",
                  builds: builds(id),
                }
              : {
                  schemaVersion: 2,
                  project: projects.find((p) => p.id === id),
                  games: games.filter((g) =>
                    projects.find((p) => p.id === id)?.gameIds.includes(g.id),
                  ),
                  builds: builds(id),
                },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Каталог", exact: true }).click();
  await expect(page.locator(".hub-project-card")).toHaveCount(3);
}
test("favorites and recent IDs survive reload and resolve current catalog names", async ({
  page,
}) => {
  await fixture(page);
  const card = page
    .locator(".project-card-wrapper")
    .filter({ hasText: "Zelda64Recomp" });
  await card.getByRole("button", { name: "В избранное", exact: true }).click();
  await card.locator(".hub-project-card").click();
  await expect(
    page.getByRole("button", { name: "Убрать из избранного" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Недавно просмотренные" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Каталог", exact: true }).click();
  await page.getByRole("button", { name: "Избранное", exact: true }).click();
  await expect(page.locator(".hub-project-card")).toHaveCount(1);
  await expect(page.locator(".hub-project-card")).toContainText(
    "Zelda64Recomp",
  );
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("port.hub.preferences.v1")!),
  );
  expect(saved).toEqual({ favorites: ["zelda"], recent: ["zelda"] });
});
test("discovery combines original title, console, kind and actual available asset", async ({
  page,
}) => {
  await fixture(page);
  await page.getByRole("button", { name: "Доступны", exact: true }).click();
  await expect(page.locator(".hub-project-card")).toHaveCount(2);
  await page
    .getByLabel("Исходная платформа", { exact: true })
    .selectOption("Nintendo 64");
  await page
    .getByLabel("Технология", { exact: true })
    .selectOption("recompilation");
  await page.getByLabel("Поиск по игре или проекту").fill("legend");
  await expect(page.locator(".hub-project-card")).toHaveCount(1);
  await page.getByLabel("Поиск по игре или проекту").fill("no result");
  await expect(
    page.getByRole("heading", { name: "Ничего не найдено" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Сбросить фильтры" }).first().click();
  await expect(page.locator(".hub-project-card")).toHaveCount(3);
  await page
    .locator(".hub-project-card")
    .filter({ hasText: "Source only" })
    .click();
  await expect(
    page.getByRole("button", { name: "Скачать для Windows", exact: true }),
  ).toHaveCount(0);
});

test("version ordering never guesses dates, prereleases or architectures", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { compareVersions, newerDownload } =
      await import("/src/hub/releases.ts");
    const build = {
      id: "new",
      projectId: "p",
      version: "1.3.0",
      os: "windows",
      arch: "x64",
      channel: "stable",
      availability: "available",
      url: "https://github.com/o/r/releases/download/v1/file.zip",
    } as any;
    const row = {
      phase: "completed",
      projectId: "p",
      arch: "x64",
      channel: "stable",
      version: "1.2.0",
    } as any;
    return [
      compareVersions("v1.3.0", "1.2"),
      compareVersions("1.2", "1.2.0"),
      compareVersions("2026-10-29", "1.0"),
      compareVersions("1.3-beta", "1.2"),
      newerDownload(build, [row]),
      newerDownload(build, [row, { ...row, version: "1.3.0" }]),
      newerDownload(build, [{ ...row, arch: "arm64" }]),
      newerDownload(build, [{ ...row, version: "release-x" }]),
    ];
  });
  expect(result).toEqual([1, 0, null, null, true, false, false, false]);
});
