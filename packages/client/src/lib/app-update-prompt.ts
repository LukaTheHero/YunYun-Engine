import { toast } from "sonner";
import { translate } from "../localization/i18n";
import { reloadBrowser } from "./browser-runtime";
import { getRunningEntryPath, servedClientDiffers } from "./runtime-build";

const APP_UPDATE_TOAST_ID = "marinara-app-update";
let latestRefresh: (() => void | Promise<void>) | null = null;

// Read while the entry loads (main.tsx imports this first), before anything else can add a module script.
const RUNNING_ENTRY_PATH =
  typeof document === "undefined"
    ? null
    : getRunningEntryPath(document.querySelectorAll<HTMLScriptElement>("script[src]"), window.location.origin);

/**
 * Whether reloading would load a different client than this tab runs, from the index.html the server serves
 * now; null when the server could not be asked. A server rebuilt but not restarted (or with only one package
 * rebuilt) reports a build that differs from this client while serving this very client, and index.html is
 * never cached by the service worker, so a fresh tab already runs the newest client: prompting in either case
 * only brings the prompt back after every refresh.
 */
export async function reloadWouldChangeClient(signal?: AbortSignal): Promise<boolean | null> {
  try {
    const res = await fetch("/", { cache: "no-store", headers: { Accept: "text/html" }, signal });
    if (!res.ok) return null;
    return servedClientDiffers(await res.text(), RUNNING_ENTRY_PATH);
  } catch {
    return null;
  }
}

export function showAppUpdatePrompt(refresh: () => void | Promise<void>) {
  latestRefresh = refresh;
  toast.info(translate("ui.app.update.available"), {
    id: APP_UPDATE_TOAST_ID,
    description: translate("ui.app.update.description"),
    duration: Infinity,
    action: {
      label: translate("ui.app.update.refresh"),
      onClick: () => {
        void Promise.resolve()
          .then(() => latestRefresh?.())
          .catch(() => reloadBrowser("update-fallback"));
      },
    },
  });
}
