import { test, expect } from "@playwright/test";
import { project14Fixture } from "./helpers/project14-fixture";
import translations from "../src/hub/translations.json" with { type: "json" };

for (const [language, label, copied] of [
  ["ru", "Копировать шаги", "Скопировано!"],
  ["en", "Copy Steps", "Copied!"],
  ["es", "Copiar pasos", "¡Copiado!"],
  ["fr", "Copier les étapes", "Copié !"],
  ["de", "Schritte kopieren", "Kopiert!"],
]) {
  test(`copy installation steps in ${language}`, async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const { project } = await project14Fixture(page);
    project.install.steps.push(
      "Extract the archive.\nKeep its folder structure.",
    );
    Object.assign(project.install, { notes: "Use your own game files." });
    Object.assign(project.links, { website: "https://example.org/docs/setup" });
    await page.evaluate((language) => {
      const key = "port.settings.v1";
      localStorage.setItem(
        key,
        JSON.stringify({ ...JSON.parse(localStorage.getItem(key)!), language }),
      );
    }, language);
    await page.reload();
    await page.locator(".hub-project-card").first().click();
    const button = page.getByRole("button", { name: label, exact: true });
    await button.click();
    await expect(
      page.getByRole("button", { name: copied, exact: true }),
    ).toBeVisible();
    const translate = (source: keyof typeof translations) =>
      language === "ru"
        ? source
        : translations[source][["en", "es", "fr", "de"].indexOf(language)];
    expect(
      (await page.evaluate(() => navigator.clipboard.readText())).replace(
        /\r\n/g,
        "\n",
      ),
    ).toBe(
      `1. ${project.install.steps[0]}\n2. ${project.install.steps[1]}\n\nUse your own game files.\n\n${translate("Проект на GitHub")}: https://github.com/owner/project\n\n${translate("Сайт проекта")}: https://example.org/docs/setup`,
    );
    await expect(page.locator("#project-install")).not.toHaveAttribute(
      "open",
      "",
    );
    await page.setViewportSize({ width: 480, height: 800 });
    const bounds = await button.boundingBox();
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(480);
  });
}

test("no copy button without installation instructions", async ({ page }) => {
  const { project } = await project14Fixture(page);
  project.install.steps = [];
  await page.reload();
  await page.locator(".hub-project-card").first().click();
  await expect(page.locator("#project-install")).toHaveCount(0);
});

test("clipboard failure offers retry without false success", async ({
  page,
}) => {
  await project14Fixture(page);
  await page.evaluate(() =>
    Object.defineProperty(navigator.clipboard, "writeText", {
      value: () => Promise.reject(new Error("denied")),
    }),
  );
  await page
    .getByRole("button", { name: "Копировать шаги", exact: true })
    .click();
  await page.locator("#project-install summary > span").click();
  await expect(page.locator("#project-install [role=alert]")).toBeVisible();
  await expect(page.getByRole("button", { name: "Скопировано!" })).toHaveCount(
    0,
  );
});
