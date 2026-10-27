// Final native restart/cache/duplicate-guard/integrity evidence. Keeps the live game open.
import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => /tauri\.localhost|tauri:\/\//.test(p.url()));
if (!page) throw Error("No actual native PORT");
const call = (command, args = {}) =>
  page.evaluate(
    ({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args),
    { command, args },
  );
try {
  const earlier = JSON.parse(
    await fs.readFile(
      path.resolve(".local/stage03/native-installations.json"),
      "utf8",
    ),
  )[0];
  const records = await call("list_installations");
  expect(records).toHaveLength(1);
  expect(records[0].id).toBe(earlier.id);
  expect(records[0].version).toBe("01.00");
  let refused = false;
  try {
    await call("launch_installation", { id: earlier.id });
  } catch (e) {
    refused = /уже работает/.test(String(e));
  }
  expect(refused).toBe(true);
  await call("start_download");
  await expect
    .poll(async () => (await call("download_status")).active, {
      timeout: 60000,
    })
    .toBe(false);
  expect((await call("download_status")).phase).toBe("ready");
  await page.getByRole("button", { name: "Библиотека", exact: true }).click();
  await page
    .getByRole("button", { name: "Проверить целостность", exact: true })
    .click();
  await expect(
    page.getByText("SHA-256 всех установленных файлов совпадает", {
      exact: false,
    }),
  ).toBeVisible({ timeout: 10 * 60 * 1000 });
  const cover = page.locator(".library-cover img");
  await expect
    .poll(() => cover.evaluate((e) => e.complete && e.naturalWidth > 0))
    .toBeTruthy();
  await page.screenshot({
    path: path.resolve(".local/evidence/03-native-final-restart-integrity.png"),
  });
  const packages = [];
  for (const [file, expected] of [
    [
      "Bloodborne.Game.of.the.Year.Edition.PS4-PRELUDE.pkg",
      "3fffae55334e25a579e45c8515401d7fd3a652208e287a30dc344ccbe5416f18",
    ],
    [
      "CUSA03173-EUR-Update-v1.09-PRELUDE-[PS4ID].pkg",
      "956fde8aaf0c609a21b24f9a5c5772aa6c93c5f909be5a2149f07a941f147351",
    ],
  ]) {
    const p = path.join("C:\\Bloodborne_GOTY_Patch_PKGS", file);
    const handle = await fs.open(p, "r");
    let header = Buffer.alloc(0x5a0);
    let stat;
    try {
      await handle.read(header, 0, header.length, 0);
      stat = await handle.stat();
    } finally {
      await handle.close();
    }
    const digest = createHash("sha256").update(header).digest("hex");
    expect(digest).toBe(expected);
    packages.push({
      file,
      bytes: stat.size,
      mtime: stat.mtime.toISOString(),
      boundedHeaderSha256: digest,
    });
  }
  await fs.writeFile(
    path.resolve(".local/stage03/final-result.json"),
    JSON.stringify(
      {
        record: records[0],
        sqliteAfterProcessRestart: true,
        duplicateLaunchRefused: true,
        cachedRuntimeVerifiedWithUnavailableProxyEnvironment: true,
        primaryFullIntegrity: true,
        mainMenuConfirmedBy: "user in conversation",
        inWorldGameplayConfirmed: false,
        packages,
        fullPkgPayloadHash: false,
      },
      null,
      2,
    ),
  );
  console.log(
    "Final native SQLite restart, already-running guard, cached runtime, actual UI full integrity and unchanged bounded PKG headers passed. Main menu was confirmed by the user; live game preserved.",
  );
} finally {
  await browser.close();
}
