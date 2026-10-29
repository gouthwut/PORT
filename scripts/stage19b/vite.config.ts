import { defineConfig, mergeConfig } from "vite";
import base from "../../vite.config";
import path from "node:path";
export default mergeConfig(
  base,
  defineConfig({
    resolve: {
      alias: [
        {
          find: "./local-cms-qa",
          replacement: path.resolve("scripts/stage19b/frontend-transport.ts"),
        },
        {
          find: "./source-config.json",
          replacement: path.resolve("scripts/stage19b/source.json"),
        },
      ],
    },
  }),
);
