# Third-Party Notices

YunYun Engine is licensed under the GNU Affero General Public License v3 (see `LICENSE`). The material below is someone else's work, included under its own license.

## Megumin Suite

- **Work:** Megumin Suite v10, a SillyTavern preset and extension
- **Author:** KazumaONIISAN (Arif-salah)
- **Source:** <https://github.com/Arif-salah/Megumin-Suite>
- **License:** Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0), <https://creativecommons.org/licenses/by-nc/4.0/>
- **Permission:** ported to YunYun Engine with the author's permission.

Megumin Mode includes:

| Part | Where |
| --- | --- |
| Prompt text: engines, reasoning frameworks, writing styles, style tags and templates, add-ons, toggles, narrator personalities, blocks and task prompts | `packages/server/src/services/megumin/content/` |
| Story Config fields, options and presets, and the engine, reasoning and add-on catalog | `packages/shared/src/features/megumin/` |
| The bundled preset's layout and its fixed text | `packages/server/src/db/megumin-suite-preset.json` |
| The preset card's banner, a smaller copy of the suite's own banner | `packages/client/public/megumin/megumin-suite-banner.webp` |

**Changes:** the SillyTavern JavaScript was rewritten in TypeScript for YunYun Engine. The prompt text is kept word for word, but some of it is not shipped: the "USER Consent" prompt and the prompts the preset never sends. The preset's regex scripts are not included either. The ported text is filled into a YunYun prompt preset, and the settings are kept per character and per chat.
