import { native } from "./settings";
type UsageEvent =
  "app_open" | "project_view" | "download_started" | "download_completed";
let enabled = false;
let launched = false;
const pending = new Set<AbortController>();
export function setAnalyticsConsent(consent: boolean) {
  enabled = consent === true;
  if (!enabled) {
    for (const request of pending) request.abort();
    pending.clear();
    return;
  }
  if (!launched) {
    launched = true;
    usageEvent("app_open");
  }
}
export function usageEvent(event: UsageEvent, projectId?: string) {
  if (!enabled || !native) return;
  if (
    event !== "app_open" &&
    (!projectId || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(projectId))
  )
    return;
  if (pending.size >= 4) return;
  const controller = new AbortController();
  pending.add(controller);
  const timer = setTimeout(() => controller.abort(), 3000);
  // No queue, cookies, retries, identifiers, URLs, paths or timestamps.
  void fetch(
    "https://port-catalog-cms.port-catalog-cms.workers.dev/api/analytics/events",
    {
      method: "POST",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        event === "app_open"
          ? { event, consent: true }
          : { event, projectId, consent: true },
      ),
    },
  )
    .catch(() => {})
    .finally(() => {
      clearTimeout(timer);
      pending.delete(controller);
    });
}
