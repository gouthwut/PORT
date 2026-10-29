import { createHash } from "node:crypto";
import type { Page } from "@playwright/test";

// Labelled synthetic media and CMS responses. These are not upstream metadata or art.
export async function project14Fixture(
  page: Page,
  sonic = false,
  wide = false,
) {
  const origin = "https://port-catalog-cms.port-catalog-cms.workers.dev";
  const name = sonic ? "Sonic Unleashed Recompiled" : "Zelda 64: Recompiled";
  const project = {
    id: "stage14b-project",
    name,
    summary:
      "Детерминированная QA-фикстура страницы проекта. Не сведения о совместимости.",
    description:
      "Детерминированная QA-фикстура страницы проекта. Не сведения о совместимости.",
    gameIds: ["stage14b-game"],
    kind: "recompilation",
    lifecycle: "active",
    sourcePlatforms: [sonic ? "Xbox 360" : "Nintendo 64"],
    targetPlatforms: ["windows", "linux"],
    developers: ["QA-команда (тестовые данные)"],
    links: { github: "https://github.com/owner/project" },
    media: { cover: "", screenshots: [] as string[] },
    requirements: { minimum: { os: "Windows (QA)", memory: "8 ГБ (QA)" } },
    install: {
      steps: ["Тестовая инструкция: прочитайте руководство проекта."],
    },
  };
  const build = {
    id: "stage14b-build",
    projectId: project.id,
    version: "1.2.2-QA",
    os: "windows",
    arch: "x64",
    channel: "stable",
    availability: "available",
    size: 28940501,
    url: "https://github.com/owner/project/releases/download/v1/qa.zip",
    changelog:
      "ТЕСТОВЫЙ CHANGELOG\n" +
      "Проверка длинного описания релиза.\n".repeat(60),
  };
  const images = new Map<string, Buffer>();
  const games = [{ id: "stage14b-game", title: name }];
  await page.route(`${origin}/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith("/media/"))
      return route.fulfill({
        contentType: "image/webp",
        body: images.get(path)!,
      });
    return route.fulfill({
      json:
        path === "/v2/projects"
          ? { schemaVersion: 2, items: [project], total: 1, nextCursor: null }
          : path === "/v2/games"
            ? { schemaVersion: 2, items: games, nextCursor: null }
            : { schemaVersion: 2, project, games, builds: [build] },
    });
  });
  await page.goto("http://127.0.0.1:1420/");
  const base64 = await page.evaluate(
    ({ name, sonic, wide }) =>
      Array.from({ length: 4 }, (_, i) => {
        const canvas = document.createElement("canvas");
        canvas.width = wide ? 1600 : 1280;
        canvas.height = 720;
        const ctx = canvas.getContext("2d")!;
        const gradient = ctx.createLinearGradient(0, 0, 1280, 720);
        gradient.addColorStop(0, sonic ? "#124067" : "#29463e");
        gradient.addColorStop(1, "#5d417d");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 1280, 720);
        ctx.fillStyle = "#ffffff";
        ctx.font = "32px sans-serif";
        ctx.fillText("QA · ТЕСТОВОЕ ИЗОБРАЖЕНИЕ", 60, 100);
        ctx.font = "48px sans-serif";
        ctx.fillText(name, 60, 190);
        ctx.fillText(String(i + 1).padStart(2, "0"), 1100, 620);
        return canvas.toDataURL("image/webp").split(",")[1];
      }),
    { name, sonic, wide },
  );
  for (const encoded of base64) {
    const bytes = Buffer.from(encoded, "base64");
    const path = `/media/${createHash("sha256").update(bytes).digest("hex")}.webp`;
    images.set(path, bytes);
    project.media.screenshots.push(origin + path);
  }
  project.media.cover = project.media.screenshots[0];
  await page.reload();
  await page.getByRole("button", { name: "Каталог", exact: true }).click();
  await page.locator(".hub-project-card").click();
  return { project, build, name };
}
