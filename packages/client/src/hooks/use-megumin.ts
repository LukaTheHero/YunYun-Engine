// ──────────────────────────────────────────────
// Megumin Suite: the panel's and the cards' server calls
// ──────────────────────────────────────────────
// The engine runs on the server; the client reads a chat's view (the profile in
// effect, the block registry, every reply's card inputs), saves edited profiles,
// runs the panel's buttons as actions, and polls the chat's activity so the
// after-reply work (World State, blocks, NPCs, images) shows up when it lands.
import { useCallback, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "../lib/api-client";
import { useChatStore } from "../stores/chat.store";
import { useChat } from "./use-chats";
import { useFeatureEnabled } from "./use-feature-settings";

export type MeguminProfile = Record<string, any>;

export interface MeguminCardInputs {
  /** The reply's index in the chat as Megumin counts it. */
  index: number;
  worldStateText: string;
  storeBlocks: Record<string, string>;
  pending: boolean;
  world: any;
  notebook: any;
}

export interface MeguminBlockDef {
  id: string;
  tag: string;
  label?: string;
  emoji?: string;
  icon?: string;
  color?: string;
  visibility?: string;
  repeating?: boolean;
  lead?: boolean;
  system?: boolean;
  builtin?: boolean;
  desc?: string;
}

export interface MeguminView {
  enabled: boolean;
  profileKey: string;
  profileLevel: string;
  profile: MeguminProfile;
  globalSettings: Record<string, any>;
  chomusuke: Record<string, any>;
  sidePanel: Record<string, any>;
  presentBar?: Record<string, any>;
  storyConfigGlobalSync?: boolean;
  customModes: Array<Record<string, any>>;
  sharedFragments: Record<string, any>;
  configPresets: Array<Record<string, any>>;
  globalSyncTabs: Record<string, boolean>;
  registry: MeguminBlockDef[];
  activeBlocks: string[];
  omit: string[];
  statFields: Record<string, any>;
  cards: Record<string, MeguminCardInputs>;
  world: { enabled: boolean; mode: string; state: any; history?: any[]; pendingFullRewrite?: boolean };
  stats: Record<"bonds" | "sheet" | "chatter" | "tracker" | "cyoa", any>;
  notebook: {
    enabled: boolean;
    phase: any;
    state: any;
    turns?: { seqToIndex: Array<[number, number]>; userSeqs: number[] };
  };
  chomusukeStatus: { running: { jobs: string[] } | null; waiting: number };
  memory: { tokensSaved: number; realMessages?: number };
}

export interface MeguminStatus {
  enabled: boolean;
  defaultPresetSystemKey: string;
  stockPresetId: string | null;
  presets: Array<{ systemKey: string; name: string; description: string; id: string | null }>;
}

export type MeguminCatalog = Record<string, any>;

export interface MeguminActivity {
  version: number;
  notices: Array<{
    seq: number;
    at: number;
    level: "info" | "success" | "warning" | "error";
    message: string;
    title?: string;
  }>;
  running: boolean;
  chomusuke: { running: { jobs: string[] } | null; waiting: number };
  waitingForReads: boolean;
}

/** Which profile the panel edits: a Roleplay chat's (by Megumin's save mode), or the global default. */
export type MeguminScope = { kind: "chat"; chatId: string } | { kind: "global" };

export const meguminKeys = {
  all: ["megumin"] as const,
  status: () => [...meguminKeys.all, "status"] as const,
  catalog: () => [...meguminKeys.all, "catalog"] as const,
  engine: (id: string) => [...meguminKeys.all, "engine", id] as const,
  cot: (id: string) => [...meguminKeys.all, "cot", id] as const,
  view: (scope: MeguminScope, history = false) =>
    [
      ...meguminKeys.all,
      "view",
      scope.kind === "chat" ? scope.chatId : "global",
      history ? "history" : "base",
    ] as const,
  viewsOf: (scope: MeguminScope) =>
    [...meguminKeys.all, "view", scope.kind === "chat" ? scope.chatId : "global"] as const,
  backgroundLog: (chatId: string) => [...meguminKeys.all, "background-log", chatId] as const,
  activity: (chatId: string) => [...meguminKeys.all, "activity", chatId] as const,
};

function viewPath(scope: MeguminScope) {
  return scope.kind === "chat" ? `/megumin/chats/${scope.chatId}/view` : "/megumin/global/view";
}

function profilePath(scope: MeguminScope) {
  return scope.kind === "chat" ? `/megumin/chats/${scope.chatId}/profile` : "/megumin/global/profile";
}

/** MEGUMINTOGGLE: the feature switch, on by default. */
export function useMeguminEnabled(): boolean {
  return useFeatureEnabled("megumin");
}

/** The open chat when it is a Roleplay chat (the only mode Megumin drives), else the global default. */
export function useMeguminScope(): MeguminScope {
  const chatId = useChatStore((s) => s.activeChatId);
  const chat = useChat(chatId).data as { id: string; mode?: string } | undefined;
  return chatId && chat?.mode === "roleplay" ? { kind: "chat", chatId } : { kind: "global" };
}

export function useMeguminStatus() {
  return useQuery<MeguminStatus>({
    queryKey: meguminKeys.status(),
    queryFn: () => api.get<MeguminStatus>("/megumin/status"),
    staleTime: 30_000,
  });
}

/** Megumin's library (engines, CoTs, styles, add-ons, blocks, slots…): fixed for a build. */
export function useMeguminCatalog(enabled = true) {
  return useQuery<MeguminCatalog>({
    queryKey: meguminKeys.catalog(),
    queryFn: () => api.get<MeguminCatalog>("/megumin/catalog"),
    staleTime: Infinity,
    enabled,
  });
}

/** One engine whole (Dev Mode, cloning); custom engines change, so not cached forever. */
export function useMeguminEngine(id: string | null) {
  return useQuery<Record<string, any>>({
    queryKey: meguminKeys.engine(id ?? ""),
    queryFn: () => api.get<Record<string, any>>(`/megumin/engines/${encodeURIComponent(id ?? "")}`),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useMeguminCot(id: string | null) {
  return useQuery<Record<string, any>>({
    queryKey: meguminKeys.cot(id ?? ""),
    queryFn: () => api.get<Record<string, any>>(`/megumin/cots/${encodeURIComponent(id ?? "")}`),
    enabled: !!id,
    staleTime: Infinity,
  });
}

export function useMeguminView(scope: MeguminScope, options: { history?: boolean; enabled?: boolean } = {}) {
  return useQuery<MeguminView>({
    queryKey: meguminKeys.view(scope, options.history),
    queryFn: () => api.get<MeguminView>(`${viewPath(scope)}${options.history ? "?history=1" : ""}`),
    staleTime: 30_000,
    enabled: options.enabled ?? true,
  });
}

/**
 * The profile editor: edits land in the cached view at once and are saved, coalesced, a moment later.
 * A save's answer only replaces the cache when no newer edit was made while it was on its way.
 */
export function useMeguminProfileEditor(scope: MeguminScope) {
  const qc = useQueryClient();
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const editSeq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ scope: MeguminScope; profile: MeguminProfile } | null>(null);

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const job = pending.current;
    if (!job) return;
    pending.current = null;
    const seq = editSeq.current;
    try {
      const view = await api.put<MeguminView>(profilePath(job.scope), { profile: job.profile });
      if (seq === editSeq.current) qc.setQueryData(meguminKeys.view(job.scope), view);
      void qc.invalidateQueries({ queryKey: meguminKeys.viewsOf(job.scope), exact: false });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
      void qc.invalidateQueries({ queryKey: meguminKeys.viewsOf(job.scope), exact: false });
    }
  }, [qc]);

  // Leaving a chat (or the panel) saves what was typed for it.
  const scopeId = scope.kind === "chat" ? scope.chatId : "global";
  useEffect(
    () => () => {
      void flush();
    },
    [flush, scopeId],
  );

  /** Applies a change to a copy of the profile (mutate the draft or return a new one). */
  const update = useCallback(
    (change: (draft: MeguminProfile) => MeguminProfile | void) => {
      const current = scopeRef.current;
      const view = qc.getQueryData<MeguminView>(meguminKeys.view(current));
      if (!view) return;
      const draft = structuredClone(view.profile) as MeguminProfile;
      const next = (change(draft) ?? draft) as MeguminProfile;
      editSeq.current += 1;
      qc.setQueryData<MeguminView>(meguminKeys.view(current), { ...view, profile: next });
      pending.current = { scope: current, profile: next };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), 450);
    },
    [flush, qc],
  );

  /** Sets one top-level profile key. */
  const set = useCallback(
    (key: string, value: unknown) =>
      update((draft) => {
        draft[key] = value;
      }),
    [update],
  );

  return { update, set, flush };
}

