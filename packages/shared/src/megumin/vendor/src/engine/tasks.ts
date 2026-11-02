// YunYun override of Megumin Suite's src/engine/tasks.js.
//
// Megumin's Chomusuke ("the helper model") runs background jobs on a second
// SillyTavern connection profile. In YunYun the worker is any saved connection
// (or "__current__", the chat's own story connection). What is kept exactly:
// a job is a quiet prompt; the jobs of one chat run one at a time in arrival
// order; a job that reads the reply just written holds the next message until it
// lands (the send guard); every job has its own Stop; a failure is said once and
// comes back as null. The connection switching dance is gone: YunYun sends each
// job straight to its connection.
// Derived from Megumin Suite (CC BY-NC 4.0, see LICENSE.md).
import { generateQuietPrompt, getContext, isGenerating } from "../st.js";
import { localProfile } from "../core/state.js";
import { setActiveBanListChat, setActiveGenerationOrder } from "../core/activeRequests.js";
import { warnChomusuke } from "./chomusukeNotice.js";
import { requestError, storyWaitsFor } from "./workerRequest.js";
import { setChomusukeStatus } from "./chomusukeStatus.js";
import { currentMeguminScope, maybeMeguminScope, runInChildRun } from "../../../host.js";

export const CURRENT_CONNECTION = "__current__";

interface JobEntry {
  jobs: string[];
  chatId: string | null;
  controller: AbortController;
  running: boolean;
}

const liveJobs = new Set<JobEntry>();
const queues = new Map<string, Promise<unknown>>();
const readsPending = new Map<string, { count: number; done: Promise<void>; end: () => void }>();
const stoppedAt = new Map<string, number>();
const STOP_SPILL_MS = 3000;

function chatKey(chatId: string | null | undefined): string {
  return chatId || "";
}

/** The jobs queued or running for a chat, for its Chomusuke indicator. */
export function chomusukeStatusFor(chatId: string | null): { running: { jobs: string[] } | null; waiting: number } {
  const key = chatKey(chatId);
  const mine = [...liveJobs].filter((e) => chatKey(e.chatId) === key && !e.controller.signal.aborted);
  const running = mine.find((e) => e.running) || null;
  return { running: running ? { jobs: running.jobs } : null, waiting: mine.filter((e) => !e.running).length };
}

function publishStatus(chatId: string | null) {
  const status = chomusukeStatusFor(chatId);
  setChomusukeStatus(status);
  maybeMeguminScope()?.chat.changed?.("chomusuke");
}

function holdReplies(chatId: string | null) {
  const key = chatKey(chatId);
  const cur = readsPending.get(key);
  if (cur) {
    cur.count++;
    return;
  }
  let end: () => void = () => {};
  const done = new Promise<void>((r) => {
    end = r;
  });
  readsPending.set(key, { count: 1, done, end });
}

function releaseReplies(chatId: string | null) {
  const key = chatKey(chatId);
  const cur = readsPending.get(key);
  if (!cur) return;
  if (--cur.count > 0) return;
  readsPending.delete(key);
  cur.end();
}

/** Resolves when a message sent in this chat can go; null when nothing holds it (the send guard). */
export function chomusukeSessionPromise(chatId: string | null = getContext()?.chatId ?? null): Promise<void> | null {
  return readsPending.get(chatKey(chatId))?.done ?? null;
}

let replyHeld = false;
export function setReplyHeld(v: boolean): void {
  replyHeld = Boolean(v);
}

/** Stops a chat's jobs (or those `stop(entry)` picks). Returns how many it stopped. */
export function stopChomusukeJobs(stop: (entry: { jobs: string[]; chatId: string | null }) => boolean = () => true): number {
  let n = 0;
  const touched = new Set<string | null>();
  for (const e of liveJobs) {
    if (e.controller.signal.aborted || !stop(e)) continue;
    e.controller.abort();
    n++;
    touched.add(e.chatId);
    stoppedAt.set(chatKey(e.chatId), Date.now());
  }
  for (const chatId of touched) publishStatus(chatId);
  return n;
}

export function stopJobsForOtherChats(): number {
  const chatId = getContext()?.chatId ?? null;
  return stopChomusukeJobs((e) => e.chatId !== chatId);
}

/** Jobs are sent straight to their connection; there is no switching to fall back to. */
export function chomusukeSwitches(): boolean {
  return false;
}

/** The job running for the current chat, or null. */
export function chomusukeJobRunning(): string | null {
  const status = chomusukeStatusFor(getContext()?.chatId ?? null);
  return status.running ? status.running.jobs[0] || null : null;
}

