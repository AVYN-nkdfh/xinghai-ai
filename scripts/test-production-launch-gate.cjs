"use strict";

const assert = require("node:assert/strict");
const {
  assertNoUnresolvedLaunchMarkers,
  resolvePublicRuntimeConfig,
} = require("./build-public.cjs");

const siteUrl = "https://tudu.school";
const productionEnv = {
  VERCEL_ENV: "production",
  TURNSTILE_SITE_KEY: "dummy_site_key_123456",
  LEADS_ALLOWED_ORIGINS: siteUrl,
  LEADS_PRIVACY_VERSION: "2026-08-24",
  LEADS_EXPECTED_FUNCTION_REGION: "sin1",
  LEADS_INTERNATIONAL_TRANSFER_CONSENT_VERSION: "2026-08-24",
  LEADS_IDEMPOTENCY_SECRET: "dummy-idempotency-secret-for-launch-gate-test",
  FEISHU_LEADS_RETENTION_ELIGIBLE_STATUSES: "待联系,跟进中,未转化,无效",
  TURNSTILE_SECRET_KEY: "dummy-turnstile-secret-for-launch-gate-test",
  TURNSTILE_ALLOWED_HOSTNAMES: "tudu.school",
  TURNSTILE_EXPECTED_ACTION: "lead_submit",
  FEISHU_APP_ID: "unit-test-app-id",
  FEISHU_APP_SECRET: "unit-test-app-secret",
  FEISHU_LEADS_BASE_TOKEN: "unit-test-base-token",
  FEISHU_LEADS_TABLE_ID: "unit-test-table-id",
  FEISHU_LEADS_CHAT_ID: "unit-test-chat-id",
  FEISHU_LEADS_BASE_URL: "https://example.feishu.cn/base/unit-test",
  CRON_SECRET: "dummy-retention-secret-for-launch-gate-test",
  LEADS_RETENTION_DELETE_ENABLED: "true",
  LEADS_RETENTION_SAFETY_WINDOW_MINUTES: "1560",
};

assert.throws(
  () => resolvePublicRuntimeConfig({ VERCEL_ENV: "production" }, siteUrl),
  /Production config is missing:/,
  "Production must reject missing configuration before launch-marker checks",
);

const resolved = resolvePublicRuntimeConfig(productionEnv, siteUrl);
assert.equal(resolved.requireProduction, true);

assert.rejects(
  () => assertNoUnresolvedLaunchMarkers(["index.html", "learning.html", "create.html", "works.html", "privacy.html"]),
  (error) => (
    /Production launch is blocked/.test(error.message)
    && /index\.html: production-lead-environment/.test(error.message)
    && /privacy\.html: operator-filing-applicability/.test(error.message)
    && !/production-project-route-preservation/.test(error.message)
    && !/production-lead-retention/.test(error.message)
  ),
  "A fully configured Production build must still fail closed while release markers remain",
).then(() => {
  console.log("production launch-gate tests passed");
});
