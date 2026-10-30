// Run only against the separate app.port.shortcut-qa release build and copied DB.
// Never registers, updates, launches or removes a real game.
import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
const out = path.resolve(".local/evidence/shortcuts");
const receipts = path.join(
  process.env.APPDATA,
  "app.port.shortcut-qa/shortcuts",
);
const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
const hash = (b) => crypto.createHash("sha256").update(b).digest("hex");
try {
  const page = browser
    .contexts()
    .flatMap((c) => c.pages())
    .find((p) => /tauri\.localhost|tauri:\/\//.test(p.url()));
  if (!page) throw Error("Native WebView unavailable");
  const call = (command, args = {}) =>
    page.evaluate(
      ({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args),
      { command, args },
    );
  const records = await call("list_installations");
  expect(records.find((r) => r.collectionId === "skate3").id).toBe("600-1");
  const snapshot = await call("load_catalog");
  const report = [];
  await page.getByRole("button", { name: "Библиотека", exact: true }).click();
  const ps = path.join(
    process.env.SystemRoot,
    "System32/WindowsPowerShell/v1.0/powershell.exe",
  );
  for (const collection of ["bloodborne", "skate3"]) {
    const item = records.find((r) => r.collectionId === collection);
    const name = collection === "bloodborne" ? "Bloodborne" : "Skate 3";
    const card = page.getByRole("button", {
      name: "Выбрать: " + name,
      exact: true,
    });
    const make = async () => {
      await card.focus();
      await page.keyboard.press("Shift+F10");
      await page
        .getByRole("menuitem", { name: "Создать/восстановить ярлык" })
        .click();
    };
    await make();
    await expect(
      page.getByRole("status").filter({ hasText: "Ярлык создан:" }),
    ).toBeVisible();
    const receipt = JSON.parse(
      await fs.readFile(path.join(receipts, item.id + ".json"), "utf8"),
    );
    expect(path.basename(receipt.path)).toBe(name + ".lnk");
    const bytes = await fs.readFile(receipt.path);
    expect(hash(bytes)).toBe(receipt.sha256);
    const read = JSON.parse(
      execFileSync(
        ps,
        [
          "-NoLogo",
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "[Console]::OutputEncoding=[Text.UTF8Encoding]::new();$l=(New-Object -ComObject WScript.Shell).CreateShortcut($env:PORT_QA_LINK);@{target=$l.TargetPath;args=$l.Arguments;icon=$l.IconLocation}|ConvertTo-Json -Compress",
        ],
        {
          windowsHide: true,
          encoding: "utf8",
          env: { ...process.env, PORT_QA_LINK: receipt.path },
        },
      ),
    );
    expect(read.target.toLowerCase()).toBe(
      path.join(out, "port-shortcut-qa.exe").toLowerCase(),
    );
    expect(read.args).toBe("--launch-installation " + item.id);
    const metadata = [...snapshot.catalog.games, ...snapshot.known].find(
      (g) => g.collectionId === collection,
    );
    const hasArt = ["cover", "hero", "banner"].some(
      (key) => snapshot.images[metadata?.media[key]?.sha256],
    );
    if (hasArt) {
      expect(read.icon).toMatch(/\.ico,0$/);
      const ico = await fs.readFile(read.icon.slice(0, -2));
      expect([...ico.subarray(0, 6)]).toEqual([0, 0, 1, 0, 4, 0]);
    } else
      expect(read.icon.toLowerCase()).toBe(read.target.toLowerCase() + ",0");
    await make();
    await expect(
      page.getByRole("status").filter({ hasText: "Ярлык создан:" }),
    ).toBeVisible();
    const updated = JSON.parse(
      await fs.readFile(path.join(receipts, item.id + ".json"), "utf8"),
    );
    expect(hash(await fs.readFile(updated.path))).toBe(updated.sha256);
    // Exercise deleted-link recovery and a concrete modified-file error through real IPC.
    await fs.unlink(updated.path);
    await make();
    await expect
      .poll(async () => {
        try {
          return (await fs.stat(updated.path)).size > 0;
        } catch {
          return false;
        }
      })
      .toBeTruthy();
    const restored = JSON.parse(
      await fs.readFile(path.join(receipts, item.id + ".json"), "utf8"),
    );
    const saved = await fs.readFile(restored.path);
    await fs.writeFile(restored.path, "manual QA link");
    await make();
    await expect(page.getByRole("alert")).toContainText(
      "Ярлык изменён пользователем",
    );
    expect(await fs.readFile(restored.path, "utf8")).toBe("manual QA link");
    await page.screenshot({
      path: path.join(out, "native-" + collection + "-conflict.png"),
    });
    await fs.writeFile(restored.path, saved);
    expect(hash(await fs.readFile(restored.path))).toBe(restored.sha256);
    await fs.unlink(restored.path);
    await fs.unlink(path.join(receipts, item.id + ".json"));
    report.push({
      collection,
      name,
      read,
      menu: true,
      repeated: true,
      deletedRecovery: true,
      modifiedPreserved: true,
      qaShortcutCleaned: true,
    });
  }
  try {
    await call("create_installation_shortcut", { id: "999-1" });
    throw Error("unexpected success");
  } catch (e) {
    expect(String(e)).toContain("не найдена");
  }
  try {
    await call("create_installation_shortcut", { id: "1-2 --evil" });
    throw Error("unexpected success");
  } catch (e) {
    expect(String(e)).toContain("Недопустимый ID");
  }
  expect(await call("list_installations")).toEqual(records);
  await fs.writeFile(
    path.join(out, "native-results.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(
    "Actual native QA menu: both games, validated CMS ICO/fallback, strict IDs, restoration, concrete collision errors, Desktop cleanup pass",
  );
} finally {
  await browser.close();
}
