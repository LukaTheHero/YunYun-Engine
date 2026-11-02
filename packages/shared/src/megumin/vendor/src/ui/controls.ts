// YunYun stub of Megumin Suite src/ui/controls.js (jQuery widgets). Megumin's
// settings window is YunYun's React panel; the modules that build these widgets
// for it still import them, so they are empty here.
// Derived from Megumin Suite (CC BY-NC 4.0, see LICENSE.md).
import { domStub } from "../st.js";

export const esc = (v: unknown): string =>
  String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
export const card = (..._args: unknown[]): any => domStub;
export const tiles = (..._args: unknown[]): any => domStub;
export const segmented = (..._args: unknown[]): any => domStub;
export const switchRow = (..._args: unknown[]): any => domStub;
export const field = (..._args: unknown[]): any => domStub;
export const busy = async (_btn: unknown, job: () => unknown, done?: () => void): Promise<void> => {
  try {
    await job();
  } finally {
    done?.();
  }
};
