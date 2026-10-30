import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:1420",
    viewport: { width: 1440, height: 1000 },
    locale: "ru-RU",
    // Existing regression suites exercise the previously saved Russian preference.
    // Fresh-install behavior is tested with empty storage in beta1.spec.ts.
    storageState: {
      cookies: [],
      origins: [1420, 1421].map((port) => ({
        origin: `http://127.0.0.1:${port}`,
        localStorage: [
          {
            name: "port.settings.v1",
            value: JSON.stringify({
              theme: "dark",
              language: "ru",
              installDir: "",
              reducedMotion: false,
              compactCards: false,
            }),
          },
        ],
      })),
    },
    colorScheme: "dark",
    reducedMotion: "reduce",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "npm run dev",
      env: { VITE_CATALOG_FIXTURE: "1" },
      url: "http://127.0.0.1:1420",
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
    {
      command: "npm run preview -- --host 127.0.0.1 --port 1421 --strictPort",
      url: "http://127.0.0.1:1421",
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
  ],
});
