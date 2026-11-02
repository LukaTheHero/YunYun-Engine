// ──────────────────────────────────────────────
// Megumin panel: an action that only reads
// ──────────────────────────────────────────────
// Some panel views ask the engine for something it works out from the chat (the
// Blocks preview, the Notebook's turn labels, whether a World State rewrite is
// queued). Going through the panel's `run` would re-read the chat's view after
// every call, and the view changing would ask again; a query keyed on what the
// answer depends on asks once per change instead.
import { useQuery } from "@tanstack/react-query";
import { api } from "../../../lib/api-client";
import { meguminKeys, type MeguminScope } from "../../../hooks/use-megumin";

export function useMeguminReadAction<T>(
  scope: MeguminScope,
  action: string,
  options: { args?: Record<string, unknown>; dependsOn?: string; enabled?: boolean } = {},
) {
  const scopeKey = scope.kind === "chat" ? scope.chatId : "global";
  return useQuery<T>({
    queryKey: [
      ...meguminKeys.all,
      "read",
      scopeKey,
      action,
      JSON.stringify(options.args ?? {}),
      options.dependsOn ?? "",
    ],
    queryFn: async () => {
      const path = scope.kind === "chat" ? `/megumin/chats/${scope.chatId}/actions` : "/megumin/global/actions";
      const res = await api.post<{ ok: true; result: T }>(path, { action, args: options.args ?? {} });
      return res.result;
    },
    enabled: options.enabled ?? true,
    staleTime: 30_000,
    retry: false,
    placeholderData: (previous) => previous,
  });
}
