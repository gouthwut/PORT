// Release WebView/Rust IPC checks. Installation actions use a separately seeded,
// explicitly synthetic stage04d-fixture only; never launch/verify/remove the real game.
import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
const evidence = path.resolve(".local/evidence/04d");
const baseline = JSON.parse(
  await fs.readFile(path.join(evidence, "before.json"), "utf8"),
);
const original = JSON.parse(baseline.installations[0][1]);
const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
try {
  let page;
  await expect
    .poll(
      () => {
        page = browser
          .contexts()
          .flatMap((c) => c.pages())
          .find((p) => /tauri\.localhost|tauri:\/\//.test(p.url()));
        return !!page;
      },
      { timeout: 15000 },
    )
    .toBeTruthy();
  const call = (command, args = {}) =>
    page.evaluate(
      ({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args),
      { command, args },
    );
  const records = await call("list_installations");
  expect(records.find((r) => r.id === original.id)).toEqual(original);
  const mode = process.argv[2] || "--check";
  if (mode === "--final") {
    expect(records).toEqual([original]);
    await expect(
      call("check_install_destination", {
        parent: evidence,
        bytes: 1,
        id: original.id,
      }),
    ).rejects.toBeTruthy();
    expect(await call("running_installations")).toEqual([]);
    await page.getByRole("button", { name: "Библиотека", exact: true }).click();
    await page
      .getByRole("button", { name: "Выбрать: Bloodborne", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Играть", exact: true }),
    ).toBeEnabled();
    await page.screenshot({
      path: path.join(evidence, "native-final-library.png"),
    });
    const catalog = await call("load_catalog");
    expect(catalog.source).toBe("demo");
    await fs.writeFile(
      path.join(evidence, "native-final.json"),
      JSON.stringify(
        {
          originalExact: true,
          oneCard: true,
          playAvailable: true,
          catalogSource: catalog.source,
          noGameLaunch: true,
        },
        null,
        2,
      ),
    );
  } else if (mode === "--remove-fixture") {
    expect(records.find((r) => r.id === "404-1").collectionId).toBe(
      "stage04d-fixture",
    );
    await expect
      .poll(() => call("running_installations"), { timeout: 30000 })
      .not.toContain("404-1");
    const result = await call("remove_installation", {
      id: "404-1",
      confirmed: true,
    });
    expect(await call("list_installations")).toEqual([original]);
    expect(
      await fs.readFile(
        path.join(
          evidence,
          "fixture/PORT-Bloodborne-404-1/user-data/qa-launch-marker.txt",
        ),
        "utf8",
      ),
    ).toContain("FIXTURE ONLY");
    await fs.writeFile(
      path.join(evidence, "native-fixture-removal.json"),
      JSON.stringify(
        {
          originalExact: true,
          onlyFixtureRemoved: true,
          profileRetained: true,
          result,
        },
        null,
        2,
      ),
    );
  } else if (mode === "--running") {
    await expect
      .poll(() => call("running_installations"), { timeout: 45000 })
      .toContain("404-1");
    const marker = await fs.readFile(
      path.join(
        evidence,
        "fixture/PORT-Bloodborne-404-1/user-data/qa-launch-marker.txt",
      ),
      "utf8",
    );
    expect(marker).toContain("FIXTURE ONLY");
    expect(await call("list_installations")).toEqual(records);
    await fs.writeFile(
      path.join(
        evidence,
        `native-shortcut-${process.argv[3] || "launch"}.json`,
      ),
      JSON.stringify(
        {
          scope:
            "actual release shortcut entry + original harmless native fixture, no game code",
          runningFixture: true,
          marker,
          originalExact: true,
        },
        null,
        2,
      ),
    );
  } else {
    const dest = await call("check_install_destination", {
      parent: evidence,
      bytes: 1,
    });
    expect(dest.root).toBe(path.join(evidence, `PORT-Bloodborne-${dest.id}`));
    expect(dest.available).toBeGreaterThan(dest.required);
    const rejected = [];
    for (const args of [
      { parent: "C:\\Windows", bytes: 1 },
      { parent: "C:\\", bytes: 1 },
      { parent: "../relative", bytes: 1 },
      { parent: evidence, bytes: 9_000_000_000_000_000 },
      { parent: records.find((r) => r.id === "404-1").root, bytes: 1 },
    ]) {
      await expect(
        call("check_install_destination", args),
      ).rejects.toBeTruthy();
      rejected.push(args.parent);
    }
    await fs.mkdir(dest.root);
    await expect(
      call("check_install_destination", {
        parent: evidence,
        bytes: 1,
        id: dest.id,
      }),
    ).rejects.toBeTruthy();
    await fs.rmdir(dest.root);
    await expect(
      call("open_installation_folder", { id: "not-present" }),
    ).rejects.toBeTruthy();
    await page.getByRole("button", { name: "Библиотека", exact: true }).click();
    const card = page.getByRole("button", {
      name: "Выбрать: Bloodborne",
      exact: true,
    });
    await card.click({ button: "right" });
    await expect(
      page.getByRole("menuitem", { name: "Просмотреть локальные файлы" }),
    ).toBeVisible();
    await page.screenshot({
      path: path.join(evidence, "native-library-context.png"),
    });
    await page
      .getByRole("menuitem", { name: "Просмотреть локальные файлы" })
      .click();
    await expect(
      page.getByText("Папка установки открыта", { exact: true }),
    ).toBeVisible();
    expect(await call("list_installations")).toEqual(records);
    expect(await call("running_installations")).not.toContain(original.id);
    const catalog = await call("load_catalog");
    expect(catalog.endpoint).toBe("");
    await fs.writeFile(
      path.join(evidence, "native-checks.json"),
      JSON.stringify(
        {
          scope:
            "actual release Rust IPC, no original game install/launch/update/verify/remove",
          destination: dest,
          rejected,
          collisionRejected: true,
          contextMenu: true,
          explorerCommand: true,
          originalExact: true,
          catalogSource: catalog.source,
        },
        null,
        2,
      ),
    );
  }
  console.log("Native Stage 04D checks passed", mode);
} finally {
  await browser.close();
}
