// Actual release Rust IPC. Never writes a catalog, draft, CMS or Bloodborne record.
import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
const dir = ".local/stage06";
const mode = process.argv[2] || "inspect";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
try {
  const page = browser
    .contexts()
    .flatMap((c) => c.pages())
    .find((p) => /tauri\.localhost|tauri:\/\//.test(p.url()));
  if (!page) throw Error("Actual native WebView missing");
  const call = (command, args = {}) =>
    page.evaluate(
      ({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args),
      { command, args },
    );
  const before = JSON.parse(await fs.readFile(`${dir}/before.json`, "utf8"));
  const protectedItem = JSON.parse(before.installations[0][1]);
  const items = await call("list_installations");
  expect(items.find((r) => r.collectionId === "bloodborne")).toEqual(
    protectedItem,
  );
  if (mode === "inspect") {
    const iso = await call("inspect_skate3_iso", {
      path: "C:\\skate3\\Skate_3.iso",
    });
    expect(iso.titleId).toBe("454108E6");
    expect(iso.files).toBe(101);
    const snapshot = await call("load_catalog");
    expect(snapshot.catalog.games.some((g) => g.id === "skate3")).toBe(false);
    await fs.writeFile(
      `${dir}/native-inspect.json`,
      JSON.stringify({ iso, catalog: snapshot.catalog }, null, 2),
    );
    console.log(iso);
  } else if (mode === "install") {
    expect(items.some((r) => r.collectionId === "skate3")).toBe(false);
    const plan = await call("check_install_destination", {
      parent: "C:\\skate3",
      bytes: 6396955444,
      adapterId: "skate3",
    });
    await fs.writeFile(`${dir}/native-plan.json`, JSON.stringify(plan));
    await call("install_skate3", {
      parent: "C:\\skate3",
      source: "C:\\skate3\\Skate_3.iso",
      destinationId: plan.id,
      desktopShortcut: true,
    });
    console.log("Actual native installation started", plan);
  } else if (mode === "status") {
    const status = await call("install_status");
    const installed = await call("list_installations");
    await fs.writeFile(
      `${dir}/native-status.json`,
      JSON.stringify({ status, installed }, null, 2),
    );
    console.log(
      status,
      installed.filter((r) => r.collectionId === "skate3"),
    );
  } else {
    const item = items.find((r) => r.collectionId === "skate3");
    if (!item) throw Error("No Skate installation");
    if (mode === "verify")
      console.log(await call("verify_installation", { id: item.id }));
    if (mode === "launch") {
      console.log(await call("launch_installation", { id: item.id }));
      await expect(
        call("launch_installation", { id: item.id }),
      ).rejects.toBeDefined();
      expect(await call("running_installations")).toContain(item.id);
      console.log("Duplicate launch guard passed");
    }
    if (mode === "library") {
      await page
        .getByRole("button", { name: "Библиотека", exact: true })
        .click();
      await expect(page.locator(".installed-card")).toHaveCount(2);
      await page
        .getByRole("button", { name: "Выбрать: Skate 3", exact: true })
        .click();
      await page.waitForTimeout(350);
      await page.screenshot({ path: `${dir}/native-library.png` });
      console.log(
        "Actual native library has original Bloodborne and installed Skate collection",
      );
    }
    if (mode === "explorer")
      console.log(await call("open_installation_folder", { id: item.id }));
  }
} finally {
  await browser.close();
}
