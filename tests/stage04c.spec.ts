import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import fixture from "../fixtures/catalog/published-v1.json" with { type: "json" };

const endpoint = "https://catalog.port-qa.com/v1/catalog.json";
const card = () => ({
  ...structuredClone(fixture.games[0]),
  id: "qa-coast",
  collectionId: "qa-coast",
  title: "Coast · QA fixture",
  description:
    "Local QA fixture. <script>alert('never')</script>\nPlain text only.",
  adapterId: "future-adapter",
  tags: ["QA"],
  media: { gallery: [] } as any,
});

test("published cards sync, image cache survives offline restart, refresh and invalid responses preserve last catalog", async ({
  page,
  context,
}) => {
  await page.goto("/");
  const encoded = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 640;
    c.height = 360;
    const x = c.getContext("2d")!;
    x.fillStyle = "#263b47";
    x.fillRect(0, 0, 640, 360);
    x.fillStyle = "#d8effa";
    x.font = "32px sans-serif";
    x.fillText("PORT / ORIGINAL QA IMAGE", 30, 180);
    return c.toDataURL("image/webp").split(",")[1];
  });
  const image = Buffer.from(encoded, "base64"),
    hash = createHash("sha256").update(image).digest("hex");
  let current: any = {
    ...structuredClone(fixture),
    revision: "qa-1",
    games: [card()],
  };
  current.games[0].media = {
    cover: { url: "https://catalog.port-qa.com/cover.webp", sha256: hash },
    banner: { url: "https://catalog.port-qa.com/cover.webp", sha256: hash },
    hero: { url: "https://catalog.port-qa.com/cover.webp", sha256: hash },
    gallery: [{ url: "https://catalog.port-qa.com/cover.webp", sha256: hash }],
  };
  let bad: string | null = null,
    imageRequests = 0,
    unavailable = false;
  await page.route("https://catalog.port-qa.com/**", async (route) => {
    if (unavailable) {
      await route.abort("internetdisconnected");
      return;
    }
    if (route.request().url().endsWith(".webp")) {
      imageRequests++;
      await route.fulfill({
        status: 200,
        contentType: "image/webp",
        body: image,
      });
    } else
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: bad ?? JSON.stringify(current),
      });
  });
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await page
    .getByText("Для разработчиков · онлайн-каталог", { exact: true })
    .click();
  await page.getByLabel("HTTPS API каталога").fill(endpoint);
  await page
    .getByRole("button", { name: "Сохранить и синхронизировать" })
    .click();
  await expect(
    page.getByText("Каталог обновлён", { exact: true }),
  ).toBeVisible();
  expect(imageRequests).toBe(1);
  await page.getByRole("button", { name: "Каталог", exact: true }).click();
  await page
    .getByRole("button", { name: "Подробнее: Coast · QA fixture" })
    .click();
  await expect(page.getByText(/Установка недоступна: поддержка/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Установить", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".catalog-description")).toContainText(
    "<script>alert('never')</script>",
  );
  await expect(
    page.getByRole("heading", { name: "Системные требования" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Открыть скриншот 1", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Coast · QA fixture");
  await page.keyboard.press("Escape");
  await page.screenshot({
    path: ".local/evidence/04c/browser-dynamic-details.png",
  });
  unavailable = true;
  await context.setOffline(true);
  await page.getByRole("button", { name: "Каталог", exact: true }).click();
  await page.getByRole("button", { name: "Обновить каталог" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Не удалось обновить каталог",
  );
  await context.setOffline(false);
  // Dev assets still need localhost; block only the API for the cold-cache check.
  await page.reload();
  await page.getByRole("button", { name: "Каталог", exact: true }).click();
  // Home and catalog both contain the published card. Wait for the destination
  // page, not a shared card on the outgoing AnimatePresence screen.
  await expect(
    page.getByRole("heading", { name: "Каталог.", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Подробнее: Coast · QA fixture" }),
  ).toBeVisible();
  await expect(page.locator(".hub-project-card img")).toHaveAttribute(
    "src",
    /^data:image\/webp;base64,/,
  );
  expect(imageRequests).toBe(1);
  await expect(
    page.getByText("Каталог сохранён на компьютере", { exact: true }),
  ).toBeVisible();
  unavailable = false;
  await expect(
    page.getByRole("button", { name: "Обновить каталог" }),
  ).toBeEnabled();
  const original = await page.evaluate(() =>
    localStorage.getItem("port.catalog.cache.v1"),
  );
  await page.setViewportSize({ width: 480, height: 850 });
  await expect
    .poll(() =>
      page.locator("main").evaluate((e) => e.scrollWidth <= e.clientWidth),
    )
    .toBeTruthy();
  await page.screenshot({
    path: ".local/evidence/04c/browser-catalog-mobile.png",
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const raw of [
    "{",
    JSON.stringify({ ...current, games: [{ ...card(), status: "draft" }] }),
    JSON.stringify({
      ...current,
      games: [
        {
          ...card(),
          project: { ...card().project, github: "javascript:alert(1)" },
        },
      ],
    }),
    JSON.stringify({ ...current, games: [{ ...card(), command: "calc.exe" }] }),
    JSON.stringify({
      ...current,
      games: [
        {
          ...card(),
          media: {
            gallery: [],
            cover: { url: "https://127.0.0.1/a.webp", sha256: hash },
          },
        },
      ],
    }),
    " ".repeat(1024 * 1024 + 1),
  ]) {
    bad = raw;
    await page.getByRole("button", { name: "Обновить каталог" }).click();
    await expect(page.getByRole("alert")).toContainText(
      "Не удалось обновить каталог",
    );
    expect(
      await page.evaluate(() => localStorage.getItem("port.catalog.cache.v1")),
    ).toBe(original);
    await expect(
      page.getByRole("button", { name: "Подробнее: Coast · QA fixture" }),
    ).toBeVisible();
  }
  bad = null;
  current = { ...current, revision: "qa-2", games: [] };
  await page.getByRole("button", { name: "Обновить каталог" }).click();
  await expect(
    page.getByRole("button", { name: "Подробнее: Coast · QA fixture" }),
  ).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Каталог", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Подробнее: Coast · QA fixture" }),
  ).toHaveCount(0);
});

test("invalid image hash/type stays a placeholder and corrupt cache cannot supply executable metadata", async ({
  page,
}) => {
  let unavailable = false;
  const game = card();
  game.media = {
    gallery: [],
    cover: {
      url: "https://catalog.port-qa.com/bad.webp",
      sha256: "a".repeat(64),
    },
  };
  await page.addInitScript(
    (endpoint) => localStorage.setItem("port.catalog.endpoint.v1", endpoint),
    endpoint,
  );
  await page.route("https://catalog.port-qa.com/**", async (route) => {
    if (unavailable) {
      await route.abort();
      return;
    }
    if (route.request().url().endsWith(".webp"))
      await route.fulfill({
        contentType: "image/webp",
        body: "<svg onload='alert(1)'/>",
      });
    else
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ ...fixture, games: [game] }),
      });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Каталог", exact: true }).click();
  await expect(page.getByText(/Недоступно изображений: 1/)).toBeVisible();
  await expect(page.locator(".hub-project-card img")).toHaveCount(0);
  const snap = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("port.catalog.cache.v1")!),
  );
  expect(snap.images).toEqual({});
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("port.catalog.cache.v1")!);
    s.catalog.games[0].command = "calc.exe";
    localStorage.setItem("port.catalog.cache.v1", JSON.stringify(s));
  });
  unavailable = true;
  await page.reload();
  await page.getByRole("button", { name: "Каталог", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Подробнее: Coast · QA fixture" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Каталог ещё не загружен", { exact: true }),
  ).toBeVisible();
});