/** Install-wide parts of the store (Chomusuke, side panel, Settings, Dev Mode's fragments and engines). */
export function useSaveMeguminGlobal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<Record<keyof MeguminView | "configPresets", unknown>>) =>
      api.put<{ ok: true }>("/megumin/global", patch),
    onMutate: async (patch) => {
      // Every cached view shows the same store: patch them all so the panel answers at once.
      for (const [key, view] of qc.getQueriesData<MeguminView>({ queryKey: [...meguminKeys.all, "view"] })) {
        if (view) qc.setQueryData(key, { ...view, ...patch });
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: [...meguminKeys.all, "view"] }),
    onError: (error) => toast.error(error instanceof Error ? error.message : String(error)),
  });
}

export function useResetMeguminProfile(scope: MeguminScope) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => {
      if (scope.kind !== "chat") return api.post<MeguminView>("/megumin/global/profile/reset", {});
      return api.post<MeguminView>(`/megumin/chats/${scope.chatId}/profile/reset`, {});
    },
    onSuccess: (view) => {
      qc.setQueryData(meguminKeys.view(scope), view);
      void qc.invalidateQueries({ queryKey: meguminKeys.viewsOf(scope) });
    },
  });
}

/**
 * A panel or card button, run in the chat's Megumin scope (or the global default's, where actions that
 * read a chat find none; the panel disables those with no Roleplay chat open).
 */
