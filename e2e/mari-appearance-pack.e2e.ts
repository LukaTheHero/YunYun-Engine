import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { seedUIState } from "./ui-state-fixture.js";

async function openOmnibar(page: Page) {
  const shortcut = await page.evaluate(async () => {
    const { isApplePlatform } = await import("/src/lib/command-center.ts" as string);
    return isApplePlatform() ? "Meta+k" : "Control+k";
  });
  await page.keyboard.press(shortcut);
}

/** Home with the given UI state seeded once; settings synced by earlier tests are kept out. */
async function openHome(page: Page, state: Parameters<typeof seedUIState>[1]) {
  const version = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
  await page.addInitScript((appVersion) => {
    localStorage.setItem("marinara:whats-new:seen-version", appVersion);
  }, version);
  await page.route("**/api/app-settings/ui", (route) =>
    route.fulfill({ json: route.request().method() === "GET" ? { value: null } : { success: true } }),
  );
  await seedUIState(
    page,
    { hasCompletedOnboarding: true, rightPanelOpen: false, sidebarOpen: false, ...state },
    "if-missing",
  );
  const failedSprites: string[] = [];
  page.on("response", (response) => {
    if (response.url().includes("/sprites/") && response.status() >= 400) {
      failedSprites.push(`${response.status()} ${response.url()}`);
    }
  });
  await page.goto("/");
  return failedSprites;
}

const homePortrait = (page: Page) =>
  page
    .locator('[data-component="HomeBrowserHub.ProfessorWidget"]')
    .locator('img[src^="/sprites/yunyun/basic/portrait-idle.webp?v="]');

// The fork ships one YunYun pack. A pick saved from an upstream pack it does not ship falls back to YunYun.
test("the YunYun pack is the only appearance, and an old upstream pick falls back to it", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-06-15T12:00:00"));
  const failedSprites = await openHome(page, { mariAppearancePackId: "golden", mariUnlockedPackIds: ["golden"] });
  await expect(homePortrait(page)).toHaveJSProperty("naturalWidth", 299);
  await page
    .locator("main")
    .first()
    .click({ position: { x: 5, y: 5 } });
  await openOmnibar(page);
  const omnibar = page.locator('[data-component="GlobalOmnibar"]');
  await omnibar.getByRole("button", { name: "Search and Professor YunYun settings", exact: true }).click();
  const packs = omnibar.getByRole("radiogroup", { name: "Professor YunYun appearance" });
  await expect(packs.getByRole("radio")).toHaveCount(1);
  await expect(packs.getByRole("radio", { name: /^YunYun/ })).toBeChecked();
  expect(failedSprites).toEqual([]);
});

// Noon keeps the browser on October 31, inside Halloween, in any CI time zone up to ±11 hours.
test("Halloween keeps its theme but never puts YunYun in a costume", async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 9, 31, 12, 0));
  const failedSprites = await openHome(page, {
    seasonalThemesDisabled: false,
    seasonalGreetingYears: { halloween: 2026 },
  });
  await expect(page.locator("html")).toHaveAttribute("data-seasonal-theme", "halloween");
  await expect(homePortrait(page)).toHaveJSProperty("naturalWidth", 299);
  expect(failedSprites).toEqual([]);
});
