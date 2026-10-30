import type { PublishedGame } from "./catalog";

export const adapterRegistry = {
  bloodborne: { implementation: "compatibility-runtime", source: "PS4 PKG" },
  skate3: { implementation: "recompilation", source: "Xbox 360 ISO" },
} as const;
/** Collections whose CMS recipe passed native validation (filled from list_recipes/sync_recipes). */
const recipeCollections = new Set<string>();
export const setRecipeCollections = (ids: string[]) => {
  recipeCollections.clear();
  ids.forEach((id) => recipeCollections.add(id));
};
export const hasRecipe = (g: PublishedGame) =>
  !(g.collectionId in adapterRegistry) && recipeCollections.has(g.collectionId);
export const supportsInstall = (g: PublishedGame) => {
  if (hasRecipe(g))
    return (
      g.windowsBuild === "available" && g.compatibility.status !== "unavailable"
    );
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
