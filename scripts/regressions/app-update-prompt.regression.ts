// The "A YunYun update is ready" prompt may only offer a refresh that loads a different client. A server
// whose own build differs from the client it serves (rebuilt but not restarted, or the server rebuilt
// without the client) used to bring the prompt back after every refresh, forever.
import assert from "node:assert/strict";
import {
  formatRuntimeBuild,
  getRunningEntryPath,
  isRuntimeBuildCurrent,
  servedClientDiffers,
} from "../../packages/client/src/lib/runtime-build.js";

const ORIGIN = "http://127.0.0.1:7860";
const indexFor = (entry: string) =>
  `<!doctype html><html><head><script type="module" crossorigin src="${entry}"></script>` +
  `<link rel="modulepreload" crossorigin href="/assets/vendor-react-CYC267EA.js"></head><body></body></html>`;

const running = getRunningEntryPath(
  [
    { type: "", src: "" },
    { type: "text/javascript", src: `${ORIGIN}/legacy.js` },
    { type: "module", src: `${ORIGIN}/assets/index-NEWNEWNE.js` },
    { type: "module", src: `${ORIGIN}/extensions/late.js` },
  ],
  ORIGIN,
);
assert.equal(running, "/assets/index-NEWNEWNE.js", "the first same-origin module script is the running entry");
assert.equal(
  getRunningEntryPath([{ type: "module", src: "https://cdn.example/assets/index-X.js" }], ORIGIN),
  null,
  "a foreign-origin module is not this app's entry",
);

const clientBuild = formatRuntimeBuild("2.5.1", "bbbbbbbbbbbb");
const staleServer = { version: "2.5.1", build: "2.5.1+aaaaaaaaaaaa" };
assert.equal(isRuntimeBuildCurrent("2.5.1", clientBuild, staleServer), false, "the builds disagree");

// The 2026-11-02 loop: the client on disk was rebuilt, the server still reports its older build.
assert.equal(
  servedClientDiffers(indexFor("/assets/index-NEWNEWNE.js"), running),
  false,
  "a server that serves this very client gets no refresh prompt, since a refresh changes nothing",
);

// A real update: the server now serves a newer client than the open tab runs.
assert.equal(
  servedClientDiffers(indexFor("/assets/index-NEWER123.js"), running),
  true,
  "a newer served client is offered",
);
assert.equal(
  servedClientDiffers(indexFor("/assets/index-NEWNEWNE.js"), "/assets/index-NEW"),
  true,
  "a prefix of another entry is not a match",
);
assert.equal(
  servedClientDiffers(indexFor("/assets/index-NEWNEWNE.js"), null),
  true,
  "an unknown running entry keeps the old behaviour and offers the refresh",
);

console.log("app update prompt regression passed");
