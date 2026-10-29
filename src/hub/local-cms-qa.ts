import { invoke } from "@tauri-apps/api/core";

// Dev frontend only; native independently requires the dedicated debug identity.
export const localCmsQa =
  import.meta.env.DEV && import.meta.env.VITE_PORT_LOCAL_CMS_QA === "1";
export const localCmsOrigin = "https://localhost:8787";
export function isLocalCms(raw: string): boolean {
  const u = new URL(raw);
  return (
    localCmsQa &&
    u.origin === localCmsOrigin &&
    !u.username &&
    !u.password &&
    !u.hash
  );
}
export async function localCmsFetch(raw: string): Promise<Response> {
  if (!isLocalCms(raw)) throw Error("Local CMS QA URL rejected");
  const u = new URL(raw);
  const bytes = await invoke<number[]>("local_cms_qa_fetch", {
    path: u.pathname + u.search,
  });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": u.pathname.startsWith("/media/")
        ? "image/webp"
        : "application/json",
    },
  });
}
