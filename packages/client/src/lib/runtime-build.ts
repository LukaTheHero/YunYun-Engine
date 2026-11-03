export type RuntimeHealth = {
  version: string;
  build?: string | null;
};

export function formatRuntimeBuild(version: string, commit: string | null) {
  return commit ? `${version}+${commit}` : version;
}

export function getServerRuntimeBuild(health: RuntimeHealth) {
  return health.build?.trim() || health.version;
}

export function isRuntimeBuildCurrent(clientVersion: string, clientBuild: string, health: RuntimeHealth) {
  const serverBuild = health.build?.trim();
  if (!serverBuild || serverBuild === health.version) {
    return health.version === clientVersion;
  }

  return serverBuild === clientBuild;
}

/** The module entry this page booted from, as a path ("/assets/index-abc123.js"), or null if none is found. */
export function getRunningEntryPath(scripts: Iterable<{ type: string; src: string }>, origin: string) {
  for (const script of scripts) {
    if (script.type !== "module" || !script.src) continue;
    try {
      const url = new URL(script.src, origin);
      if (url.origin === origin) return url.pathname;
    } catch {
      // Not a URL this page could have loaded.
    }
  }
  return null;
}

/**
 * Whether reloading would load a different client than the one running: the index.html the server serves
 * now points at another entry. A server whose own build differs from the client it serves (rebuilt but not
 * restarted, or one package rebuilt without the other) serves this same client again, so prompting to
 * refresh there only brings the prompt back after every reload.
 */
export function servedClientDiffers(servedIndexHtml: string, runningEntryPath: string | null) {
  if (!runningEntryPath) return true;
  return !servedIndexHtml.includes(`src="${runningEntryPath}"`);
}
