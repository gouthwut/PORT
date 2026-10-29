import { test, expect, type Page, type Route } from "@playwright/test";
import translations from "../src/hub/translations.json" with { type: "json" };
import { readFile } from "node:fs/promises";
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
  return { projects };
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
    const { compareVersions, newerDownload } = await import(
      /* @vite-ignore */ ["/src/hub/releases.ts"].join("")
    );
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

test("four languages persist and catalog path fits narrow and wide windows", async ({
  page,
}) => {
  await fixture(page);
  const names = ["Настройки", "Settings", "Ajustes", "Paramètres"];
  const catalogs = ["Каталог", "Catalog", "Catálogo", "Catalogue"];
  const downloads = ["Загрузки", "Downloads", "Descargas", "Téléchargements"];
  const langs = ["ru", "en", "es", "fr"];
  for (let i = 0; i < langs.length; i++) {
    await page
      .getByRole("button", { name: names[Math.max(0, i - 1)], exact: true })
      .click();
    await page
      .locator("select")
      .filter({ has: page.locator('option[value="fr"]') })
      .selectOption(langs[i]);
    await expect(page.locator("html")).toHaveAttribute("lang", langs[i]);
    await page.getByRole("button", { name: downloads[i], exact: true }).click();
    await expect(page.locator(".downloads-center h1")).toContainText(
      downloads[i],
    );
    await page.getByRole("button", { name: catalogs[i], exact: true }).click();
    await expect(page.locator(".hub-project-card")).toHaveCount(3);
    for (const [width, height] of [
      [1440, 960],
      [1024, 768],
      [800, 600],
      [480, 800],
      [320, 720],
    ]) {
      await page.setViewportSize({ width, height });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await page.screenshot({
      path: `.local/evidence/15/browser-catalog-${langs[i]}-320.png`,
      fullPage: true,
    });
    await page
      .locator(".hub-project-card")
      .filter({ hasText: "Zelda64Recomp" })
      .click();
    await expect(page.locator(".project-hero h1")).toHaveText("Zelda64Recomp");
    await page.keyboard.press("Escape");
    await expect(page.locator(".hub-catalog-intro h1")).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 960 });
  }
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(
    page.getByRole("button", { name: "Catalogue", exact: true }),
  ).toBeVisible();
});

test("each translated entry covers all three additional languages", async () => {
  for (const row of Object.values(translations)) {
    expect(row).toHaveLength(3);
    expect(row.every((text) => text.trim().length > 0)).toBe(true);
  }
  for (const file of [
    "App.tsx",
    "hub/HubCatalog.tsx",
    "hub/HubLanding.tsx",
    "hub/HubSidebar.tsx",
    "hub/ProjectCard.tsx",
    "hub/V2Project.tsx",
    "hub/DownloadsCenter.tsx",
    "hub/DownloadPanel.tsx",
    "hub/preferences.tsx",
    "components/TitleBar.tsx",
    "components/BloodborneMedia.tsx",
    "components/LauncherUpdates.tsx",
    "components/ui.tsx",
  ]) {
    const source = await readFile(`src/${file}`, "utf8");
    for (const match of source.matchAll(/\bt\(\s*("(?:[^"\\]|\\.)*")/gu))
      expect(
        Object.hasOwn(translations, JSON.parse(match[1])),
        `${file}: ${match[1]}`,
      ).toBe(true);
  }
});

test("catalog retains loaded projects offline and reconnects without legacy fallback", async ({
  page,
  context,
}) => {
  await fixture(page);
  const unavailable = (route: Route) => route.abort("internetdisconnected");
  await page.route(`${origin}/v2/**`, unavailable);
  await context.setOffline(true);
  await expect(page.locator(".offline-banner")).toContainText(
    "Нет подключения",
  );
  await page
    .getByRole("button", { name: "Обновить каталог", exact: true })
    .click();
  await expect(page.locator(".hub-catalog-error")).toContainText(
    "Последние данные сохранены",
  );
  await expect(page.locator(".hub-project-card")).toHaveCount(3);
  await page.unroute(`${origin}/v2/**`, unavailable);
  await context.setOffline(false);
  await expect(page.locator(".hub-catalog-error")).toHaveCount(0);
  await expect(page.locator(".hub-project-card")).toHaveCount(3);
});

test("renamed, unpublished and republished favorites keep stable IDs", async ({
  page,
}) => {
  const { projects } = await fixture(page);
  const original = { ...projects[0] };
  await page
    .locator(".project-card-wrapper")
    .first()
    .getByRole("button", { name: "В избранное", exact: true })
    .click();
  projects[0].name = "Renamed Zelda project";
  await page
    .getByRole("button", { name: "Обновить каталог", exact: true })
    .click();
  await expect(
    page
      .locator(".hub-project-card")
      .filter({ hasText: "Renamed Zelda project" }),
  ).toHaveCount(1);
  projects.splice(0, 1);
  await expect(
    page.getByRole("button", { name: "Обновить каталог", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Обновить каталог", exact: true })
    .click();
  await expect(page.locator(".hub-project-card")).toHaveCount(2);
  await page.getByRole("button", { name: "Избранное", exact: true }).click();
  await expect(page.locator(".hub-project-card")).toHaveCount(0);
  await expect(
    page.getByRole("heading", {
      name: "В избранном нет проектов текущего каталога",
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("port.hub.preferences.v1")!).favorites,
    ),
  ).toEqual([original.id]);
  projects.unshift({ ...original, name: "Republished Zelda project" });
  await expect(
    page.getByRole("button", { name: "Обновить каталог", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Обновить каталог", exact: true })
    .click();
  await expect(page.locator(".hub-project-card")).toHaveCount(1);
  await expect(page.locator(".hub-project-card")).toContainText(
    "Republished Zelda project",
  );
});

test("project update notice requires a provably older downloaded version", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const w = window as any;
    w.isTauri = true;
    w.qa15Version = "1.0.0";
    w.__TAURI_INTERNALS__ = {
      async invoke(command: string) {
        if (command === "load_settings")
          return {
            theme: "dark",
            language: "ru",
            installDir: "",
            reducedMotion: true,
            compactCards: false,
          };
        if (command === "load_hub_preferences")
          return { favorites: [], recent: [] };
        if (command === "hub_download_status")
          return {
            phase: "",
            name: "",
            completed: 0,
            total: null,
            speed: 0,
            message: "",
            path: null,
          };
        if (command === "hub_download_history")
          return [
            {
              id: "old",
              projectId: "zelda",
              buildId: "old-build",
              phase: "completed",
              version: localStorage.getItem("qa15.version") || w.qa15Version,
              arch: "x64",
              channel: "stable",
              name: "old.zip",
              path: "C:\\PORT\\old.zip",
              completed: 100,
              total: 100,
              speed: 0,
              message: "",
            },
          ];
        return null;
      },
    };
  });
  await fixture(page);
  await page
    .locator(".hub-project-card")
    .filter({ hasText: "Zelda64Recomp" })
    .click();
  await expect(page.locator(".project-update-note")).toContainText(
    "Доступна новая версия",
  );
  await page.evaluate(() =>
    localStorage.setItem("qa15.version", "release-ambiguous"),
  );
  await page.reload();
  await page.getByRole("button", { name: "Каталог", exact: true }).click();
  await page
    .locator(".hub-project-card")
    .filter({ hasText: "Zelda64Recomp" })
    .click();
  await expect(
    page.getByRole("button", { name: "Скачать для Windows", exact: true }),
  ).toBeEnabled();
  await expect(page.locator(".project-update-note")).toHaveCount(0);
});
