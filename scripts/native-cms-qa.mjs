// Live native negative E2E: no mocked API, no asset download or execution.
import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
const out = "C:/PORT/.local/evidence/13e";
await fs.mkdir(out, { recursive: true });
const browser = await chromium.connectOverCDP("http://127.0.0.1:9238");
try {
  const page = browser
    .contexts()
    .flatMap((c) => c.pages())
    .find((p) => p.url() === "http://127.0.0.1:1420/");
  if (!page) throw Error("Missing QA WebView");
  const call = (command, args = {}) =>
    page.evaluate(
      ({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args),
      { command, args },
    );
  expect(await call("plugin:app|identifier")).toBe("app.port.cms-qa");
  expect(await call("list_installations")).toEqual([]);
  const read = async (path) =>
    JSON.parse(
      new TextDecoder().decode(
        new Uint8Array(await call("local_cms_qa_fetch", { path })),
      ),
    );
  expect(
    await call("local_cms_qa_fetch", { path: "/admin" }).then(() => "", String),
  ).toContain("allowed read-only path");
  const detail = await read("/v2/projects/zelda64-recompiled");
  const builds = await read(
    "/v2/projects/zelda64-recompiled/builds?channel=all",
  );
  const build = builds.builds.find(
    (b) =>
      b.id ===
      "gh-6822e14d314b68f76e516128e6c28f6a974e7c93c33ed5007a4a1890bbfe921a",
  );
  expect(build).toMatchObject({
    availability: "unknown",
    os: "windows",
    version: "v1.2.2",
    size: 28940501,
    sha256: "d02b95f1cf5e4d44d6587fa6136c6db521f61aa41ba8700c05f91bea8b0a26d0",
  });
  await page.getByRole("button", { name: "Каталог", exact: true }).click();
  const card = page
    .locator(".hub-project-card")
    .filter({ hasText: "The Legend of Zelda: Majora's Mask" });
  await expect(card).toHaveCount(1, { timeout: 30000 });
  await expect
    .poll(() =>
      card
        .locator("img")
        .evaluateAll(
          (imgs) =>
            imgs.length === 1 &&
            imgs.every((i) => i.complete && i.naturalWidth > 0),
        ),
    )
    .toBe(true);
  await card.click();
  const section = page.getByRole("region", { name: "Данные проекта v2" });
  await expect(section).toContainText("v1.2.2 · windows", { timeout: 30000 });
  await expect(section).toContainText("Доступность не указана");
  await expect(
    section.getByRole("button", { name: "Скачать файл" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("link", { name: "Проект на GitHub" }),
  ).toHaveAttribute("href", "https://github.com/Zelda64Recomp/Zelda64Recomp");
  await expect.poll(() => page.locator(".screenshot-grid img").count()).toBe(4);
  await expect
    .poll(() =>
      page
        .locator(".detail-banner img, .screenshot-grid img")
        .evaluateAll(
          (imgs) =>
            imgs.length === 5 &&
            imgs.every(
              (i) =>
                i.complete &&
                i.naturalWidth > 0 &&
                i.src.startsWith("data:image/webp;base64,"),
            ),
        ),
    )
    .toBe(true);
  // Direct IPC proves that bypassing the disabled UI cannot bypass CMS availability.
  await call("start_hub_download", {
    projectId: "zelda64-recompiled",
    buildId: build.id,
  });
  await expect
    .poll(async () => (await call("hub_download_status")).phase, {
      timeout: 20000,
    })
    .toBe("error");
  const status = await call("hub_download_status");
  expect(status.message).toBe(
    "Одобренная доступная Windows-сборка не подтверждена",
  );
  expect(status.completed).toBe(0);
  expect(
    await call("open_hub_download_folder").then(() => "", String),
  ).toContain("Нет завершённой загрузки");
  await page.screenshot({ path: `${out}/native-project.png`, fullPage: true });
  const report = {
    identity: "app.port.cms-qa",
    source: "https://localhost:8787",
    liveNative: true,
    project: detail.project.id,
    build,
    images: "cover + 4 screenshots decoded after shared SHA-256/WebP checks",
    githubLink: detail.project.links.github,
    adminPathRejected: true,
    status,
    folderRejected: true,
    liveAssetTransfer: "BLOCKED: availability unknown; no GitHub ZIP request",
  };
  await fs.writeFile(`${out}/native.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
