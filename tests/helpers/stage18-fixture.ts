import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";

// Synthetic responses for UI tests only. Never imported by src/ or used as live CMS evidence.
export const origin = "https://port-catalog-cms.port-catalog-cms.workers.dev";

function loadAsset(name: string): Buffer {
  const p = path.resolve(
    process.cwd(),
    ".local/design-exploration/17a/assets",
    name,
  );
  if (fs.existsSync(p)) {
    return fs.readFileSync(p);
  }
  return Buffer.from(
    "UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==",
    "base64",
  );
}

export async function stage18Fixture(page: Page) {
  const assets: Record<string, Buffer> = {
    "sonic-cover": loadAsset("sonic-cover-0.webp"),
    "sonic-s0": loadAsset("sonic-screens-0.webp"),
    "sonic-s1": loadAsset("sonic-screens-1.webp"),
    "sonic-s2": loadAsset("sonic-screens-2.webp"),
    "sonic-s3": loadAsset("sonic-screens-3.webp"),
    "zelda-cover": loadAsset("zelda-cover-0.webp"),
    "zelda-s0": loadAsset("zelda-screens-0.webp"),
    "zelda-s1": loadAsset("zelda-screens-1.webp"),
    "zelda-s2": loadAsset("zelda-screens-2.webp"),
    "zelda-s3": loadAsset("zelda-screens-3.webp"),
  };

  const images = new Map<string, Buffer>();
  const urlFor = (key: string) => {
    const buf = assets[key] || assets["sonic-cover"];
    const hash = createHash("sha256").update(buf).digest("hex");
    const p = `/media/${hash}.webp`;
    images.set(p, buf);
    return `${origin}${p}`;
  };

  const sonicProject = {
    id: "sonic-unleashed-recomp",
    name: "Sonic Unleashed Recompiled",
    summary:
      "Неофициальная ПК-рекомпиляция Sonic Unleashed, основанная на версии для Xbox 360. Для запуска требуются собственные игровые файлы.",
    description:
      "Синтетическая QA-фикстура Sonic для проверки композиции. Версии, размеры и требования ниже — тестовые данные.",
    gameIds: ["sonic-unleashed"],
    kind: "recompilation",
    lifecycle: "active",
    sourcePlatforms: ["Xbox 360"],
    targetPlatforms: ["windows", "linux"],
    developers: ["hedge-dev"],
    windows: "available",
    buildEvidence: "verified-release",
    cover: urlFor("sonic-cover"),
    links: { github: "https://github.com/hedge-dev/UnleashedRecomp" },
    media: {
      cover: urlFor("sonic-cover"),
      screenshots: [
        urlFor("sonic-s0"),
        urlFor("sonic-s1"),
        urlFor("sonic-s2"),
        urlFor("sonic-s3"),
      ],
    },
  };

  const zeldaProject = {
    id: "zelda-64-recompiled",
    name: "Zelda 64: Recompiled",
    summary:
      "Static recompilation of Majora's Mask (and soon Ocarina of Time) for PC (Windows/Linux/Mac)",
    description:
      "Синтетическая QA-фикстура Zelda для проверки композиции. Версии, размеры и требования ниже — тестовые данные.",
    gameIds: ["zelda-majoras-mask"],
    kind: "recompilation",
    lifecycle: "active",
    sourcePlatforms: ["Nintendo 64"],
    targetPlatforms: ["windows", "linux", "macos"],
    developers: ["Zelda64Recomp"],
    windows: "available",
    buildEvidence: "verified-release",
    cover: urlFor("zelda-cover"),
    links: { github: "https://github.com/Zelda64Recomp/Zelda64Recomp" },
    media: {
      cover: urlFor("zelda-cover"),
      screenshots: [
        urlFor("zelda-s0"),
        urlFor("zelda-s1"),
        urlFor("zelda-s2"),
        urlFor("zelda-s3"),
      ],
    },
  };

  const games = [
    { id: "sonic-unleashed", title: "Sonic Unleashed" },
    { id: "zelda-majoras-mask", title: "The Legend of Zelda: Majora's Mask" },
  ];

  const sonicBuild = {
    id: "build-sonic-1",
    projectId: sonicProject.id,
    version: "1.0.0-SONIC-QA",
    os: "windows",
    arch: "x64",
    channel: "stable",
    availability: "available",
    size: 45892010,
    url: "https://github.com/hedge-dev/UnleashedRecomp/releases/download/v1.1.0/UnleashedRecomp-Windows.zip",
    changelog: "QA · тестовый changelog Sonic.",
  };

  const zeldaBuild = {
    id: "build-zelda-1",
    projectId: zeldaProject.id,
    version: "1.0.0-ZELDA-QA",
    os: "windows",
    arch: "x64",
    channel: "stable",
    availability: "available",
    size: 24501230,
    url: "https://github.com/Zelda64Recomp/Zelda64Recomp/releases/download/v1.2.0/Zelda64Recomp-Win.zip",
    changelog: "QA · тестовый changelog Zelda.",
  };

  await page.route(`${origin}/**`, (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path.startsWith("/media/")) {
      const buf = images.get(path);
      if (buf) {
        return route.fulfill({
          contentType: "image/webp",
          body: buf,
        });
      }
      return route.fulfill({ status: 404 });
    }

    if (path === "/v2/projects") {
      return route.fulfill({
        json: {
          schemaVersion: 2,
          items: [sonicProject, zeldaProject],
          total: 2,
          nextCursor: null,
        },
      });
    }

    if (path === "/v2/games") {
      return route.fulfill({
        json: {
          schemaVersion: 2,
          items: games,
          nextCursor: null,
        },
      });
    }

    if (path.includes("sonic-unleashed-recomp")) {
      return route.fulfill({
        json: {
          schemaVersion: 2,
          project: sonicProject,
          games: [games[0]],
          builds: [sonicBuild],
        },
      });
    }

    if (path.includes("zelda-64-recompiled")) {
      return route.fulfill({
        json: {
          schemaVersion: 2,
          project: zeldaProject,
          games: [games[1]],
          builds: [zeldaBuild],
        },
      });
    }

    return route.fulfill({
      status: 404,
    });
  });

  await page.goto("http://127.0.0.1:1420/");
  await page.evaluate(() => {
    const badge = document.createElement("div");
    badge.textContent = "QA FIXTURE · SYNTHETIC METADATA";
    badge.style.cssText =
      "position:fixed;bottom:4px;right:4px;z-index:10000;background:#141828;color:white;padding:4px 8px;font-size:11px;pointer-events:none";
    document.body.append(badge);
  });
  return {
    sonicProject,
    zeldaProject,
    sonicBuild,
    zeldaBuild,
    games,
  };
}
