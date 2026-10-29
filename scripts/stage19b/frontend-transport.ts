import { invoke } from "@tauri-apps/api/core";
export const localCmsQa = true;
export const localCmsOrigin = "https://localhost:8787";
export const isLocalCms = (raw: string) =>
  new URL(raw).origin === localCmsOrigin;
export async function localCmsFetch(raw: string): Promise<Response> {
  if ((await invoke("plugin:app|identifier")) !== "app.port.stage19b-qa")
    throw Error("QA identity required");
  const u = new URL(raw);
  if (!isLocalCms(raw)) throw Error("QA origin required");
  const bytes = await invoke<number[]>("local_cms_qa_fetch", {
    path: u.pathname + u.search,
  });
  return new Response(new Uint8Array(bytes), {
    headers: { "Content-Type": "application/json" },
  });
}
