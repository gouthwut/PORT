// Actual release WebView/Rust IPC. Never renames/writes/deletes the primary installation.
// PORT_UPDATE_PKG selects the local read-only source; --interrupt also needs PORT_QA_PID.
import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
const mode = process.argv[2] || "--check";
const evidence = path.resolve(".local/evidence/04b");
await fs.mkdir(evidence, { recursive: true });
const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => /tauri\.localhost|tauri:\/\//.test(p.url()));
if (!page) throw Error("Native PORT WebView missing");
const call = (command, args = {}) =>
  page.evaluate(
    ({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args),
    { command, args },
  );
const baseline = JSON.parse(
  await fs.readFile(".local/stage03/native-installations.json", "utf8"),
)[0];
const pkg = process.env.PORT_UPDATE_PKG;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(test, timeout = 1200000) {
  const end = Date.now() + timeout;
  let last = 0;
  while (Date.now() < end) {
    const status = await call("install_status");
    if (test(status)) return status;
    if (Date.now() - last > 10000) {
      console.log(JSON.stringify(status));
      last = Date.now();
    }
    await pause(200);
  }
  throw Error("Operation timeout");
}
async function original() {
  expect(
    (await call("list_installations")).find((r) => r.id === baseline.id),
  ).toEqual(baseline);
  const bytes = await fs.readFile(
    path.join(baseline.root, "port-manifest.json"),
  );
  expect(crypto.createHash("sha256").update(bytes).digest("hex")).toBe(
    baseline.manifestSha256,
  );
}
try {
  await original();
  const before = await call("list_installations");
  if (
    ["--failures", "--cancel", "--interrupt", "--install"].includes(mode) &&
    !pkg
  )
    throw Error("PORT_UPDATE_PKG required");
  if (mode === "--failures" || mode === "--rejected") {
    const broken = path.resolve(".local/stage04b/broken.pkg");
    await fs.writeFile(broken, "broken");
    await call("update_installation", {
      id: baseline.id,
      path: mode === "--rejected" ? pkg : broken,
    });
    const result = await waitFor((s) => !s.active);
    expect(result.phase).toBe("error");
    if (mode === "--rejected") expect(result.message).toContain("SHA-256");
    await fs.writeFile(
      path.join(
        evidence,
        mode === "--rejected"
          ? "native-corrupt-hash.json"
          : "native-failures.json",
      ),
      JSON.stringify(result, null, 2),
    );
    expect(await call("list_installations")).toEqual(before);
  } else if (["--cancel", "--interrupt", "--install"].includes(mode)) {
    await call("update_installation", { id: baseline.id, path: pkg });
    if (mode !== "--install") {
      await waitFor((s) => s.phase === "copying" && s.completed > 1024 * 1024);
      if (mode === "--interrupt") {
        if (!process.env.PORT_QA_PID) throw Error("PORT_QA_PID required");
        await fs.writeFile(
          path.join(evidence, "native-interrupt.json"),
          JSON.stringify(
            { interruptedDuring: "copying", primaryRecord: baseline },
            null,
            2,
          ),
        );
        process.kill(Number(process.env.PORT_QA_PID));
        console.log(
          "PORT terminated during actual copy; startup recovery must be checked next.",
        );
      } else {
        await call("cancel_install");
        const result = await waitFor((s) => !s.active);
        expect(result.phase).toBe("cancelled");
        expect(await call("list_installations")).toEqual(before);
        await fs.writeFile(
          path.join(evidence, "native-cancel.json"),
          JSON.stringify(result, null, 2),
        );
      }
    } else {
      const result = await waitFor((s) => !s.active);
      await fs.writeFile(
        path.join(evidence, "native-install-result.json"),
        JSON.stringify(result, null, 2),
      );
      expect(result.phase).toBe("ready");
      const after = await call("list_installations");
      expect(after).toHaveLength(before.length + 1);
      const updated = after.find((r) => r.version === "01.09");
      expect(updated).toBeTruthy();
      const actual = await call("inspect_game_folder", {
        path: updated.dataPath,
      });
      expect(actual.version).toBe("01.09");
      await fs.writeFile(
        path.join(evidence, "native-updated-record.json"),
        JSON.stringify(updated, null, 2),
      );
      await original();
      await call("verify_installation", { id: baseline.id });
      await fs.writeFile(
        path.join(evidence, "native-primary-integrity.json"),
        JSON.stringify(
          { allPrimaryHashesVerified: true, unchangedRecord: baseline },
          null,
          2,
        ),
      );
    }
  } else {
    const dirs = await fs.readdir(path.dirname(baseline.root));
    expect(dirs.filter((d) => d.startsWith(".port-stage-"))).toEqual([]);
    await original();
    await page.getByRole("button", { name: "Библиотека", exact: true }).click();
    await page.screenshot({ path: path.join(evidence, "native-library.png") });
    const after = await call("list_installations");
    await fs.writeFile(
      path.join(evidence, "native-restart.json"),
      JSON.stringify(
        { records: after, noStaging: true, primaryUnchanged: true },
        null,
        2,
      ),
    );
    console.log(
      "Actual SQLite/native restart, recovery and primary record checks passed.",
    );
  }
} finally {
  await browser.close().catch(() => {});
}
