// YunYun stub of Megumin Suite src/ui/tabs/coreAndCot.js (the Preset & Thinking tab's jQuery UI).
// Derived from Megumin Suite (CC BY-NC 4.0).
let currentPage = "preset";
export function setPresetPage(id: string): void {
  if (["preset", "thinking", "config"].includes(id)) currentPage = id;
}
export function presetPage(): string {
  return currentPage;
}
export function renderCoreAndCot(..._args: unknown[]): void {}
