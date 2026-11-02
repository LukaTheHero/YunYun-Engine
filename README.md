# 👁️ YunYun Engine

**YunYun Engine** is a local, self-hosted AI chat and roleplay engine — character conversations, immersive roleplay with sprites and scenes, and AI-game-master campaigns. Install it, run it, it just works.

Maintained by **LukaTheHero**.

---

## Attribution

YunYun Engine is a fork of **[Marinara Engine](https://github.com/Pasta-Devs/Marinara-Engine)** by Pasta-Devs, and is licensed under the same terms (AGPL-3.0). All upstream copyright and authorship notices are retained — see [LICENSE](LICENSE).

This is an independent project and is **not** affiliated with, endorsed by, or supported by Pasta-Devs. Please do not report issues with this fork to the upstream project.

For upstream's full feature documentation, installation guides, and screenshots, see the [Marinara Engine repository](https://github.com/Pasta-Devs/Marinara-Engine).

---

## What's different in this edition

Everything below is layered on top of upstream Marinara Engine:

### 📂 Multi-open, persistent group folders (Characters & Personas)

Group folders in the Characters and Personas panels can be **open several at a time** instead of one-at-a-time, and which folders are open is **remembered** — it survives reloads, storage clears, and syncs across your devices.

### 🖱️ Right-click "Quick Start" on library characters

Right-click any character in the Characters panel — in the main list or inside a folder — to instantly **Quick Start Roleplay** or **Quick Start Conversation**. It's the same shortcut the Bot Browser already had, now available for every character in your library.

### 💥 Megumin Suite built in (MEGUMINTOGGLE)

[Megumin Suite](https://github.com/Arif-salah/Megumin-Suite) by KazumaONIISAN, originally a SillyTavern preset and extension, runs inside YunYun as its default Roleplay preset. Its engines and chains of thought, Story Config, writing styles, the block card under every reply (World State, Bonds, Character Sheet, Inner Chatter, Story Tracker, dice, choices), The Notebook, the NPC Bank, Story Director, Memory, Banned Phrases, image prompts, the Chomusuke helper model and Dev Mode all work from the **Megumin** panel in the top bar.

The big **MEGUMINTOGGLE** next to it switches the whole thing: on (the default), Roleplay chats on the stock preset run in Megumin mode; off, every prompt is built exactly as YunYun builds it without Megumin. Your own presets are never swapped. The same switch is in Settings › Advanced › Features.

Megumin Suite is licensed [CC BY-NC 4.0](packages/shared/src/megumin/LICENSE.md) (non-commercial use only), separately from YunYun's AGPL-3.0.

### 🎨 YunYun branding

Reskinned throughout: app name, icon set, and mascot artwork.

---

## License

[AGPL-3.0](LICENSE) — same as upstream Marinara Engine. The bundled Megumin Suite code and presets are Megumin Suite's own, under [CC BY-NC 4.0](packages/shared/src/megumin/LICENSE.md).
