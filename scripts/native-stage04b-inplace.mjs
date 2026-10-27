// Actual native/Rust QA for in-place update and one-time consolidation of Stage 04B copies.
// PORT_UPDATE_PKG is always a read-only input. No SQLite rows are edited by this script.
import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
const mode = process.argv[2] || "--check";
const evidence = path.resolve(".local/evidence/04b/inplace");
await fs.mkdir(evidence, { recursive: true });
const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => /tauri\.localhost|tauri:\/\//.test(p.url()));
if (!page) throw Error("Actual PORT WebView missing");
const call = (command, args = {}) =>
  page.evaluate(
    ({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args),
    { command, args },
  );
const historical = JSON.parse(
  await fs.readFile(".local/stage03/native-installations.json", "utf8"),
)[0];
async function hashFile(file) {
  const h = crypto.createHash("sha256");
  for await (const chunk of createReadStream(file)) h.update(chunk);
  return h.digest("hex");
}
async function tree(root) {
  const found = {};
  let count = 0,
    total = 0;
  async function walk(dir, prefix = "", depth = 0) {
    if (depth > 32) throw Error("Profile depth");
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      if (++count > 100000 || e.isSymbolicLink())
        throw Error("Profile count/link");
      const file = path.join(dir, e.name),
        name = prefix + e.name;
      if (e.isDirectory()) await walk(file, name + "/", depth + 1);
      else if (e.isFile()) {
        const size = (await fs.stat(file)).size;
        total += size;
        if (total > 128 * 1024 ** 3) throw Error("Profile size");
        found[name] = { size, sha256: await hashFile(file) };
      } else throw Error("Profile special file");
    }
  }
  await walk(root);
  return found;
}
async function waitDone() {
  const until = Date.now() + 20 * 60 * 1000;
  let last = 0;
  while (Date.now() < until) {
    const s = await call("install_status");
    if (!s.active) return s;
    if (Date.now() - last > 10000) {
      console.log(JSON.stringify(s));
      last = Date.now();
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw Error("Update timeout; leave PORT to recover its own journal");
}
try {
  const rows = await call("list_installations");
  const primary = rows.find((r) => r.id === historical.id);
  expect(primary).toBeTruthy();
  if (mode === "--check") {
    expect(rows).toHaveLength(1);
    expect(primary.version).toBe("01.09");
    expect(primary.root).toBe(historical.root);
    expect(primary.dataPath).toBe(historical.dataPath);
    const actual = await call("inspect_game_folder", {
      path: primary.dataPath,
    });
    expect(actual.version).toBe("01.09");
    await page.getByRole("button", { name: "Библиотека", exact: true }).click();
    await expect(page.locator(".installed-card")).toHaveCount(1);
    await page.getByRole("button", { name: "Выбрать: Bloodborne" }).click();
    await expect(
      page.getByRole("button", { name: "Установить обновление", exact: true }),
    ).toHaveCount(0);
    await page.screenshot({
      path: path.join(evidence, "native-one-installation.png"),
    });
    await fs.writeFile(
      path.join(evidence, "native-restart.json"),
      JSON.stringify({ record: primary, actual, singleRecord: true }, null, 2),
    );
    console.log(
      "One persisted installation: original identity/path, actual 01.09, native library verified.",
    );
  } else {
    expect(primary).toEqual(historical);
    const separate = rows.find(
      (r) => r.id !== primary.id && r.version === "01.09",
    );
    expect(separate).toBeTruthy();
    expect(await call("running_installations")).toEqual([]);
    if (!process.env.PORT_UPDATE_PKG) throw Error("PORT_UPDATE_PKG required");
    let sourceProfile, oldProfile, expectedManifest;
    if (mode === "--merge") {
      sourceProfile = await tree(path.join(separate.root, "user-data"));
      oldProfile = await tree(path.join(primary.root, "user-data"));
      expectedManifest = JSON.parse(
        await fs.readFile(
          path.join(separate.root, "port-manifest.json"),
          "utf8",
        ),
      );
      await fs.writeFile(
        path.join(evidence, "profiles-before.json"),
        JSON.stringify({ sourceProfile, oldProfile }, null, 2),
      );
    }
    let pkg = process.env.PORT_UPDATE_PKG;
    if (mode === "--failures") {
      pkg = path.resolve(".local/stage04b/inplace-broken.pkg");
      await fs.writeFile(pkg, "broken");
    }
    await call("update_installation", {
      id: primary.id,
      path: pkg,
      updatedId: separate.id,
    });
    if (mode === "--cancel") await call("cancel_install");
    const result = await waitDone();
    await fs.writeFile(
      path.join(evidence, mode.slice(2) + "-result.json"),
      JSON.stringify(result, null, 2),
    );
    if (mode !== "--merge") {
      expect(result.phase).toBe(mode === "--cancel" ? "cancelled" : "error");
      expect(await call("list_installations")).toEqual(rows);
      expect(
        await hashFile(path.join(primary.root, "port-manifest.json")),
      ).toBe(primary.manifestSha256);
    } else {
      expect(result.phase).toBe("ready");
      const after = await call("list_installations");
      expect(after).toHaveLength(1);
      const updated = after[0];
      expect({
        ...updated,
        version: primary.version,
        manifestSha256: primary.manifestSha256,
      }).toEqual(primary);
      expect(updated.version).toBe("01.09");
      const actual = await call("inspect_game_folder", {
        path: updated.dataPath,
      });
      expect(actual.version).toBe("01.09");
      const current = JSON.parse(
        await fs.readFile(
          path.join(updated.root, "port-manifest.json"),
          "utf8",
        ),
      );
      const entries = (m) =>
        Object.fromEntries(
          m.files.map((e) => [e.path, { size: e.size, sha256: e.sha256 }]),
        );
      expect(entries(current)).toEqual(entries(expectedManifest));
      expect(await tree(path.join(primary.root, "user-data"))).toEqual(
        sourceProfile,
      );
      expect(
        await tree(path.join(primary.root, ".port-profile-before-1.09")),
      ).toEqual(oldProfile);
      expect(await tree(path.join(separate.root, "user-data"))).toEqual(
        sourceProfile,
      );
      expect(
        await fs.stat(path.join(separate.dataPath, "eboot.bin")).then(
          () => true,
          () => false,
        ),
      ).toBe(false);
      await call("verify_installation", { id: updated.id });
      await fs.writeFile(
        path.join(evidence, "native-merge-verified.json"),
        JSON.stringify(
          {
            updated,
            actual,
            sameIdentityAndPaths: true,
            oneRecord: true,
            allHashesVerified: true,
            newProgressCopied: true,
            oldProfileBackedUp: true,
            separateProfileRetained: true,
            separateGameRemoved: true,
            profileFiles: Object.keys(sourceProfile).length,
          },
          null,
          2,
        ),
      );
      console.log(
        "Actual in-place 1.09, all hashes, single original record, new progress and old profile backup verified.",
      );
    }
  }
} finally {
  await browser.close();
}
