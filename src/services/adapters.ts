import type { PublishedGame } from "./catalog";

export const adapterRegistry = {
  bloodborne: { implementation: "compatibility-runtime", source: "PS4 PKG" },
  skate3: { implementation: "recompilation", source: "Xbox 360 ISO" },
} as const;
export const supportsInstall = (g: PublishedGame) => {
  const adapter = adapterRegistry[g.adapterId as keyof typeof adapterRegistry];
  return (
    !!adapter &&
    g.id === g.adapterId &&
    g.collectionId === g.adapterId &&
    g.implementation === adapter.implementation &&
    (g.adapterId !== "skate3" || g.sourceConsole === "Xbox 360") &&
    g.windowsBuild === "available" &&
    g.compatibility.status !== "unavailable"
  );
};
