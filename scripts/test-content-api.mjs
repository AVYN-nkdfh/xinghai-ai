import assert from "node:assert/strict";
import login from "../api/admin/login.js";
import admin from "../api/content/admin.js";
import hero from "../api/content/hero.js";
import uploadContent from "../api/content/upload.js";
import works from "../api/content/works.js";
import worksAdmin from "../api/content/works-admin.js";

function response() {
  return {
    statusCode: 200,
    headers: {},
    body: "",
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    end(value = "") { this.body += value; },
  };
}

async function call(handler, { method = "GET", body, cookie = "", query = {} } = {}) {
  const req = { method, body, query, url: "/api/content/upload", headers: cookie ? { cookie } : {}, socket: { remoteAddress: "127.0.0.1" } };
  const res = response();
  await handler(req, res);
  return { status: res.statusCode, headers: res.headers, json: JSON.parse(res.body || "{}") };
}

assert.ok(process.env.ADMIN_PASSWORD, "ADMIN_PASSWORD is required");
assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required");
assert.ok(process.env.SESSION_SECRET, "SESSION_SECRET is required");

console.log("test: public hero");
const publicResult = await call(hero);
assert.equal(publicResult.status, 200);
assert.equal(publicResult.json.slides.length, 4);
assert.ok(publicResult.json.slides.every((slide) => !("status" in slide)));
assert.ok(publicResult.json.slides.every((slide) => !("showStudentName" in slide)));
assert.ok(publicResult.json.slides.every((slide) => !("chapterLabel" in slide)));

console.log("test: public works");
const publicWorks = await call(works);
assert.equal(publicWorks.status, 200);
assert.equal(publicWorks.json.studentWorks.length, 7);
assert.equal(publicWorks.json.officialWorks.length, 0);
assert.equal(publicWorks.json.homepageWorks.length, 6);
assert.ok(publicWorks.json.studentWorks.every((work) => !("status" in work)));
assert.ok(publicWorks.json.studentWorks.some((work) => work.id === "parent-child-relationship-test"));
assert.equal(
  publicWorks.json.studentWorks.find((work) => work.id === "moments-copy")?.href,
  "/works/moments-copy/",
);
assert.equal(
  publicWorks.json.studentWorks.find((work) => work.id === "parent-child-relationship-test")?.href,
  "/works/parent-child-relationship-test/",
);

console.log("test: authentication");
const blocked = await call(admin);
assert.equal(blocked.status, 401);

const loggedIn = await call(login, { method: "POST", body: { password: process.env.ADMIN_PASSWORD } });
assert.equal(loggedIn.status, 200);
const cookie = String(loggedIn.headers["set-cookie"]).split(";")[0];
assert.ok(cookie.includes("xh_booking_admin="));

const adminResult = await call(admin, { cookie });
assert.equal(adminResult.status, 200);
assert.equal(adminResult.json.slides.length, 4);
assert.ok(adminResult.json.slides.every((slide) => slide.dataQuality.ageMissing));

console.log("test: works admin");
const worksAdminResult = await call(worksAdmin, { cookie });
assert.equal(worksAdminResult.status, 200);
assert.equal(worksAdminResult.json.works.length, 7);

const blockedWorksAdmin = await call(worksAdmin);
assert.equal(blockedWorksAdmin.status, 401);

console.log("test: upload token");
const tokenBody = { type: "blob.generate-client-token", payload: { pathname: "homepage/test.mp4", clientPayload: null, multipart: false } };
const blockedUpload = await call(uploadContent, { method: "POST", body: tokenBody });
assert.equal(blockedUpload.status, 401);
const uploadToken = await call(uploadContent, { method: "POST", body: tokenBody, cookie });
assert.equal(uploadToken.status, 200);
assert.ok(String(uploadToken.json.clientToken).startsWith("vercel_blob_client_"));

console.log("test: save and publish");
const first = adminResult.json.slides[0];
const saved = await call(admin, { method: "POST", cookie, body: { action: "save", slide: first } });
assert.equal(saved.status, 200);
assert.equal(saved.json.id, first.id);

const published = await call(admin, { method: "POST", cookie, body: { action: "publish", id: first.id } });
assert.equal(published.status, 200);
assert.equal(published.json.slides.find((slide) => slide.id === first.id).status, "published");

const firstWork = worksAdminResult.json.works[0];
const savedWork = await call(worksAdmin, { method: "POST", cookie, body: { action: "save", work: firstWork } });
assert.equal(savedWork.status, 200);
assert.equal(savedWork.json.id, firstWork.id);

const publishedWork = await call(worksAdmin, { method: "POST", cookie, body: { action: "publish", id: firstWork.id } });
assert.equal(publishedWork.status, 200);
assert.equal(publishedWork.json.works.find((work) => work.id === firstWork.id).status, "published");

console.log(JSON.stringify({
  ok: true,
  publicSlides: publicResult.json.slides.length,
  adminSlides: adminResult.json.slides.length,
  missingAges: adminResult.json.slides.filter((slide) => slide.dataQuality.ageMissing).length,
  privateFieldsHidden: publicResult.json.slides.every((slide) => !("status" in slide)),
  uploadTokenProtected: blockedUpload.status === 401 && uploadToken.status === 200,
  publicWorks: publicWorks.json.studentWorks.length,
  worksAdminProtected: blockedWorksAdmin.status === 401,
}));
