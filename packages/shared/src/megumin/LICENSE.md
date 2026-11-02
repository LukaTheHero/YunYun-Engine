# Megumin Suite — licence and attribution

The files under `vendor/` and every file marked "Derived from Megumin Suite" are
adapted from **Megumin Suite** by **KazumaONIISAN**
(<https://github.com/Arif-salah/Megumin-Suite>), the SillyTavern preset and
extension. The three preset files under
`packages/server/src/db/megumin-presets/` come from the same project.

Megumin Suite is licensed under the **Creative Commons Attribution-NonCommercial
4.0 International** licence (CC BY-NC 4.0):
<https://creativecommons.org/licenses/by-nc/4.0/>.

- **Attribution.** Megumin Suite was written by KazumaONIISAN. YunYun Engine
  credits it in the app (Megumin panel → Settings → About) and here.
- **Non-commercial.** Under CC BY-NC 4.0 this material may not be used for
  commercial purposes. That restriction applies to the Megumin Suite material
  even though the rest of YunYun Engine is AGPL-3.0.
- **Changes.** `vendor/` is Megumin Suite's own code, copied by
  `scripts/megumin/sync-megumin.mjs`. Each copied file carries a header naming
  its source file and commit. The script lists every edit it makes (to run on
  a server shared by many chats, never to change behaviour). The files listed
  as `OVERRIDES` in that script, and `host.ts`, `index.ts` and `client.ts`, are
  YunYun's: they connect Megumin's engine to YunYun's chats, connections,
  lorebooks, embeddings and image generation instead of SillyTavern's.
