import { test } from "node:test";
import assert from "node:assert/strict";
import { stripTypeScriptTypes } from "node:module";
import { readFile } from "node:fs/promises";

test("opt-in only: no requests disabled, minimal events, withdrawal aborts requests, no retry", async () => {
  const source = (await readFile("src/services/analytics.ts", "utf8")).replace(
    /^import \{ native \} from ["']\.\/settings["'];/m,
    "const native = true;",
  );
  const result = stripTypeScriptTypes(source);
  const calls = [],
    original = globalThis.fetch;
  globalThis.fetch = (url, options) => {
    calls.push({ url, ...options });
    return new Promise((_, reject) =>
      options.signal.addEventListener("abort", () =>
        reject(new Error("aborted")),
      ),
    );
  };
  try {
    const mod = await import(
      "data:text/javascript;base64," + Buffer.from(result).toString("base64")
    );
    mod.usageEvent("app_open");
    mod.usageEvent("project_view", "demo");
    assert.equal(calls.length, 0);
    mod.setAnalyticsConsent(false);
    assert.equal(calls.length, 0);
    mod.setAnalyticsConsent(true);
    assert.equal(calls.length, 1);
    assert.deepEqual(JSON.parse(calls[0].body), {
      event: "app_open",
      consent: true,
    });
    mod.usageEvent("project_view", "demo");
    mod.usageEvent("download_started", "demo");
    mod.usageEvent("download_completed", "demo");
    assert.equal(calls.length, 4);
    assert.ok(
      calls.every(
        (c) => c.credentials === "omit" && c.referrerPolicy === "no-referrer",
      ),
    );
    assert.ok(
      calls
        .slice(1)
        .every(
          (c) =>
            Object.keys(JSON.parse(c.body)).sort().join(",") ===
            "consent,event,projectId",
        ),
    );
    mod.setAnalyticsConsent(false);
    assert.ok(calls.every((c) => c.signal.aborted));
    mod.usageEvent("app_open");
    mod.usageEvent("download_completed", "demo");
    assert.equal(calls.length, 4);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(calls.length, 4);
  } finally {
    globalThis.fetch = original;
  }
});
