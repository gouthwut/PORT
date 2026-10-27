/** Extensible catalog and future installation contracts. Runtime download is separate from an installation. */
export type TitleId = string;
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
  root: string;
  version: string | null;
  manifestSha256: string;
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
  entrypoint: string | null;
  individualLaunch: "unverified";
  packageSupport: "unverified";
}
export const bloodborneAdapter: GameAdapter = {
  id: "bloodborne",
  installationGroup: "bloodborne",
  titles: ["bloodborne"],
  repository: "Supermedo/bloodborne_pc",
  entrypoint: "Bloodborne.exe",
  individualLaunch: "unverified",
  packageSupport: "unverified",
};
export const collection: Collection = {
  id: "bloodborne",
  title: "Bloodborne",
  upstream: "https://github.com/Supermedo/bloodborne_pc",
  installationGroup: bloodborneAdapter.installationGroup,
  status: "planned",
  titles: [
    {
      id: "bloodborne",
      name: "Bloodborne",
      subtitle: "Action RPG · FromSoftware · PS4",
      year: 2015,
      art: "bloodborne",
      number: "01",
    },
  ],
};
export const catalogService: CatalogService = {
  collections: async () => [collection],
};
