/** Contracts only: no Stage 02 installer, network downloads or process execution. */
export type TitleId = "u1" | "u2" | "u3";
export interface GameTitle {
  id: TitleId;
  name: string;
  subtitle: string;
  year: number;
  art: string;
  number: string;
}
export interface Collection {
  id: string;
  title: string;
  upstream: string;
  installationGroup: string;
  status: "planned";
  titles: GameTitle[];
}
export interface CatalogService {
  collections(): Promise<Collection[]>;
}
export interface Installation {
  id: string;
  collectionId: string;
  runtimePath: string;
  dataPath: string;
  version: string;
}
export type InstallPhase =
  "validating" | "extracting" | "downloading" | "verifying" | "preparing";
export type InstallEvent = {
  taskId: string;
  phase: InstallPhase;
  completedBytes: number;
  totalBytes: number | null;
  bytesPerSecond: number | null;
};
export interface InstallerCore {
  validatePackage(
    path: string,
    adapterId: string,
  ): Promise<{ compatible: boolean; reason?: string }>;
  install(packagePath: string, adapterId: string): Promise<string>;
  pause(taskId: string): Promise<void>;
  cancel(taskId: string): Promise<void>;
  launch(installationId: string): Promise<void>;
  remove(installationId: string): Promise<void>;
  verify(installationId: string): Promise<void>;
}
export interface GameAdapter {
  id: string;
  installationGroup: string;
  titles: TitleId[];
  repository: string;
  entrypoint: string;
  individualLaunch: "unverified";
  packageSupport: "unverified";
}
export const unchartedAdapter: GameAdapter = {
  id: "uncharted",
  installationGroup: "nathan-drake-collection",
  titles: ["u1", "u2", "u3"],
  repository: "Supermedo/uncharted_pc",
  entrypoint: "Uncharted.exe",
  individualLaunch: "unverified",
  packageSupport: "unverified",
};
export const collection: Collection = {
  id: "uncharted",
  title: "Uncharted: The Nathan Drake Collection",
  upstream: "https://github.com/Supermedo/uncharted_pc",
  installationGroup: unchartedAdapter.installationGroup,
  status: "planned",
  titles: [
    {
      id: "u1",
      name: "Uncharted",
      subtitle: "Drake’s Fortune",
      year: 2007,
      art: "jungle",
      number: "01",
    },
    {
      id: "u2",
      name: "Uncharted 2",
      subtitle: "Among Thieves",
      year: 2009,
      art: "snow",
      number: "02",
    },
    {
      id: "u3",
      name: "Uncharted 3",
      subtitle: "Drake’s Deception",
      year: 2011,
      art: "desert",
      number: "03",
    },
  ],
};
export const catalogService: CatalogService = {
  collections: async () => [collection],
};