export function useMeguminAction(scope: MeguminScope) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ action, args }: { action: string; args?: Record<string, unknown> }) => {
      const path = scope.kind === "chat" ? `/megumin/chats/${scope.chatId}/actions` : "/megumin/global/actions";
      const res = await api.post<{ ok: true; result: unknown }>(path, { action, args: args ?? {} });
      return res.result;
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: meguminKeys.viewsOf(scope) });
      // What the action said (Megumin's own notices) arrives with the chat's activity: fetch it now.
      if (scope.kind === "chat") void qc.invalidateQueries({ queryKey: meguminKeys.activity(scope.chatId) });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : String(error)),
  });
}

export function useMeguminBackgroundLog(chatId: string | null) {
  return useQuery<{ entries: Array<Record<string, any>> }>({
    queryKey: meguminKeys.backgroundLog(chatId ?? ""),
    queryFn: () => api.get(`/megumin/chats/${chatId}/background-log`),
    enabled: !!chatId,
    staleTime: 5_000,
  });
}

export function useClearMeguminBackgroundLog(chatId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete(`/megumin/chats/${chatId}/background-log`),
    onSuccess: () => qc.invalidateQueries({ queryKey: meguminKeys.backgroundLog(chatId ?? "") }),
  });
}

const NOTICE_TOAST = {
  info: toast.info,
  success: toast.success,
  warning: toast.warning,
  error: toast.error,
} as const;

/**
 * Follows a Roleplay chat's Megumin activity: Megumin's own notices become toasts, and the chat's view is
 * re-read whenever the after-reply work changed something. Fast while work is running, slow when idle.
 */
export function useMeguminActivity(chatId: string | null, enabled: boolean) {
  const qc = useQueryClient();
  const after = useRef(0);
  const version = useRef<number | null>(null);
  const streaming = useChatStore((s) => !!chatId && s.streamingChatId === chatId);

  useEffect(() => {
    after.current = 0;
    version.current = null;
  }, [chatId]);

  const query = useQuery<MeguminActivity>({
    queryKey: meguminKeys.activity(chatId ?? ""),
    queryFn: () => api.get<MeguminActivity>(`/megumin/chats/${chatId}/activity?after=${after.current}`),
    enabled: enabled && !!chatId,
    refetchInterval: (q) => {
      const data = q.state.data;
      return streaming || data?.running || data?.chomusuke?.running || data?.waitingForReads ? 1500 : 8000;
    },
    staleTime: 0,
  });

  const data = query.data;
  useEffect(() => {
    if (!data || !chatId) return;
    // The first answer for a chat only sets the mark: notices from before it was opened are not replayed.
    if (version.current === null) {
      after.current = Math.max(after.current, ...data.notices.map((n) => n.seq));
      version.current = data.version;
      return;
    }
    for (const notice of data.notices) {
      if (notice.seq <= after.current) continue;
      after.current = notice.seq;
      NOTICE_TOAST[notice.level]?.(notice.title ? `${notice.title}: ${notice.message}` : notice.message);
    }
    if (version.current !== null && version.current !== data.version) {
      void qc.invalidateQueries({ queryKey: meguminKeys.viewsOf({ kind: "chat", chatId }) });
    }
    version.current = data.version;
  }, [chatId, data, qc]);

  // A finished generation is followed by Megumin's reads of the reply: look sooner.
  const wasStreaming = useRef(streaming);
  useEffect(() => {
    if (wasStreaming.current && !streaming && chatId) {
      void qc.invalidateQueries({ queryKey: meguminKeys.activity(chatId) });
      void qc.invalidateQueries({ queryKey: meguminKeys.viewsOf({ kind: "chat", chatId }) });
    }
    wasStreaming.current = streaming;
  }, [chatId, qc, streaming]);

  return query;
}
