import { test, expect } from "@playwright/test";

const origin = "https://port-catalog-cms.port-catalog-cms.workers.dev";
// Synthetic contract coverage only; no fixture is bundled or used as live CMS evidence.
const project = {
  id: "runtime",
  name: { en: "Runtime project", de: "Laufzeitprojekt" },
  kind: "compatibility-runtime",
  lifecycle: "active",
  gameIds: [],
  summary: { en: "English summary", de: "Deutsche Zusammenfassung" },
  description: { en: "English description", de: "Deutsche Beschreibung" },
  sourcePlatforms: ["PlayStation 4"],
  targetPlatforms: ["windows", "linux"],
  install: {
    steps: {
      en: ["Read upstream guide"],
      de: ["Anleitung des Entwicklers lesen"],
    },
    notes: { en: "Manual installation only" },
  },
  links: { github: "https://github.com/owner/runtime" },
};

test("German persists, runtime discovery and localized detail retain safe fallback", async ({
  page,
}) => {
  await page.route(`${origin}/v2/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({
      json:
        path === "/v2/projects"
          ? { schemaVersion: 2, items: [project], total: 1, nextCursor: null }
          : path === "/v2/games"
            ? { schemaVersion: 2, items: [], nextCursor: null }
            : path.endsWith("/builds")
              ? {
                  schemaVersion: 2,
                  projectId: "runtime",
                  channel: "all",
                  builds: [],
                }
              : { schemaVersion: 2, project, games: [], builds: [] },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await page.getByLabel("Язык интерфейса").selectOption("de");
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await page.reload();
  await page.getByRole("button", { name: "Katalog", exact: true }).click();
  await page
    .getByLabel("Technologie", { exact: true })
    .selectOption("compatibility-runtime");
  await page.getByLabel("Nach Spiel oder Projekt suchen").fill("Laufzeit");
  await expect(page.locator(".hub-project-card")).toHaveCount(1);
  await expect(page.locator(".hub-project-card")).toContainText(
    "Deutsche Beschreibung",
  );
  await page.locator(".hub-project-card").click();
  await expect(page.locator("h1")).toHaveText("Laufzeitprojekt");
  await expect(page.locator(".project-summary")).toHaveText(
    "Deutsche Beschreibung",
  );
  await expect(page.locator(".project-facts")).toContainText("Windows · Linux");
  await page.getByText("Anleitung", { exact: true }).last().click();
  await expect(
    page.getByText("Anleitung des Entwicklers lesen", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Manual installation only", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^(Installieren|Spielen|Starten)$/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: "Für Windows herunterladen",
      exact: true,
    }),
  ).toHaveCount(0);
  for (const size of [
    { width: 800, height: 600 },
    { width: 1280, height: 720 },
  ]) {
    await page.setViewportSize(size);
    expect(
      await page
        .locator("main")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
  }
});

test("localized text validates every locale, falls back, and cannot replace trusted fields", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { setLanguage } = await import(
      /* @vite-ignore */ ["/src/hub/i18n.ts"].join("")
    );
    const { parseSummary, parseBuilds, createV2Client } = await import(
      /* @vite-ignore */ ["/src/hub/api-v2.ts"].join("")
    );
    setLanguage("de");
    const summary = {
      id: "r",
      name: { en: "Fallback", de: null },
      gameIds: [],
      kind: "compatibility-runtime",
    };
    const rejected = (value: unknown) => {
      try {
        parseSummary(value);
        return false;
      } catch {
        return true;
      }
    };
    const client = createV2Client(
      "https://example.com",
      async () =>
        new Response(
          JSON.stringify({
            schemaVersion: 2,
            project: { ...summary, install: { notes: { ru: "Only notes" } } },
            games: [],
            builds: [],
          }),
          { headers: { "content-type": "application/json" } },
        ),
    );
    let localizedHashRejected = false;
    try {
      parseBuilds(
        [{ id: "b", projectId: "r", sha256: { de: "0".repeat(64) } }],
        "r",
      );
    } catch {
      localizedHashRejected = true;
    }
    return [
      parseSummary(summary).name,
      rejected({ ...summary, name: { en: "Good", fr: "\u0000" } }),
      rejected({ ...summary, id: { de: "evil" } }),
      rejected({ ...summary, name: { en: "Good", xx: "Unknown locale" } }),
      (await client.detail("r")).instructions.install.notes,
      localizedHashRejected,
    ];
  });
  expect(result).toEqual(["Fallback", true, true, true, "Only notes", true]);
});

test("notes-only instructions remain accessible", async ({ page }) => {
  await page.route(`${origin}/v2/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({
      json:
        path === "/v2/projects"
          ? { schemaVersion: 2, items: [project], total: 1, nextCursor: null }
          : path === "/v2/games"
            ? { schemaVersion: 2, items: [], nextCursor: null }
            : path.endsWith("/builds")
              ? {
                  schemaVersion: 2,
                  projectId: "runtime",
                  channel: "all",
                  builds: [],
                }
              : {
                  schemaVersion: 2,
                  project: {
                    ...project,
                    install: { notes: "Read official instructions" },
                    requirements: {
                      notes: "Requirements are being documented",
                    },
                  },
                  games: [],
                  builds: [],
                },
    });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: /Открыть проект Runtime project/ })
    .click();
  await page.locator("#project-install summary").click();
  await expect(
    page.getByText("Read official instructions", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Requirements are being documented", { exact: true }),
  ).toBeVisible();
});
