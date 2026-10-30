import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { seedUIState } from "./ui-state-fixture";

const appVersion = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version as string;
test.use({ actionTimeout: 10_000 });

type PresetRow = { id: string; name: string; systemKey?: string; engineMode?: string };
type FeaturesResponse = { settings: Record<string, boolean> };

async function setMeguminMode(request: APIRequestContext, enabled: boolean) {
  const current = (await (await request.get("/api/app-settings/features")).json()) as FeaturesResponse;
  const { meguminMode: _previous, ...others } = current.settings;
  const next = enabled ? { ...others, meguminMode: true } : others;
  expect((await request.put("/api/app-settings/features", { data: next })).ok()).toBeTruthy();
}

async function stockPresets(request: APIRequestContext) {
  const presets = (await (await request.get("/api/prompts")).json()) as PresetRow[];
  const universal = presets.find((preset) => preset.systemKey === "marinara-universal-preset");
  const megumin = presets.find((preset) => preset.systemKey === "megumin-suite-preset");
  if (!universal || !megumin) throw new Error("Both stock presets are seeded");
  return { universal, megumin };
}

async function createChat(
  request: APIRequestContext,
  mode: "roleplay" | "conversation",
  promptPresetId: string | null,
) {
  const character = (await (
    await request.post("/api/characters", { data: { data: { name: `Megumin fixture ${mode}`, first_mes: "" } } })
  ).json()) as { id: string };
  const chat = (await (
    await request.post("/api/chats", {
      data: { name: `Megumin ${mode} chat`, mode, characterIds: [character.id] },
    })
  ).json()) as { id: string; name: string };
  if (promptPresetId) {
    expect((await request.patch(`/api/chats/${chat.id}`, { data: { promptPresetId } })).ok()).toBeTruthy();
  }
  return {
    chat,
    character,
    cleanup: async () => {
      await request.delete(`/api/chats/${chat.id}?force=true`);
      await request.delete(`/api/characters/${character.id}`);
    },
  };
}

async function chatPresetId(request: APIRequestContext, chatId: string) {
  return ((await (await request.get(`/api/chats/${chatId}`)).json()) as { promptPresetId: string | null })
    .promptPresetId;
}

async function openApp(page: Page, chatId: string | null) {
  await page.route("**/api/app-settings/ui", (route) =>
    route.fulfill({ json: route.request().method() === "GET" ? { value: null } : { success: true } }),
  );
  await page.addInitScript(
    ({ version, chatId }) => {
      localStorage.setItem("marinara:whats-new:seen-version", version);
      if (chatId) localStorage.setItem("marinara-active-chat-id", chatId);
      else localStorage.removeItem("marinara-active-chat-id");
    },
    { version: appVersion, chatId },
  );
  await seedUIState(page, {
    hasCompletedOnboarding: true,
    sidebarOpen: false,
    rightPanelOpen: false,
    chatHelpSeenModes: ["conversation", "roleplay", "game"],
  });
  await page.goto("/");
  if (chatId) await expect(page.locator("textarea[data-chat-composer]")).toBeVisible();
}

async function openPresetsPanel(page: Page) {
  await page.evaluate(async () => {
    const { useUIStore } = await import("/src/stores/ui.store.ts" as string);
    useUIStore.getState().openRightPanel("presets");
  });
  const card = page.locator("[data-megumin-preset-card]");
  await expect(card).toBeVisible();
  return card;
}

test.afterEach(async ({ request }) => {
  await setMeguminMode(request, false);
});

test(
  "the Presets tab shows the Megumin card with the switch off and dims Megumin presets",
  { tag: "@smoke" },
  async ({ page, request }) => {
    const features = (await (await request.get("/api/app-settings/features")).json()) as FeaturesResponse;
    expect(features.settings.meguminMode ?? false, "Megumin Mode is off on a fresh install").toBe(false);
    const { megumin } = await stockPresets(request);
    expect(megumin.engineMode).toBe("megumin");

    await openApp(page, null);
    const card = await openPresetsPanel(page);
    await expect(card.getByRole("heading", { name: "Megumin Suite v10" })).toBeVisible();
    await expect(card.getByText("Megumin Suite by KazumaONIISAN (Arif-salah).")).toBeVisible();
    await expect(card.getByRole("checkbox", { name: "Megumin Mode" })).not.toBeChecked();
    await expect(card.locator("[data-megumin-status]")).toHaveText(
      "Off. Megumin presets only run while Megumin Mode is on.",
    );

    const row = page.locator(`[data-drag-id="${megumin.id}"]`);
    await expect(row).toHaveAttribute("data-megumin-preset", "off");
    await expect(row.getByText("Needs Megumin Mode", { exact: true })).toBeVisible();
    await expect(row.getByText("Megumin", { exact: true })).toBeVisible();
  },
);

test("turning Megumin Mode on puts the open Roleplay chat on Megumin Suite, and Undo restores it", async ({
  page,
  request,
}) => {
  const { universal, megumin } = await stockPresets(request);
  const fixture = await createChat(request, "roleplay", universal.id);
  try {
    await openApp(page, fixture.chat.id);
    const card = await openPresetsPanel(page);
    await expect(card.locator("[data-megumin-status]")).toHaveText(
      "Off. Megumin presets only run while Megumin Mode is on.",
    );

    await card.getByText("Megumin Mode", { exact: true }).click();
    await expect(card.getByRole("checkbox", { name: "Megumin Mode" })).toBeChecked();
    await expect.poll(() => chatPresetId(request, fixture.chat.id)).toBe(megumin.id);
    const toast = page
      .locator("[data-sonner-toast]")
      .filter({ hasText: `Megumin Mode is on for ${fixture.chat.name}.` });
    await expect(toast).toBeVisible();
    await expect(card.locator("[data-megumin-status]")).toHaveText("On · active in this chat.");
    await expect(page.locator(`[data-drag-id="${megumin.id}"]`)).toHaveAttribute("data-megumin-preset", "on");

    await toast.getByRole("button", { name: "Undo" }).click();
    await expect.poll(() => chatPresetId(request, fixture.chat.id)).toBe(universal.id);
    await expect(card.locator("[data-megumin-status]")).toHaveText(`On · this chat uses ${universal.name}.`);
  } finally {
    await fixture.cleanup();
  }
});

