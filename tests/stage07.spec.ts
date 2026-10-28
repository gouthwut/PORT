import { test, expect } from "@playwright/test";
for (const health of ["missing", "broken"]) {
  test(`library reports ${health} and preserves registration (mocked IPC)`, async ({
    page,
  }) => {
    await page.addInitScript(
      ({ health }) => {
        const item = {
          id: "7-8",
          collectionId: "bloodborne",
          root: "D:/Игры/Bloodborne",
          dataPath: "D:/Игры/Bloodborne/CUSA03173",
          runtimePath: "D:/Игры/Bloodborne/bbport-windows",
          version: "01.09",
          manifestSha256: "a".repeat(64),
          health,
        };
        Object.assign(window, {
          isTauri: true,
          __TAURI_INTERNALS__: {
            invoke: async (command: string) => {
              if (command === "load_settings")
                return {
                  theme: "dark",
                  installDir: "",
                  compactCards: false,
                  reducedMotion: true,
                };
              if (command === "load_media")
                return { hero: "", cover: "", banner: "", gallery: [] };
              if (command === "list_installations") return [item];
              if (command === "running_installations") return [];
              if (command === "install_status")
                return {
                  active: false,
                  phase: "",
                  completed: 0,
                  total: 0,
                  message: "",
                };
              if (command === "take_launch_request") return null;
              throw Error(command);
            },
          },
        });
      },
      { health },
    );
    await page.goto("/");
    await page.getByRole("button", { name: "Библиотека", exact: true }).click();
    await expect(
      page.getByText(
        health === "missing"
          ? "Папка не найдена"
          : "Повреждена запись установки",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Играть в Bloodborne", exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Выбрать: Bloodborne", exact: true })
      .click();
    await expect(
      page.getByText("Папка установки: D:/Игры/Bloodborne", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Восстановить связь с установленной игрой",
        exact: true,
      }),
    ).toBeVisible();
  });
}