test("removed publication retains actual library IPC identity and Play, unknown adapter never invokes installer", async ({
  page,
}) => {
  await page.addInitScript(
    ({ fixture, endpoint }) => {
      let snapshot = {
        endpoint,
        catalog: fixture,
        images: {},
        known: fixture.games,
        syncedAt: 1,
        source: "cache",
        warning: "",
      };
      const item = {
        id: "original-1.09",
        collectionId: "bloodborne",
        root: "C:/QA",
        runtimePath: "C:/QA/runtime",
        dataPath: "C:/QA/game",
        version: "01.09",
        manifestSha256: "QA",
      };
      const calls: string[] = [];
      Object.assign(window, {
        isTauri: true,
        qaCatalog: {
          remove: () => {
            snapshot = { ...snapshot, catalog: { ...fixture, games: [] } };
          },
          calls,
          item,
        },
        __TAURI_INTERNALS__: {
          invoke: async (command: string, args: any) => {
            if (command === "take_launch_request") return null;
            calls.push(command);
            if (command === "load_catalog" || command === "sync_catalog")
              return structuredClone(snapshot);
            if (command === "load_settings")
              return {
                theme: "dark",
                installDir: "",
                reducedMotion: true,
                compactCards: false,
              };
            if (command === "load_media")
              return { cover: "", banner: "", hero: "", gallery: [] };
            if (command === "list_installations") return [item];
            if (command === "running_installations") return [];
            if (command === "install_status")
              return {
                phase: "idle",
                active: false,
                completed: 0,
                total: 0,
                message: "",
              };
            if (command === "launch_installation") {
              if (args.id !== item.id) throw Error("Changed identity");
              return "QA launch only";
            }
            throw Error(command);
          },
        },
      });
    },
    { fixture, endpoint },
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Каталог", exact: true }).click();
  await page.getByRole("button", { name: "Подробнее: Bloodborne" }).click();
  await page.evaluate(() => (window as any).qaCatalog.remove());
  // Refresh through the settings screen; library is independent from remote metadata.
  await page.getByRole("button", { name: "Каталог", exact: true }).click();
  await page.getByRole("button", { name: "Обновить каталог" }).click();
  await expect(
    page.getByRole("button", { name: "Подробнее: Bloodborne" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Библиотека", exact: true }).click();
  await page.getByRole("button", { name: "Выбрать: Bloodborne" }).click();
  await page.getByRole("button", { name: "Играть", exact: true }).click();
  expect(
    await page.evaluate(() =>
      (window as any).qaCatalog.calls.filter((c: string) =>
        /install_packages|import_game_folder|update_installation|remove_installation/.test(
          c,
        ),
      ),
    ),
  ).toEqual([]);
  expect(
    await page.evaluate(() => (window as any).qaCatalog.item.version),
  ).toBe("01.09");
  await page.screenshot({
    path: ".local/evidence/04c/browser-removed-publication-library-mocked.png",
  });
});

test("shared schema, URL policy, unsupported adapter and endpoint configuration stay bounded", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async (fixture) => {
    const path = "/src/services/catalog.ts";
    const { parseCatalog, publicHttps, supportsInstall } = await import(path);
    const badUrls = [
      "http://github.com/a/b",
      "https://localhost/a",
      "https://127.0.0.1/a",
      "https://[::1]/a",
      "https://u:p@example.com/a",
      "https://example.com:444/a",
      "file:///C:/x",
      "https://api.local/a",
      "https://example.com/a#x",
    ];
    return {
      urls: badUrls.every((u) => {
        try {
          publicHttps(u);
          return false;
        } catch {
          return true;
        }
      }),
      supported: supportsInstall(fixture.games[0]),
      foreign: supportsInstall({ ...fixture.games[0], id: "foreign" }),
      duplicate: (() => {
        try {
          parseCatalog(
            JSON.stringify({
              ...fixture,
              games: [fixture.games[0], fixture.games[0]],
            }),
          );
          return false;
        } catch {
          return true;
        }
      })(),
    };
  }, fixture);
  expect(result).toEqual({
    urls: true,
    supported: true,
    foreign: false,
    duplicate: true,
  });
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await page
    .getByText("Для разработчиков · онлайн-каталог", { exact: true })
    .click();
  await page.getByLabel("HTTPS API каталога").fill("http://localhost/api");
  await page
    .getByRole("button", { name: "Сохранить и синхронизировать" })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Не удалось обновить каталог",
  );
  expect(
    await page.evaluate(() => localStorage.getItem("port.catalog.endpoint.v1")),
  ).toBeNull();
  await page.setViewportSize({ width: 480, height: 850 });
  await expect
    .poll(() =>
      page.locator("main").evaluate((e) => e.scrollWidth <= e.clientWidth),
    )
    .toBeTruthy();
});
