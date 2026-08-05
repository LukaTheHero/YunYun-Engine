import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { createClientStaticOptions } from "../src/config/client-static-config.js";

const clientDist = mkdtempSync(join(tmpdir(), "marinara-static-cache-"));
mkdirSync(join(clientDist, "assets"));
writeFileSync(join(clientDist, "index.html"), "<!doctype html><script src=\"/assets/index-AbCdEf12.js\"></script>");
writeFileSync(join(clientDist, "manifest.json"), "{}");
writeFileSync(join(clientDist, "sw.js"), "// service worker");
writeFileSync(join(clientDist, "registerSW.js"), "// registration helper");
writeFileSync(join(clientDist, "yunyun-favicon.png"), "not fingerprinted");
writeFileSync(join(clientDist, "assets", "index-AbCdEf12.js"), "export {};");

const app = Fastify({ logger: false });

try {
  await app.register(fastifyStatic, createClientStaticOptions(clientDist));
  await app.ready();

  for (const route of ["/", "/index.html"]) {
    const response = await app.inject({ method: "GET", url: route });
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["cache-control"], "no-cache, must-revalidate");
  }

  for (const route of ["/manifest.json", "/sw.js", "/registerSW.js"]) {
    const response = await app.inject({ method: "GET", url: route });
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["cache-control"], "no-store, no-cache, must-revalidate");
  }

  const fingerprintedAsset = await app.inject({ method: "GET", url: "/assets/index-AbCdEf12.js" });
  assert.equal(fingerprintedAsset.statusCode, 200);
  assert.equal(fingerprintedAsset.headers["cache-control"], "public, max-age=31536000, immutable");

  const unfingerprintedAsset = await app.inject({ method: "GET", url: "/yunyun-favicon.png" });
  assert.equal(unfingerprintedAsset.statusCode, 200);
  // Fork behaviour: unfingerprinted files change in place between builds, so
  // they must revalidate instead of falling back to heuristic caching.
  assert.equal(unfingerprintedAsset.headers["cache-control"], "no-cache, must-revalidate");

  console.info("Static client cache-header regression passed.");
} finally {
  await app.close();
  rmSync(clientDist, { recursive: true, force: true });
}