test("assigning a Megumin preset while the mode is off asks first, and the chat shows the OFF banner", async ({
  page,
  request,
}) => {
  const { universal, megumin } = await stockPresets(request);
  const fixture = await createChat(request, "roleplay", universal.id);
  try {
    await openApp(page, fixture.chat.id);
    await openPresetsPanel(page);
    const row = page.locator(`[data-drag-id="${megumin.id}"]`);
    await row.hover();
    await row.getByRole("button", { name: `Add ${megumin.name} to the active chat` }).click();
    const dialog = page.getByRole("dialog", { name: "Turn on Megumin Mode?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Use it, keep Megumin Mode off" }).click();
    await page
      .getByRole("dialog", { name: "Replace chat preset?" })
      .getByRole("button", { name: "Replace", exact: true })
      .click();
    await expect.poll(() => chatPresetId(request, fixture.chat.id)).toBe(megumin.id);

    // On a phone the panel covers the chat.
    await page.evaluate(async () => {
      const { useUIStore } = await import("/src/stores/ui.store.ts" as string);
      useUIStore.getState().closeRightPanel();
    });
    const banner = page.locator("[data-megumin-off-banner]");
    await expect(banner).toContainText(`Megumin Mode is off, so this chat is generating with ${universal.name}.`);
    await banner.getByRole("button", { name: "Turn on" }).click();
    await expect(banner).toHaveCount(0);
    await expect
      .poll(async () => ((await (await request.get("/api/app-settings/features")).json()) as FeaturesResponse).settings)
      .toMatchObject({ meguminMode: true });
  } finally {
    await fixture.cleanup();
  }
});

test("a Conversation chat explains that Megumin Mode works in Roleplay chats", async ({ page, request }) => {
  const fixture = await createChat(request, "conversation", null);
  try {
    await setMeguminMode(request, true);
    await openApp(page, fixture.chat.id);
    const card = await openPresetsPanel(page);
    await expect(card.getByRole("checkbox", { name: "Megumin Mode" })).toBeChecked();
    await expect(card.locator("[data-megumin-status]")).toHaveText("On · Megumin Mode works in Roleplay chats.");
    await expect(card.getByRole("button", { name: "Use in this chat" })).toBeDisabled();
    await expect(card.locator("[data-megumin-use-hint]")).toHaveText(
      "Megumin Mode works in Roleplay chats. Open one to use it there.",
    );
  } finally {
    await fixture.cleanup();
  }
});

test("the Megumin Suite editor saves an engine change to the character and keeps it after a reload", async ({
  page,
  request,
}, testInfo) => {
  const { megumin } = await stockPresets(request);
  const fixture = await createChat(request, "roleplay", megumin.id);
  try {
    await setMeguminMode(request, true);
    await openApp(page, fixture.chat.id);
    const card = await openPresetsPanel(page);
    await expect(card.locator("[data-megumin-status]")).toHaveText("On · active in this chat.");
    await card.getByRole("button", { name: "Open Megumin Suite" }).click();

    const editor = page.locator("[data-megumin-suite-editor]");
    await expect(editor.getByRole("heading", { name: "Megumin Suite", exact: true })).toBeVisible();
    const scope = editor.locator("[data-megumin-scope]");
    await expect(scope.getByRole("button", { name: "Megumin fixture roleplay (character)" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(editor.getByRole("button", { name: /^V10 Ukiyo\b/ }).first()).toHaveAttribute("aria-pressed", "true");

    await editor
      .getByRole("button", { name: /^V10 Shura\b/ })
      .first()
      .click();
    await expect
      .poll(async () => {
        const { settings } = (await (await request.get("/api/megumin/settings")).json()) as {
          settings: { characterProfiles: Record<string, Record<string, unknown>> };
        };
        return settings.characterProfiles[fixture.character.id];
      })
      .toMatchObject({ mode: "v10-shura", activeStyleId: "dir_v10_shura", model: "cot-v10-shura-english" });

    await editor.getByRole("button", { name: /^Story Config/ }).click();
    await editor.getByRole("combobox", { name: "Story Config preset" }).selectOption({ label: "Grimdark Survival" });
    await editor.getByRole("button", { name: "Load", exact: true }).click();
    await expect(editor.locator("[data-megumin-config-preview]")).toContainText("- narration tone: bleak");
    await testInfo.attach("megumin-suite-editor", { body: await page.screenshot(), contentType: "image/png" });

    // The seeded UI state replaces the stored one on every load, so reopen the editor from the card.
    await page.reload();
    await (await openPresetsPanel(page)).getByRole("button", { name: "Open Megumin Suite" }).click();
    await expect(editor.getByRole("heading", { name: "Megumin Suite", exact: true })).toBeVisible();
    await expect(editor.getByRole("button", { name: /^V10 Shura\b/ }).first()).toHaveAttribute("aria-pressed", "true");
    await editor.getByRole("button", { name: /^Story Config/ }).click();
    await expect(editor.locator("[data-megumin-config-preview]")).toContainText("- narration tone: bleak");

    await editor.getByRole("button", { name: "Close Megumin Suite" }).click();
    await expect(editor).toHaveCount(0);
  } finally {
    await fixture.cleanup();
  }
});
