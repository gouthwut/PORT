// Explicit Stage 15 QA only: requires the existing debug identity and -NoDownloadDialog.
// Reads local CMS through its guarded IPC; never mutates CMS or executes the archive.
import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
const out = "C:/PORT/.local/evidence/15";
await fs.mkdir(out, { recursive: true });
const browser = await chromium.connectOverCDP("http://127.0.0.1:9238");
try {
  const page = browser
    .contexts()
    .flatMap((c) => c.pages())
    .find((p) => p.url().startsWith("http://127.0.0.1:1422/"));
  if (!page) throw Error("Stage 15 QA WebView not found");
  const call = (command, args = {}) =>
    page.evaluate(
      ({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args),
      { command, args },
    );
  expect(await call("plugin:app|identifier")).toBe("app.port.cms-qa");
  expect(await call("list_installations")).toEqual([]);
  const before = await call("load_settings");
  if (process.argv[2] === "restart") {
    const report = JSON.parse(
      await fs.readFile(`${out}/native-transfer.json`, "utf8"),
    );
    const rows = await call("hub_download_history");
    expect(rows.find((r) => r.id === report.status.id)).toMatchObject(
      report.status,
    );
    expect(await call("load_hub_preferences")).toEqual(report.preferences);
    expect(before.language).toBe("fr");
    await page
      .getByRole("button", { name: "Téléchargements", exact: true })
      .click();
    await expect(page.locator(".downloads-center")).toContainText(
      report.status.name,
    );
    await page.screenshot({
      path: `${out}/native-history-after-restart.png`,
      fullPage: true,
    });
    await call("open_hub_download_folder", { id: report.status.id });
    await call("remove_hub_download", { id: report.status.id });
    expect(
      createHash("sha256")
        .update(await fs.readFile(report.status.path))
        .digest("hex"),
    ).toBe(report.hash);
    await fs.writeFile(
      `${out}/native-restart.json`,
      JSON.stringify(
        {
          identity: "app.port.cms-qa",
          historyReopened: true,
          revealAfterRestart: true,
          preferencesReopened: true,
          language: before.language,
          removedRecordKeptFile: true,
        },
        null,
        2,
      ),
    );
    console.log(
      "Native cold restart: history, favorites, recents and language persisted; removing history kept archive bytes.",
    );
  } else {
    await call("save_settings", { settings: { ...before, language: "ru" } });
    await page.reload();
    await page.getByRole("button", { name: "Каталог", exact: true }).click();
    const card = page
      .locator(".project-card-wrapper")
      .filter({ hasText: "Zelda" });
    await expect(card).toHaveCount(1, { timeout: 30000 });
    const favorite = card.getByRole("button", {
      name: "В избранное",
      exact: true,
    });
    if (await favorite.count()) await favorite.click();
    await card.locator(".hub-project-card").click();
    await expect(
      page.getByRole("button", { name: "Скачать для Windows", exact: true }),
    ).toBeEnabled({ timeout: 30000 });
    await page.screenshot({ path: `${out}/native-zelda.png`, fullPage: true });
    const read = async (path) =>
      JSON.parse(
        new TextDecoder().decode(
          new Uint8Array(await call("local_cms_qa_fetch", { path })),
        ),
      );
    const builds = await read(
      "/v2/projects/zelda64-recompiled/builds?channel=all",
    );
    const build = builds.builds.find(
      (b) =>
        b.id ===
        "gh-6822e14d314b68f76e516128e6c28f6a974e7c93c33ed5007a4a1890bbfe921a",
    );
    expect(build).toMatchObject({
      availability: "available",
      os: "windows",
      size: 28940501,
      sha256:
        "d02b95f1cf5e4d44d6587fa6136c6db521f61aa41ba8700c05f91bea8b0a26d0",
    });
    const ids = {
      projectId: build.projectId,
      buildId: build.id,
      projectName: "Zelda64Recomp",
    };
    const waitPhase = (phase) =>
      expect
        .poll(async () => (await call("hub_download_status")).phase, {
          timeout: 60000,
          intervals: [100, 200, 500],
        })
        .toBe(phase);
    await call("start_hub_download", {
      projectId: "missing-stage15-qa",
      buildId: "missing-build",
    });
    await waitPhase("error");
    await page.getByRole("button", { name: "Загрузки", exact: true }).click();
    await page
      .locator(".download-history-row")
      .filter({ hasText: "missing-stage15-qa" })
      .first()
      .getByRole("button", { name: "Повторить" })
      .click();
    await waitPhase("error");
    const folders = new Set(
      await fs.readdir("C:/PORT/.local/cms-qa/downloads"),
    );
    await call("start_hub_download", ids);
    await expect
      .poll(async () => (await call("hub_download_status")).completed, {
        timeout: 60000,
        intervals: [50, 100],
      })
      .toBeGreaterThan(0);
    await call("cancel_hub_download");
    await waitPhase("cancelled");
    for (const folder of await fs.readdir("C:/PORT/.local/cms-qa/downloads"))
      if (!folders.has(folder))
        expect(
          await fs.readdir(`C:/PORT/.local/cms-qa/downloads/${folder}`),
        ).toEqual([]);
    await call("start_hub_download", { ...ids, repeat: true });
    await waitPhase("completed");
    const status = await call("hub_download_status");
    expect(status.path.startsWith("\\\\?\\C:\\PORT\\.local\\")).toBe(true);
    const bytes = await fs.readFile(status.path);
    expect(bytes.length).toBe(build.size);
    const hash = createHash("sha256").update(bytes).digest("hex");
    expect(hash).toBe(build.sha256);
    expect(
      (await call("hub_download_history")).find((r) => r.id === status.id),
    ).toMatchObject({
      version: build.version,
      phase: "completed",
      path: status.path,
    });
    expect(
      await call("start_hub_download", ids).then(() => "", String),
    ).toContain("уже скачан");
    await call("open_hub_download_folder", { id: status.id });
    await expect(
      page
        .locator(".download-history-row")
        .filter({ hasText: status.name })
        .first(),
    ).toContainText("Загрузка завершена");
    await page.screenshot({
      path: `${out}/native-downloads.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "Настройки", exact: true }).click();
    await page.getByLabel("Язык интерфейса").selectOption("fr");
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    expect((await call("load_settings")).language).toBe("fr");
    await page.screenshot({
      path: `${out}/native-settings-fr.png`,
      fullPage: true,
    });
    await fs.writeFile(
      `${out}/native-transfer.json`,
      JSON.stringify(
        {
          identity: "app.port.cms-qa",
          preferences: await call("load_hub_preferences"),
          status,
          hash,
          cancellationLeftNoPartOrFinal: true,
          missingBuildErrorAndRetry: true,
          duplicateRejected: true,
          revealIPC: true,
          note: "Existing local CMS metadata; actual official GitHub asset. No execution or extraction. Explicit QA picker bypass; interactive picker is separate.",
        },
        null,
        2,
      ),
    );
    console.log(
      JSON.stringify({
        phase: status.phase,
        bytes: bytes.length,
        hash,
        cancellation: "passed",
        reveal: "passed",
      }),
    );
  }
} finally {
  await browser.close();
}
