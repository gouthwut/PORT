import { test, expect } from "@playwright/test";

for (const health of ["installed", "broken"]) {
  test(`recovery warning stays global with ${health} Skate registration (mocked IPC)`, async ({
    page,
  }) => {
    await page.addInitScript(
      ({ health }) => {
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
              if (command === "list_installations")
                return [
                  {
                    id: "20-2",
                    collectionId: "skate3",
                    root: "C:/Games/Skate 3",
                    dataPath: "C:/Games/Skate 3/game",
                    runtimePath: "C:/Games/Skate 3/skate3-runtime",
                    version: "retail / recomp v2.0.2",
                    manifestSha256: "a".repeat(64),
                    health,
                  },
                ];
              if (command === "running_installations") return [];
              if (command === "take_launch_request") return null;
              if (command === "install_status")
                return {
                  phase: "",
                  active: false,
                  completed: 0,
                  total: 0,
                  message: "",
                  recoveryError:
                    "Восстановление предыдущей операции PORT не завершено: Некорректный журнал восстановления операции 10-1. Файлы сохранены.",
                };
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
      page.getByRole("alert").filter({ hasText: "предыдущей операции PORT" }),
    ).toHaveCount(1);
    await expect(page.locator(".game-primary-action")).not.toContainText(
      "журнал восстановления",
    );
    const play = page.getByRole("button", {
      name: "Играть в Skate 3",
      exact: true,
    });
    if (health === "installed") {
      await expect(play).toBeEnabled();
      await expect(
        page.getByText("Готова к игре", { exact: true }),
      ).toBeVisible();
    } else {
      await expect(play).toBeDisabled();
      await expect(
        page.getByText("Готова к игре", { exact: true }),
      ).toHaveCount(0);
    }
  });
}
