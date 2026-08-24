import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

import { isMissingSchemaError } from "../api/_lib/db.js";
import { setPublicCache } from "../api/_lib/http.js";

const projectConfig = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
assert.deepEqual(projectConfig.regions, ["sin1"]);
const genericApiHeaders = projectConfig.headers.find((entry) => entry.source === "/api/:path*")?.headers || [];
assert.equal(genericApiHeaders.some((header) => header.key.toLowerCase() === "cache-control"), false);

const responseHeaders = new Map();
setPublicCache({ setHeader: (key, value) => responseHeaders.set(key, value) });
assert.equal(responseHeaders.get("Cache-Control"), "public, max-age=60, stale-while-revalidate=3600");
assert.equal(responseHeaders.get("Vercel-CDN-Cache-Control"), "public, s-maxage=300, stale-while-revalidate=3600");

assert.equal(isMissingSchemaError({ code: "42P01" }), true);
assert.equal(isMissingSchemaError({ code: "42703" }), true);
assert.equal(isMissingSchemaError({ code: "08006" }), false);

const bookingSource = await readFile(new URL("../booking/booking.js", import.meta.url), "utf8");
const requestStart = bookingSource.indexOf("function wait(ms)");
const requestEnd = bookingSource.indexOf("async function api(path", requestStart);
assert.ok(requestStart >= 0 && requestEnd > requestStart, "request helper should remain extractable for reliability tests");
const requestSource = `${bookingSource.slice(requestStart, requestEnd)}\nglobalThis.requestUnderTest = request;`;

function requestHarness(fetchImplementation) {
  const context = {
    AbortController,
    GET_TIMEOUT_MS: 25,
    GET_RETRY_DELAY_MS: 1,
    fetch: fetchImplementation,
    window: { setTimeout, clearTimeout },
  };
  vm.createContext(context);
  vm.runInContext(requestSource, context);
  return context.requestUnderTest;
}

let getCalls = 0;
const getRequest = requestHarness(async () => {
  getCalls += 1;
  if (getCalls === 1) throw new Error("temporary network failure");
  return { ok: true, json: async () => ({ ok: true }) };
});
assert.deepEqual(await getRequest("/api/read", {}, 0), { ok: true });
assert.equal(getCalls, 2, "GET should retry exactly once");

let postCalls = 0;
const postRequest = requestHarness(async () => {
  postCalls += 1;
  throw new Error("write failed");
});
await assert.rejects(postRequest("/api/write", { method: "POST", body: "{}" }, 0), /write failed/);
assert.equal(postCalls, 1, "POST must never be replayed automatically");

let timeoutCalls = 0;
const timeoutRequest = requestHarness((_path, options) => new Promise((_resolve, reject) => {
  timeoutCalls += 1;
  options.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
}));
await assert.rejects(
  timeoutRequest("/api/slow", {}, 0),
  (error) => error.code === "REQUEST_TIMEOUT" && /网络较慢/.test(error.message),
);
assert.equal(timeoutCalls, 2, "timed-out GET should stop after one retry");

const homepageSource = await readFile(new URL("../index.html", import.meta.url), "utf8");
const staticWorksBlock = homepageSource.match(/<div class="works-track" id="worksTrack">([\s\S]*?)<\/div>\s*<\/div>/)?.[1] || "";
assert.equal((staticWorksBlock.match(/<a class="work"/g) || []).length, 6, "homepage must ship six static work cards");
assert.match(homepageSource, /t\.innerHTML = fallback;/, "dynamic refresh failure must restore static work cards");

console.log("Performance reliability checks passed.");