/**
 * Runs `task` on Chomusuke when it is on, has a connection and the feature is
 * routed to it; otherwise runs it straight away on the chat's own connection.
 * Never call it from inside a task it is running: the inner call would queue
 * behind the outer one.
 */
export async function runWithChomusuke<T>(
  featureKey: string,
  task: () => Promise<T>,
  { force = false, jobs = null }: { force?: boolean; jobs?: string[] | null } = {},
): Promise<T | null> {
  const chomusuke = localProfile?.chomusuke;
  const isEnabled = Boolean(chomusuke?.enabled) || force;
  const workerId: string = chomusuke?.profileId || "";
  const featureOn = featureKey === "test" || chomusuke?.features?.[featureKey] !== false;
  if (!isEnabled || !workerId || !featureOn) return await task();

  const jobList = jobs || [featureKey];
  const chatId: string | null = getContext()?.chatId ?? null;
  const key = chatKey(chatId);
  const stopped = stoppedAt.get(key) || 0;
  if (stopped && Date.now() - stopped < STOP_SPILL_MS && featureKey !== "test") return null;

  const entry: JobEntry = { jobs: jobList, chatId, controller: new AbortController(), running: false };
  liveJobs.add(entry);
  publishStatus(chatId);
  const holds = storyWaitsFor(jobList);
  if (holds) holdReplies(chatId);

  const ahead = queues.get(key) || Promise.resolve();
  const turn = ahead.then(async () => {
    try {
      if (entry.controller.signal.aborted) return null;
      entry.running = true;
      publishStatus(chatId);
      return await runOnWorker(featureKey, task, workerId, jobList, entry);
    } finally {
      entry.running = false;
      liveJobs.delete(entry);
      publishStatus(chatId);
      if (holds) releaseReplies(chatId);
    }
  });
  queues.set(
    key,
    turn.catch(() => {}),
  );
  return turn;
}

async function runOnWorker<T>(
  featureKey: string,
  task: () => Promise<T>,
  workerId: string,
  jobs: string[],
  entry: JobEntry,
): Promise<T | null> {
  const signal = entry.controller.signal;
  // Traffic guard: a job waits for the story model to finish writing, so it reads the finished reply.
  let waitLoops = 0;
  while (isGenerating() && !replyHeld && !signal.aborted && waitLoops < 60) {
    await new Promise((r) => setTimeout(r, 500));
    waitLoops++;
  }
  if (signal.aborted) return null;

  const connectionId = workerId === CURRENT_CONNECTION ? null : workerId;
  try {
    const result = await runInChildRun({ connectionId, signal, job: featureKey }, task);
    if (signal.aborted) return null;
    if ((result === undefined || result === null) && connectionId) {
      throw new Error("Worker model returned no output.");
    }
    return result;
  } catch (e) {
    if (signal.aborted) return null;
    warnChomusuke("failed", jobs, { error: requestError(e) });
    return null;
  }
}

// ── Jobs the tabs start themselves ───────────────────────────────────────

export async function analyzeSlopDirectly(chatText: string): Promise<string | null> {
  setActiveBanListChat(chatText);
  try {
    const rawOutput = await generateQuietPrompt({ prompt: "___PS_BANLIST___", quietPrompt: "___PS_BANLIST___" });
    return String(rawOutput || "")
      .replace(/<think>[\s\S]*?<\/think>/g, "")
      .trim();
  } catch (e) {
    warnChomusuke("failed", ["banList"], { error: requestError(e) });
    return null;
  } finally {
    setActiveBanListChat(null);
  }
}

export async function analyzeSlopWithPreset(chatText: string): Promise<string | null> {
  return await runWithChomusuke("banList", () => analyzeSlopDirectly(chatText));
}

/** The Megumin Engine prompt (Writing Style generator): built whole by the prompt handler. */
export async function runMeguminTask(orderText: string): Promise<string> {
  setActiveGenerationOrder(orderText);
  try {
    return await generateQuietPrompt({ prompt: "___PS_DUMMY___" });
  } finally {
    setActiveGenerationOrder(null);
  }
}

/** SillyTavern swapped its preset to "Megumin Engine" here; YunYun builds that prompt directly. */
export async function useMeguminEngine(task: () => Promise<unknown>): Promise<void> {
  await task();
}

/** The chat a scope belongs to (for callers that need it outside getContext). */
export function currentChatId(): string | null {
  return currentMeguminScope().chat.chatId;
}
