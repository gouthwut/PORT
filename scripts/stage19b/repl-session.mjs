// Load from node_repl after resetting its kernel to avoid stale native UIA indexes.
globalThis.sky = (await import("@oai/sky")).sky;
globalThis.fs = await import("node:fs/promises");
globalThis.req = (await import("node:module")).createRequire(
  "C:/PORT/package.json",
);
globalThis.pw = req("@playwright/test");
globalThis.browser = await pw.chromium.connectOverCDP("http://127.0.0.1:9240");
globalThis.page = browser.contexts()[0].pages()[0];
page.setDefaultTimeout(5000);
globalThis.call = (command, args = {}) =>
  page.evaluate(
    ({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args),
    { command, args },
  );
globalThis.appwin = (await sky.list_windows()).find((w) =>
  w.app.includes("stage19b"),
);
globalThis.out = "C:/PORT/.local/evidence/stage19b";
globalThis.pick = async (folder, label) => {
  let state = await sky.get_window_state({
    window: appwin,
    include_screenshot: false,
    include_text: true,
  });
  const field = Number(
    state.accessibility.tree.match(/(\d+) edit[^\n]*Folder:/)[1],
  );
  await sky.set_value({ window: appwin, element_index: field, value: folder });
  state = await sky.get_window_state({
    window: appwin,
    include_screenshot: true,
    include_text: true,
  });
  await fs.writeFile(
    `${out}/${label}-picker.png`,
    Buffer.from(state.screenshots.at(-1).url.split(",")[1], "base64"),
  );
  const button = Number(
    state.accessibility.tree.match(/(\d+) button Select Folder/)[1],
  );
  await sky.click({ window: appwin, element_index: button });
};
globalThis.record = async (label) => {
  const state = await call("hub_download_status");
  await fs.writeFile(`${out}/${label}.json`, JSON.stringify(state, null, 2));
  await page.screenshot({ path: `${out}/${label}.png` });
  return state;
};
