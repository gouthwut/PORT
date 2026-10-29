import { createHash } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import fixture from "../fixtures/catalog/published-v1.json" with { type: "json" };
import endpoint from "../src/catalog-endpoint.json" with { type: "json" };

const origin = "https://port-catalog-cms.port-catalog-cms.workers.dev";
const summary = (id = "port-a") => ({
  id,
  name: `Project ${id}`,
  summary: null,
  gameIds: ["original"],
  kind: "recompilation",
  lifecycle: "active",
  sourcePlatforms: ["Xbox 360"],
  targetPlatforms: ["windows"],
  latestStable: "9.0",
  latestPrerelease: null,
  cover: null,
  rating: null,
  compatibility: { status: "insufficient_data", reports: 0 },
  users: null,
});
const build = (extra = {}) => ({
  id: "build-a",
  projectId: "port-a",
  version: "1.0",
  channel: "stable",
  os: "windows",
  arch: "x64",
  availability: "available",
  url: "https://github.com/owner/project/releases/download/v1/build.zip",
  ...extra,
});
const detail = () => ({
  schemaVersion: 2,
  project: {
    ...summary(),
    description: "Public description <script>unsafe()</script>",
    links: {
      github: "https://github.com/owner/project",
      website: null,
      releases: null,
    },
    requirements: {
      minimum: { os: "Windows 11" },
      recommended: null,
      notes: null,
      source: null,
    },
    install: { steps: ["Read the official guide"], notes: null },
    sourceRequirements: ["Owner's original files"],
    dependencies: [],
    knownIssues: [{ title: "Experimental", details: null }],
    legacy: { catalogId: "bloodborne", adapterId: "bloodborne" },
  },
  games: [{ id: "original", title: "Original Game" }],
  builds: [
    build(),
    build({ id: "proposed", review: "proposed", version: "DO NOT SHOW" }),
  ],
});
async function setup(
  page: Page,
  config: unknown = { version: "v2", baseUrl: origin, fallback: "none" },
) {
  await page.route(/\/src\/hub\/source-config\.json(?:\?.*)?$/, (r) =>
    r.fulfill({
      contentType: "application/javascript",
      body: `export default ${JSON.stringify(config)};`,
    }),
  );
  await page.addInitScript(
    (url) => localStorage.setItem("port.catalog.endpoint.v1", url),
    endpoint,
  );
  await page.route(endpoint, (r) =>
    r.fulfill({
      json: {
        ...fixture,
        games: fixture.games.map((g) => ({ ...g, media: { gallery: [] } })),
      },
    }),
  );
  await page.route(`${origin}/v2/**`, (r) => {
    const u = new URL(r.request().url());
    if (u.pathname === "/v2/projects")
      return r.fulfill({
        json: {
          schemaVersion: 2,
          items: [summary()],
          total: 1,
          nextCursor: null,
        },
      });
    if (u.pathname === "/v2/games")
      return r.fulfill({
        json: {
          schemaVersion: 2,
          items: [{ id: "original", title: "Original Game" }],
          nextCursor: null,
        },
      });
    return r.fulfill({ json: detail() });
  });
}
test("v2 client validates pages, filters, detail, builds, requirements and instructions", async ({
  page,
}) => {
  await setup(page);
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/v2/projects?")) requests.push(request.url());
  });
  await page.route(`${origin}/v2/projects/port-a/*`, (r) => {
    const u = new URL(r.request().url());
    requests.push(u.pathname + u.search);
    const d = detail();
    const body = u.pathname.endsWith("/builds")
      ? {
          channel: u.searchParams.get("channel"),
          builds: [
            build(),
            build({ id: "linux", os: "linux" }),
            build({ id: "beta", channel: "prerelease" }),
            build({ id: "revoked", review: "revoked" }),
          ],
        }
      : u.pathname.endsWith("/requirements")
        ? {
            requirements: d.project.requirements,
            dependencies: [],
            sourceRequirements: d.project.sourceRequirements,
          }
        : {
            install: d.project.install,
            knownIssues: [],
            sourceRequirements: d.project.sourceRequirements,
          };
    return r.fulfill({
      json: { schemaVersion: 2, projectId: "port-a", ...body },
    });
  });
  await page.goto("/");
  const result = await page.evaluate(async (origin) => {
    const apiPath = "/src/hub/api-v2.ts";
    const api = await import(apiPath);
    const client = api.createV2Client(origin);
    const p = await client.projects({
      q: "Port & game",
      platform: "windows",
      kind: "recompilation",
      lifecycle: "active",
      game: "original",
      sort: "updated",
      limit: 24,
      cursor: "24",
    });
    const d = await client.detail("port-a");
    return {
      p,
      d,
      b: await client.builds("port-a", "windows"),
      r: await client.requirements("port-a"),
      i: await client.instructions("port-a"),
    };
  }, origin);
  expect(result.p.items[0].name).toBe("Project port-a");
  expect(result.d.project.legacy).toBeNull();
  expect(result.d.project.windows).toBe("available");
  expect(result.d.builds).toHaveLength(1);
  expect(result.b.map((b: { id: string }) => b.id)).toEqual(["build-a"]);
  expect(result.r.requirements.minimum?.cpu).toBeNull();
  expect(result.i.install.steps).toEqual(["Read the official guide"]);
  expect(requests).toContain(
    "/v2/projects/port-a/builds?channel=stable&platform=windows",
  );
  const filtered = new URL(requests.find((r) => r.includes("sort=updated"))!);
  expect(Object.fromEntries(filtered.searchParams)).toEqual({
    q: "Port & game",
    platform: "windows",
    kind: "recompilation",
    lifecycle: "active",
    game: "original",
    sort: "updated",
    limit: "24",
    cursor: "24",
  });
});

