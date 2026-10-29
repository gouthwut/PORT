import type { V2Build } from "./api-v2";
import { downloadUnavailable, type DownloadStatus } from "./downloads";

/** Only unambiguous numeric stable versions. Tags/dates/prereleases are not ordered. */
export function compareVersions(a: string, b: string): number | null {
  const parse = (v: string) =>
    /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\.(0|[1-9]\d*))?$/.test(v)
      ? v.replace(/^v/, "").split(".").map(Number)
      : null;
  const x = parse(a),
    y = parse(b);
  if (!x || !y || [...x, ...y].some((n) => !Number.isSafeInteger(n)))
    return null;
  for (let i = 0; i < 3; i++)
    if ((x[i] ?? 0) !== (y[i] ?? 0))
      return Math.sign((x[i] ?? 0) - (y[i] ?? 0));
  return 0;
}
export function newerDownload(
  build: V2Build | undefined,
  history: DownloadStatus[],
): boolean {
  if (
    !build ||
    build.channel !== "stable" ||
    build.arch === "unknown" ||
    downloadUnavailable(build)
  )
    return false;
  const previous = history.filter(
    (r) =>
      r.phase === "completed" &&
      r.projectId === build.projectId &&
      r.channel === "stable" &&
      r.arch === build.arch,
  );
  return (
    previous.length > 0 &&
    previous.every(
      (r) => !!r.version && compareVersions(build.version, r.version) === 1,
    )
  );
}