test("v2 snapshot follows cursors atomically and retains game search/source filters", async ({
  page,
}) => {
  await setup(page);
  const queries: string[] = [];
  await page.route(`${origin}/v2/projects?*`, (r) => {
    const u = new URL(r.request().url());
    queries.push(u.search);
    const cursor = u.searchParams.get("cursor");
    return r.fulfill({
      json: {
        schemaVersion: 2,
        items: [summary(cursor ? "port-b" : "port-a")],
        total: 2,
        nextCursor: cursor ? null : "1",
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Каталог", exact: true }).click();
  await expect(page.locator(".hub-project-card")).toHaveCount(2);
  await page.getByLabel("Поиск по игре или проекту").fill("Original Game");
  await page
    .getByRole("combobox", { name: "Исходная платформа", exact: true })
    .selectOption("Xbox 360");
  await expect(page.locator(".hub-project-card")).toHaveCount(2);
  await expect(page.locator(".hub-project-card").first()).toContainText(
    "Сборка не указана",
  );
  await page.locator(".hub-project-card").first().click();
  await expect(
    page.getByRole("region", { name: "О проекте", exact: true }),
  ).toContainText("Public description <script>unsafe()</script>");
  await page.getByText("Инструкция", { exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Данные проекта v2" }),
  ).toContainText("Read the official guide");
  await expect(page.getByText("DO NOT SHOW")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Установить", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Назад в каталог" }).click();
  await expect(page.getByLabel("Поиск по игре или проекту")).toHaveValue(
    "Original Game",
  );
  expect(queries.some((q) => q.includes("cursor=1"))).toBeTruthy();
  expect(
    queries.every((q) => !q.includes("q=") && !q.includes("platform=")),
  ).toBeTruthy();
});

test("default v2 failure shows no v1 cards and retries without a fallback", async ({
  page,
}) => {
  await setup(page);
  await page.unroute(/\/src\/hub\/source-config\.json(?:\?.*)?$/);
  let failed = true;
  await page.route(`${origin}/v2/projects?*`, (r) =>
    failed
      ? r.fulfill({ status: 404, json: { error: "unavailable" } })
      : r.fulfill({
          json: {
            schemaVersion: 2,
            items: [summary()],
            total: 1,
            nextCursor: null,
          },
        }),
  );
  await page.goto("/");
  await expect(
    page.getByText("Каталог не удалось загрузить.", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".port-project")).toHaveCount(0);
  await page.getByRole("button", { name: "Каталог", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Не удалось загрузить каталог" }),
  ).toBeVisible();
  await expect(page.locator(".hub-project-card")).toHaveCount(0);
  failed = false;
  await page
    .getByRole("button", { name: "Обновить каталог", exact: true })
    .click();
  await expect(page.locator(".hub-project-card")).toHaveCount(1);
});

test("legacy source configuration cannot reopen old catalog scenarios", async ({
  page,
}) => {
  for (const config of [
    { version: "v1" },
    { version: "v2", baseUrl: origin, fallback: "v1" },
  ]) {
    await setup(page, config);
    await page.goto("/");
    await page.getByRole("button", { name: "Каталог", exact: true }).click();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "Не удалось загрузить каталог" }),
    ).toBeVisible();
    await expect(page.locator(".hub-project-card")).toHaveCount(0);
  }
});

test("invalid schemas, unsafe links, foreign identities and cursor loops fail closed", async ({
  page,
}) => {
  await setup(page, { version: "v1" });
  await page.goto("/");
  const results = await page.evaluate(
    async ({ origin, summary, detail }) => {
      const apiPath = "/src/hub/api-v2.ts";
      const api = await import(apiPath);
      const sourcePath = "/src/hub/catalog-source.ts";
      const source = await import(sourcePath);
      const rejected: boolean[] = [];
      async function rejects(f: () => unknown) {
        try {
          await f();
          rejected.push(false);
        } catch {
          rejected.push(true);
        }
      }
      const client = (value: unknown) =>
        api.createV2Client(
          origin,
          async () =>
            new Response(JSON.stringify(value), {
              headers: { "content-type": "application/json" },
            }),
        );
      await rejects(() =>
        api.parseSourceConfig({
          version: "v2",
          baseUrl: "http://localhost:8787",
          fallback: "v1",
        }),
      );
      await rejects(() =>
        api.parseSourceConfig({ version: "v2", baseUrl: origin }),
      );
      await rejects(() => client({ schemaVersion: 1 }).projects());
      await rejects(() =>
        client({
          schemaVersion: 2,
          items: [{ ...summary, kind: "guessed" }],
          total: 1,
          nextCursor: null,
        }).projects(),
      );
      await rejects(() =>
        client({
          ...detail,
          project: {
            ...detail.project,
            links: { github: "javascript:alert(1)" },
          },
        }).detail("port-a"),
      );
      await rejects(() =>
        client({
          ...detail,
          project: { ...detail.project, id: "other" },
        }).detail("port-a"),
      );
      await rejects(() =>
        client({
          schemaVersion: 2,
          projectId: "other",
          channel: "stable",
          builds: [],
        }).builds("port-a"),
      );
      await rejects(() =>
        api.loadV2Catalog({
          projects: async () => ({
            items: [summary],
            total: 2,
            nextCursor: "0",
          }),
          games: async () => ({ items: [], nextCursor: null }),
        }),
      );
      await rejects(() => client(detail).detail("../private"));
      let called = false;
      const v1 = await source.selectSource({ version: "v1" }, async () => {
        called = true;
        throw Error();
      });
      const fallback = await source.selectSource(
        { version: "v2", baseUrl: origin, fallback: "v1" },
        async () => {
          throw Error();
        },
      );
      await rejects(() =>
        source.selectSource(
          { version: "v2", baseUrl: origin, fallback: "none" },
          async () => {
            throw Error();
          },
        ),
      );
      return { rejected, called, v1, fallback };
    },
    { origin, summary: summary(), detail: detail() },
  );
  expect(results.rejected).toEqual(Array(10).fill(true));
  expect(results.called).toBe(false);
  expect(results.v1.version).toBe("v1");
  expect(results.fallback.version).toBe("v1");
  expect(results.fallback.projects).toEqual([]);
});

test("v2 media loads verified CMS covers/screenshots and reuses the memory cache", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/");
  const encoded = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 16;
    canvas.height = 16;
    canvas.getContext("2d")!.fillRect(0, 0, 16, 16);
    return canvas.toDataURL("image/webp").split(",")[1];
  });
  const bytes = Buffer.from(encoded, "base64");
  const url = `${origin}/media/${createHash("sha256").update(bytes).digest("hex")}.webp`;
  let downloads = 0;
  await page.route(`${origin}/media/**`, (r) => {
    downloads++;
    return r.fulfill({ contentType: "image/webp", body: bytes });
  });
  await page.route(`${origin}/v2/projects?*`, (r) =>
    r.fulfill({
      json: {
        schemaVersion: 2,
        items: [{ ...summary(), cover: url }],
        total: 1,
        nextCursor: null,
      },
    }),
  );
  await page.route(`${origin}/v2/projects/port-a`, (r) =>
    r.fulfill({
      json: {
        ...detail(),
        project: {
          ...detail().project,
          media: { cover: url, screenshots: [url] },
        },
      },
    }),
  );
  await page.reload();
  await page.getByRole("button", { name: "Каталог", exact: true }).click();
  const card = page.locator(".hub-project-card");
  await expect(card.locator("img")).toHaveAttribute(
    "src",
    /^data:image\/webp;base64,/,
  );
  await expect
    .poll(() =>
      card.locator("img").evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBe(16);
  await card.click();
  await expect(page.locator(".hub-project-overview img")).toHaveAttribute(
    "src",
    /^data:image\/webp;base64,/,
  );
  await page
    .getByRole("button", { name: "Открыть скриншот 1", exact: true })
    .click();
  await expect(page.getByRole("dialog").locator("img")).toHaveAttribute(
    "src",
    /^data:image\/webp;base64,/,
  );
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Назад в каталог" }).click();
  await expect(card.locator("img")).toBeVisible();
  expect(downloads).toBe(1);
});

for (const failure of [
  "missing",
  "http",
  "hash",
  "decode",
  "unsafe",
] as const) {
  test(`v2 media ${failure} uses placeholders without foreign requests`, async ({
    page,
  }) => {
    await setup(page);
    await page.goto("/");
    const body =
      failure === "decode"
        ? Buffer.alloc(30)
        : Buffer.from(
            await page.evaluate(() => {
              const c = document.createElement("canvas");
              c.width = 16;
              c.height = 16;
              return c.toDataURL("image/webp").split(",")[1];
            }),
            "base64",
          );
    if (failure === "decode") {
      body.write("RIFF");
      body.writeUInt32LE(22, 4);
      body.write("WEBPVP8X", 8);
    }
    const hash =
      failure === "decode"
        ? createHash("sha256").update(body).digest("hex")
        : "a".repeat(64);
    const url =
      failure === "unsafe"
        ? "https://example.org/media/" + "a".repeat(64) + ".webp"
        : failure === "missing"
          ? null
          : `${origin}/media/${hash}.webp`;
    const requests: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/media/")) requests.push(r.url());
    });
    await page.route("**/media/**", (r) =>
      failure === "http"
        ? r.fulfill({ status: 404 })
        : r.fulfill({ contentType: "image/webp", body }),
    );
    await page.route(`${origin}/v2/projects?*`, (r) =>
      r.fulfill({
        json: {
          schemaVersion: 2,
          items: [{ ...summary(), cover: url }],
          total: 1,
          nextCursor: null,
        },
      }),
    );
    await page.route(`${origin}/v2/projects/port-a`, (r) =>
      r.fulfill({
        json: {
          ...detail(),
          project: {
            ...detail().project,
            media: { cover: url, screenshots: url ? [url] : [] },
          },
        },
      }),
    );
    await page.reload();
    await page.getByRole("button", { name: "Каталог", exact: true }).click();
    await expect(page.locator(".hub-project-card")).toContainText(
      "Обложка недоступна",
    );
    await page.locator(".hub-project-card").click();
    await expect(
      page.getByRole("region", { name: "Данные проекта v2" }),
    ).toBeVisible();
    await expect(
      page.locator(".hub-project-overview .art-empty"),
    ).toContainText("Обложка недоступна");
    if (failure === "decode") {
      await expect(page.locator(".screenshot-grid .art-empty")).toContainText(
        "Изображение недоступно",
      );
      await page
        .getByRole("button", { name: "Открыть скриншот 1", exact: true })
        .click();
      await expect(
        page.getByRole("dialog").locator(".art-empty"),
      ).toBeVisible();
    } else {
      await expect(
        page.getByRole("heading", { name: "Скриншоты", exact: true }),
      ).toHaveCount(0);
    }
    if (failure === "unsafe" || failure === "missing")
      expect(requests).toEqual([]);
  });
}

test("v2 media accepts only the trusted immutable HTTPS path", async ({
  page,
}) => {
  await setup(page, { version: "v1" });
  await page.goto("/");
  const result = await page.evaluate(async (origin) => {
    const path = "/src/hub/v2-media.ts";
    const { parseV2Media } = await import(path);
    const url = `${origin}/media/${"a".repeat(64)}.webp`;
    return [
      url,
      url.replace("https:", "http:"),
      url + "?x=1",
      url + "#x",
      url.replace("/media/", "/other/"),
      url.replace("https://", "https://user@"),
      url.replace(".workers.dev", ".workers.dev.evil.com"),
      "http://localhost:8787/a.webp",
      "data:image/webp;base64,AAAA",
      "javascript:alert(1)",
    ].map((cover) => parseV2Media({ cover }));
  }, origin);
  expect(result[0].cover).toContain(origin + "/media/");
  expect(result.slice(1).every((m) => !m.cover && !m.gallery.length)).toBe(
    true,
  );
});

test("Stage 13A: Home → catalog → official project/releases preserves filters and has no legacy entry points", async ({
  page,
}) => {
  await setup(page);
  await page.unroute(/\/src\/hub\/source-config\.json(?:\?.*)?$/);
  const legacyRequests: string[] = [];
  page.on("request", (r) => {
    if (r.url() === endpoint) legacyRequests.push(r.url());
  });
  await page.route(`${origin}/v2/projects/port-a`, (r) => {
    const d = detail();
    d.builds = [
      build({ releaseUrl: "https://github.com/owner/project/releases/tag/v1" }),
    ];
    return r.fulfill({ json: d });
  });
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Основная навигация" });
  await expect(nav.getByRole("button")).toHaveCount(3);
  await expect(
    nav.getByRole("button", { name: "Загрузки", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".port-home")).toContainText("Original Game");
  await expect(page.locator(".port-home")).toContainText("Сборка не указана");
  await expect(page.locator(".port-home")).not.toContainText("PORT// HUB");
  await page.getByRole("button", { name: "Исследовать каталог" }).click();
  await page.getByLabel("Поиск по игре или проекту").fill("Original");
  await page
    .getByRole("combobox", { name: "Исходная платформа", exact: true })
    .selectOption("Xbox 360");
  await page
    .getByRole("combobox", { name: "Сортировка", exact: true })
    .selectOption("name-desc");
  const card = page.locator(".hub-project-card");
  await card.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("link", { name: "Проект на GitHub" }),
  ).toHaveAttribute("href", "https://github.com/owner/project");
  await expect(
    page.getByRole("link", { name: "Релиз 1.0", exact: true }),
  ).toHaveAttribute("href", "https://github.com/owner/project/releases/tag/v1");
  await expect(
    page.getByText("Owner's original files", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Установить|Импорт|Играть/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Скачать для Windows", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Назад в каталог" }).click();
  await expect(page.getByLabel("Поиск по игре или проекту")).toHaveValue(
    "Original",
  );
  await expect(
    page.getByRole("combobox", { name: "Исходная платформа", exact: true }),
  ).toHaveValue("Xbox 360");
  await expect(
    page.getByRole("combobox", { name: "Сортировка", exact: true }),
  ).toHaveValue("name-desc");
  await page.getByRole("button", { name: "Главная", exact: true }).click();
  await page
    .getByRole("button", { name: "Открыть проект Original Game", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Проект на GitHub" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await expect(page.getByRole("button", { name: "Выбрать папку" })).toHaveCount(
    0,
  );
  await expect(
    page.getByText("Источник каталога", { exact: true }),
  ).toHaveCount(0);
  expect(legacyRequests).toEqual([]);
});

test("Stage 13A: empty v2 and absent releases stay explicit, compatibility runtimes are excluded", async ({
  page,
}) => {
  await setup(page);
  let mode = "empty";
  await page.route(`${origin}/v2/projects?*`, (r) =>
    r.fulfill({
      json: {
        schemaVersion: 2,
        items:
          mode === "empty"
            ? []
            : [
                summary(),
                { ...summary("old-runtime"), kind: "compatibility-runtime" },
              ],
        total: mode === "empty" ? 0 : 2,
        nextCursor: null,
      },
    }),
  );
  await page.route(`${origin}/v2/projects/port-a`, (r) => {
    const d = detail();
    d.builds = [];
    return r.fulfill({ json: d });
  });
  await page.goto("/");
  await expect(
    page.getByText("Опубликованные проекты появятся здесь.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Каталог", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Каталог пока пуст" }),
  ).toBeVisible();
  mode = "projects";
  await page.getByRole("button", { name: "Обновить каталог" }).click();
  await expect(page.locator(".hub-project-card")).toHaveCount(1);
  await page.locator(".hub-project-card").click();
  await expect(
    page.getByText(
      "Одобренные сборки для Windows пока не опубликованы. Исходный код и новости — на странице проекта.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /Релиз/ })).toHaveCount(0);
});

test("Stage 13A: detail failure retries without displaying fabricated releases", async ({
  page,
}) => {
  await setup(page);
  let failed = true;
  await page.route(`${origin}/v2/projects/port-a`, (r) =>
    failed ? r.fulfill({ status: 503 }) : r.fulfill({ json: detail() }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Открыть проект Original Game", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Не удалось загрузить проект",
  );
  await expect(page.getByRole("link", { name: /Релиз/ })).toHaveCount(0);
  failed = false;
  await page.getByRole("button", { name: "Повторить", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Проект на GitHub" }),
  ).toBeVisible();
});
