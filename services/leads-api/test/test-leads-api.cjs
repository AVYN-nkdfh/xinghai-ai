const assert = require("node:assert/strict");
const test = require("node:test");

const {
  HttpError,
  LEAD_RETENTION_MS,
  createIdempotencyKey,
  createLeadExpiresAt,
  maskPhone,
  validateLeadPayload,
} = require("../api/_lib/lead-domain.js");
const {
  FIELD_CONTRACT,
  FIELD_TYPES,
  ServiceError,
  buildLeadFields,
  buildLeadMessage,
  createFeishuGateway,
  loadFeishuConfig,
  validateFeishuFieldContract,
} = require("../api/_lib/feishu-leads.js");
const {
  DEFAULT_RETENTION_SAFETY_WINDOW_MINUTES,
  hasValidBearerToken,
  loadRetentionConfig,
} = require("../api/_lib/lead-retention.js");
const {
  createDefaultRuntime,
  createHandler,
  createTurnstileVerifier,
  loadRuntimeConfig,
} = require("../api/leads/create.js");
const { createRetentionHandler } = require("../api/leads/retention.js");

const NOW = Date.parse("2026-08-23T08:00:00.000Z");
const PHONE = "13800138000";

function validBody(overrides = {}) {
  return {
    phone: PHONE,
    preferredTime: "evening",
    consent: true,
    internationalTransferConsent: true,
    internationalTransferConsentVersion: "2026-08-24",
    source: "homepage",
    privacyVersion: "2026-08-24",
    turnstileToken: "unit-test-turnstile-token",
    company: "",
    startedAt: NOW - 5000,
    ...overrides,
  };
}

function makeGateway(overrides = {}) {
  const calls = {
    contract: [],
    create: [],
    find: [],
    notify: [],
    retentionConfirm: [],
    retentionDelete: [],
    retentionScan: [],
    update: [],
  };
  return {
    calls,
    async validateFieldContract(options) {
      calls.contract.push(options);
      return { checkedFieldCount: Object.keys(FIELD_CONTRACT).length };
    },
    async findByIdempotencyKey(key) {
      calls.find.push(key);
      return null;
    },
    async createLead(lead) {
      calls.create.push(lead);
      return { recordId: "rec_unit_test" };
    },
    async notify(lead) {
      calls.notify.push(lead);
    },
    async findExpiredLeads(options) {
      calls.retentionScan.push(options);
      return { items: [], truncated: false };
    },
    async confirmExpiredLead(candidate, options) {
      calls.retentionConfirm.push({ candidate, options });
      return true;
    },
    async deleteLead(recordId) {
      calls.retentionDelete.push(recordId);
    },
    async updateNotificationStatus(recordId, status) {
      calls.update.push({ recordId, status });
    },
    ...overrides,
  };
}

function makeRuntime(overrides = {}) {
  const gateway = overrides.gateway || makeGateway();
  const logs = [];
  return {
    runtime: {
      config: {
        allowedOrigins: new Set(["https://tudu.school"]),
        idempotencySecret: "unit-test-idempotency-secret-32-characters-minimum",
        internationalTransferConsentVersion: "2026-08-24",
        privacyVersion: "2026-08-24",
        requireOrigin: true,
        retentionStatuses: ["未转化"],
      },
      gateway,
      logger: overrides.logger || { error: (...args) => logs.push(args) },
      now: overrides.now || (() => NOW),
      verifyTurnstile: overrides.verifyTurnstile || (async () => true),
    },
    gateway,
    logs,
  };
}

function makeRequest(overrides = {}) {
  const body = overrides.body === undefined ? validBody() : overrides.body;
  return {
    method: "POST",
    headers: {
      origin: "https://tudu.school",
      "content-type": "application/json; charset=utf-8",
      "x-forwarded-for": "203.0.113.10",
      ...(overrides.headers || {}),
    },
    body,
    socket: { remoteAddress: "127.0.0.1" },
    ...Object.fromEntries(
      Object.entries(overrides).filter(([key]) => !["headers", "body"].includes(key)),
    ),
  };
}

function makeResponse() {
  const headers = new Map();
  return {
    statusCode: 0,
    payload: "",
    setHeader(name, value) {
      headers.set(name.toLowerCase(), value);
    },
    getHeader(name) {
      return headers.get(name.toLowerCase());
    },
    end(value = "") {
      this.payload = value;
    },
    json() {
      return this.payload ? JSON.parse(this.payload) : null;
    },
  };
}

async function callHandler(runtime, request = makeRequest()) {
  const response = makeResponse();
  const handler = createHandler({ runtime });
  await handler(request, response);
  return response;
}

function fakeFeishuEnv(overrides = {}) {
  return {
    FEISHU_APP_ID: "unit-test-app-id",
    FEISHU_APP_SECRET: "unit-test-app-secret",
    FEISHU_LEADS_BASE_TOKEN: "unit-test-base-token",
    FEISHU_LEADS_TABLE_ID: "unit-test-table-id",
    FEISHU_LEADS_CHAT_ID: "unit-test-chat-id",
    FEISHU_LEADS_BASE_URL: "https://example.feishu.cn/base/unit-test",
    ...overrides,
  };
}

function fakeRemoteFields(config) {
  return Object.entries(FIELD_CONTRACT).map(([key, rule]) => {
    const type = rule.acceptedTypes.includes(FIELD_TYPES.SINGLE_SELECT)
      ? FIELD_TYPES.SINGLE_SELECT
      : rule.acceptedTypes[0];
    const optionNames = [
      ...(rule.selectOptions || []),
      ...(key === "status" ? ["未转化"] : []),
    ];
    return {
      field_id: `fld_${key}`,
      field_name: config.fields[key],
      type,
      property: {
        options: optionNames.map((name, index) => ({ id: `opt_${key}_${index}`, name })),
      },
    };
  });
}

function makeRetentionRuntime(overrides = {}) {
  const gateway = overrides.gateway || makeGateway();
  const logs = [];
  return {
    runtime: {
      config: {
        batchSize: 50,
        deleteEnabled: false,
        eligibleStatuses: ["未转化"],
        jobSecret: "unit-test-retention-secret-at-least-32-characters",
        safetyWindowMs: DEFAULT_RETENTION_SAFETY_WINDOW_MINUTES * 60 * 1000,
        safetyWindowMinutes: DEFAULT_RETENTION_SAFETY_WINDOW_MINUTES,
        ...(overrides.config || {}),
      },
      gateway,
      logger: overrides.logger || { error: (...args) => logs.push(args) },
      now: overrides.now || (() => NOW),
    },
    gateway,
    logs,
  };
}

async function callRetentionHandler(runtime, overrides = {}) {
  const response = makeResponse();
  const request = {
    method: "GET",
    headers: {
      authorization: `Bearer ${runtime.config.jobSecret}`,
      ...(overrides.headers || {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== "headers")),
  };
  await createRetentionHandler({ runtime })(request, response);
  return response;
}

test("validates and normalizes the minimal lead contract", () => {
  const lead = validateLeadPayload(validBody({ phone: "138 0013-8000", preferredTime: "" }), {
    nowMs: NOW,
    privacyVersion: "2026-08-24",
  });
  assert.equal(lead.phone, PHONE);
  assert.equal(lead.preferredTime, "");
  assert.equal(lead.preferredTimeLabel, "都可以");
  assert.equal(lead.sourceLabel, "首页");
});

test("rejects unknown fields, invalid phone, missing consents, source, privacy, token and bad timing", () => {
  const cases = [
    [validBody({ childName: "不应收集" }), "unknown_fields"],
    [validBody({ phone: "12800138000" }), "invalid_phone"],
    [validBody({ consent: false }), "consent_required"],
    [validBody({ internationalTransferConsent: false }), "international_transfer_consent_required"],
    [validBody({ internationalTransferConsentVersion: "2026-08-23" }), "international_transfer_consent_version_changed"],
    [validBody({ source: "campaign-x" }), "invalid_source"],
    [validBody({ privacyVersion: "old" }), "privacy_version_changed"],
    [validBody({ turnstileToken: "" }), "turnstile_required"],
    [validBody({ company: "spam" }), "bot_rejected"],
    [validBody({ startedAt: NOW - 200 }), "invalid_started_at"],
    [validBody({ startedAt: NOW - 25 * 60 * 60 * 1000 }), "invalid_started_at"],
  ];
  for (const [body, code] of cases) {
    assert.throws(
      () => validateLeadPayload(body, { nowMs: NOW, privacyVersion: "2026-08-24" }),
      (error) => error instanceof HttpError && error.code === code,
      code,
    );
  }
});

test("creates a lead once and returns no phone data", async () => {
  const { runtime, gateway } = makeRuntime();
  const response = await callHandler(runtime);
  assert.equal(response.statusCode, 201);
  assert.deepEqual(Object.keys(response.json()).sort(), ["leadCode", "ok", "status"]);
  assert.equal(response.json().ok, true);
  assert.equal(JSON.stringify(response.json()).includes(PHONE), false);
  assert.equal(gateway.calls.find.length, 1);
  assert.deepEqual(gateway.calls.contract, [{ retentionStatuses: ["未转化"] }]);
  assert.equal(gateway.calls.create.length, 1);
  assert.equal(Object.hasOwn(gateway.calls.create[0], "turnstileToken"), false);
  assert.equal(Object.hasOwn(gateway.calls.create[0], "startedAt"), false);
  assert.equal(gateway.calls.create[0].internationalTransferConsent, true);
  assert.equal(gateway.calls.create[0].internationalTransferConsentVersion, "2026-08-24");
  assert.equal(gateway.calls.notify.length, 1);
  assert.equal(JSON.stringify(gateway.calls.notify[0]).includes(PHONE), false);
  assert.equal(Object.hasOwn(gateway.calls.notify[0], "phone"), false);
  assert.deepEqual(gateway.calls.update, [{ recordId: "rec_unit_test", status: "已推送" }]);
});

test("returns the existing lead idempotently without another write or notification", async () => {
  const gateway = makeGateway({
    async findByIdempotencyKey(key) {
      this.calls.find.push(key);
      return { recordId: "rec_existing", leadCode: "TD-L-20260823-EXISTING" };
    },
  });
  const { runtime } = makeRuntime({ gateway });
  const response = await callHandler(runtime);
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().leadCode, "TD-L-20260823-EXISTING");
  assert.equal(gateway.calls.create.length, 0);
  assert.equal(gateway.calls.notify.length, 0);
});

test("coalesces concurrent identical submissions in one warm function instance", async () => {
  let releaseFind;
  const waitForFind = new Promise((resolve) => { releaseFind = resolve; });
  const gateway = makeGateway({
    async findByIdempotencyKey(key) {
      this.calls.find.push(key);
      await waitForFind;
      return null;
    },
  });
  const { runtime } = makeRuntime({ gateway });
  const handler = createHandler({ runtime });
  const firstResponse = makeResponse();
  const secondResponse = makeResponse();
  const first = handler(makeRequest(), firstResponse);
  const second = handler(makeRequest({ headers: { origin: "https://tudu.school", "content-type": "application/json", "x-forwarded-for": "203.0.113.11" } }), secondResponse);
  await Promise.resolve();
  releaseFind();
  await Promise.all([first, second]);
  assert.equal(gateway.calls.find.length, 1);
  assert.equal(gateway.calls.create.length, 1);
  assert.equal(gateway.calls.contract.length, 1);
  assert.equal(firstResponse.json().leadCode, secondResponse.json().leadCode);
});

test("rejects invalid origin, content type and oversized bodies before external writes", async () => {
  const { runtime, gateway } = makeRuntime();
  const badOrigin = await callHandler(runtime, makeRequest({ headers: { origin: "https://evil.example", "content-type": "application/json" } }));
  assert.equal(badOrigin.statusCode, 403);

  const missingOrigin = await callHandler(runtime, makeRequest({ headers: { origin: "", "content-type": "application/json" } }));
  assert.equal(missingOrigin.statusCode, 403);

  const badType = await callHandler(runtime, makeRequest({ headers: { origin: "https://tudu.school", "content-type": "text/plain" } }));
  assert.equal(badType.statusCode, 415);

  const oversized = await callHandler(runtime, makeRequest({
    body: JSON.stringify({ value: "x".repeat(5000) }),
    headers: { origin: "https://tudu.school", "content-type": "application/json" },
  }));
  assert.equal(oversized.statusCode, 413);
  assert.equal(gateway.calls.create.length, 0);
});

test("answers valid preflight and rejects non-POST application calls", async () => {
  const { runtime, gateway } = makeRuntime();
  const preflight = await callHandler(runtime, makeRequest({ method: "OPTIONS", body: undefined }));
  assert.equal(preflight.statusCode, 204);
  assert.equal(preflight.getHeader("access-control-allow-origin"), "https://tudu.school");

  const getResponse = await callHandler(runtime, makeRequest({ method: "GET", body: undefined }));
  assert.equal(getResponse.statusCode, 405);
  assert.equal(getResponse.getHeader("allow"), "POST, OPTIONS");
  assert.equal(gateway.calls.create.length, 0);
});

test("preserves the stored lead if group notification is temporarily unavailable", async () => {
  const gateway = makeGateway({
    async notify(lead) {
      this.calls.notify.push(lead);
      throw new ServiceError("simulated_notification_failure", "notification unavailable");
    },
  });
  const { runtime, logs } = makeRuntime({ gateway });
  const response = await callHandler(runtime);
  assert.equal(response.statusCode, 201);
  assert.equal(response.json().ok, true);
  assert.equal(gateway.calls.create.length, 1);
  assert.deepEqual(gateway.calls.update, [{ recordId: "rec_unit_test", status: "推送失败" }]);
  assert.equal(JSON.stringify(logs).includes("simulated_notification_failure"), true);
});

test("requires successful Turnstile before looking up or writing a lead", async () => {
  const { runtime, gateway } = makeRuntime({
    verifyTurnstile: async () => {
      throw new HttpError("turnstile_failed", "安全验证已失效，请重新验证");
    },
  });
  const response = await callHandler(runtime);
  assert.equal(response.statusCode, 400);
  assert.equal(response.json().code, "turnstile_failed");
  assert.equal(gateway.calls.find.length, 0);
  assert.equal(gateway.calls.create.length, 0);
  assert.equal(gateway.calls.contract.length, 0);
});

test("rejects missing independent transfer consent before Turnstile or Feishu", async () => {
  let verifyCalls = 0;
  const { runtime, gateway } = makeRuntime({
    verifyTurnstile: async () => { verifyCalls += 1; },
  });
  const response = await callHandler(runtime, makeRequest({
    body: validBody({ internationalTransferConsent: false }),
  }));
  assert.equal(response.statusCode, 400);
  assert.equal(response.json().code, "international_transfer_consent_required");
  assert.equal(verifyCalls, 0);
  assert.equal(gateway.calls.contract.length, 0);
  assert.equal(gateway.calls.find.length, 0);
  assert.equal(gateway.calls.create.length, 0);
});

test("blocks all lead operations on a field-contract failure and retries after a transient failure", async () => {
  let contractAttempts = 0;
  const gateway = makeGateway({
    async validateFieldContract(options) {
      this.calls.contract.push(options);
      contractAttempts += 1;
      if (contractAttempts === 1) {
        throw new ServiceError("upstream_timeout", "simulated transient metadata timeout", 503);
      }
      return { checkedFieldCount: Object.keys(FIELD_CONTRACT).length };
    },
  });
  const { runtime } = makeRuntime({ gateway });
  const handler = createHandler({ runtime });
  const firstResponse = makeResponse();
  const secondResponse = makeResponse();
  await handler(makeRequest(), firstResponse);
  assert.equal(firstResponse.statusCode, 503);
  assert.equal(firstResponse.json().code, "service_unavailable");
  assert.equal(gateway.calls.find.length, 0);
  assert.equal(gateway.calls.create.length, 0);
  assert.equal(gateway.calls.notify.length, 0);
  assert.equal(gateway.calls.update.length, 0);
  await handler(makeRequest({
    headers: {
      origin: "https://tudu.school",
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.11",
    },
  }), secondResponse);
  assert.equal(secondResponse.statusCode, 201);
  assert.deepEqual(gateway.calls.contract, [
    { retentionStatuses: ["未转化"] },
    { retentionStatuses: ["未转化"] },
  ]);
  assert.equal(gateway.calls.find.length, 1);
  assert.equal(gateway.calls.create.length, 1);
  assert.equal(gateway.calls.notify.length, 1);
  assert.equal(gateway.calls.update.length, 1);
});

test("production config requires server-side Turnstile, origin, privacy and a strong idempotency secret", () => {
  const base = {
    VERCEL_ENV: "production",
    LEADS_ALLOWED_ORIGINS: "https://tudu.school,https://www.tudu.school",
    LEADS_PRIVACY_VERSION: "2026-08-24",
    LEADS_IDEMPOTENCY_SECRET: "a".repeat(32),
    FEISHU_LEADS_RETENTION_ELIGIBLE_STATUSES: "未转化",
    LEADS_EXPECTED_FUNCTION_REGION: "sin1",
    LEADS_INTERNATIONAL_TRANSFER_CONSENT_VERSION: "2026-08-24",
    TURNSTILE_ALLOWED_HOSTNAMES: "tudu.school,www.tudu.school",
    TURNSTILE_EXPECTED_ACTION: "lead_submit",
  };
  assert.throws(() => loadRuntimeConfig(base), /TURNSTILE_SECRET_KEY/);
  const config = loadRuntimeConfig({ ...base, TURNSTILE_SECRET_KEY: "turnstile-secret" });
  assert.equal(config.requireOrigin, true);
  assert.equal(config.bypassTurnstile, false);
  assert.equal(config.turnstileHostnames.has("tudu.school"), true);
  assert.equal(config.expectedFunctionRegion, "sin1");
  assert.equal(config.internationalTransferConsentVersion, "2026-08-24");
  assert.throws(
    () => loadRuntimeConfig({ ...base, TURNSTILE_SECRET_KEY: "turnstile-secret", LEADS_EXPECTED_FUNCTION_REGION: "" }),
    /LEADS_EXPECTED_FUNCTION_REGION/,
  );
  assert.throws(
    () => loadRuntimeConfig({ ...base, TURNSTILE_SECRET_KEY: "turnstile-secret", LEADS_INTERNATIONAL_TRANSFER_CONSENT_VERSION: "2026-08-22" }),
    /LEADS_INTERNATIONAL_TRANSFER_CONSENT_VERSION/,
  );
  assert.throws(
    () => loadRuntimeConfig({ ...base, TURNSTILE_SECRET_KEY: "turnstile-secret", LEADS_ALLOWED_ORIGINS: "http:\/\/tudu.school" }),
    /LEADS_ALLOWED_ORIGINS/,
  );
  assert.throws(
    () => loadRuntimeConfig({ ...base, TURNSTILE_SECRET_KEY: "turnstile-secret", VERCEL_REGION: "hkg1" }),
    /实际区域 hkg1/,
  );
  assert.throws(
    () => createDefaultRuntime({ ...base, TURNSTILE_SECRET_KEY: "turnstile-secret" }),
    /VERCEL_REGION/,
  );
});

test("preview config auto-allows only its protected Vercel hostname and cannot bypass Turnstile", () => {
  const shared = {
    NODE_ENV: "production",
    LEADS_ALLOWED_ORIGINS: "https://tudu.school",
    LEADS_PRIVACY_VERSION: "2026-08-24",
    LEADS_IDEMPOTENCY_SECRET: "a".repeat(32),
    FEISHU_LEADS_RETENTION_ELIGIBLE_STATUSES: "未转化",
    LEADS_EXPECTED_FUNCTION_REGION: "sin1",
    LEADS_INTERNATIONAL_TRANSFER_CONSENT_VERSION: "2026-08-24",
    TURNSTILE_SECRET_KEY: "official-preview-test-secret",
    TURNSTILE_ALLOWED_HOSTNAMES: "tudu.school",
    TURNSTILE_EXPECTED_ACTION: "lead_submit",
    LEADS_TURNSTILE_BYPASS: "true",
  };
  const preview = loadRuntimeConfig({
    ...shared,
    VERCEL_ENV: "preview",
    VERCEL_URL: "tudu-site-git-test.example-team.vercel.app",
  });
  assert.equal(preview.preview, true);
  assert.equal(preview.production, false);
  assert.equal(preview.requireOrigin, true);
  assert.equal(preview.bypassTurnstile, false);
  assert.equal(preview.allowedOrigins.has("https://tudu-site-git-test.example-team.vercel.app"), true);
  assert.equal(preview.turnstileHostnames.has("tudu-site-git-test.example-team.vercel.app"), true);

  const production = loadRuntimeConfig({
    ...shared,
    VERCEL_ENV: "production",
    VERCEL_URL: "must-not-be-auto-allowed.vercel.app",
  });
  assert.equal(production.allowedOrigins.has("https://must-not-be-auto-allowed.vercel.app"), false);
  assert.equal(production.turnstileHostnames.has("must-not-be-auto-allowed.vercel.app"), false);
  assert.throws(
    () => loadRuntimeConfig({ ...shared, VERCEL_ENV: "preview", VERCEL_URL: "https://unsafe.example/path" }),
    /VERCEL_URL/,
  );
  assert.throws(() => loadRuntimeConfig({ ...shared, VERCEL_ENV: "unexpected" }), /VERCEL_ENV/);
});

test("official Turnstile testing mode is explicit and Preview-only", async () => {
  const shared = {
    VERCEL_ENV: "preview",
    VERCEL_URL: "tudu-site-git-test.example-team.vercel.app",
    VERCEL_REGION: "sin1",
    LEADS_ALLOWED_ORIGINS: "https://tudu.school",
    LEADS_EXPECTED_FUNCTION_REGION: "sin1",
    LEADS_IDEMPOTENCY_SECRET: "unit-test-idempotency-secret-32-characters-minimum",
    LEADS_INTERNATIONAL_TRANSFER_CONSENT_VERSION: "2026-08-24",
    LEADS_PRIVACY_VERSION: "2026-08-24",
    FEISHU_LEADS_RETENTION_ELIGIBLE_STATUSES: "未转化",
    TURNSTILE_ALLOWED_HOSTNAMES: "tudu.school",
    TURNSTILE_EXPECTED_ACTION: "lead_submit",
    TURNSTILE_SECRET_KEY: "official-test-secret",
    LEADS_TURNSTILE_TEST_MODE: "true",
  };
  const preview = loadRuntimeConfig(shared);
  assert.equal(preview.turnstileTestMode, true);
  assert.throws(
    () => loadRuntimeConfig({ ...shared, VERCEL_ENV: "production" }),
    (error) => error instanceof ServiceError && error.code === "invalid_configuration",
  );

  const verifier = createTurnstileVerifier(preview, async () => ({
    ok: true,
    async json() {
      return {
        success: true,
        hostname: "example.com",
        metadata: { result_with_testing_key: true },
      };
    },
  }));
  await verifier({ token: "official-test-token", remoteIp: "203.0.113.10" });

  const disabledVerifier = createTurnstileVerifier(
    { ...preview, turnstileTestMode: false },
    async () => ({
      ok: true,
      async json() {
        return {
          success: true,
          hostname: "example.com",
          metadata: { result_with_testing_key: true },
        };
      },
    }),
  );
  await assert.rejects(
    disabledVerifier({ token: "official-test-token", remoteIp: "203.0.113.10" }),
    (error) => error instanceof HttpError && error.code === "turnstile_failed",
  );
});

test("Turnstile verifier sends a server-side check and enforces hostname and action", async () => {
  let received;
  const verifier = createTurnstileVerifier({
    bypassTurnstile: false,
    turnstileAction: "lead_submit",
    turnstileHostnames: new Set(["tudu.school"]),
    turnstileSecret: "secret",
  }, async (url, init) => {
    received = { url, init };
    return {
      ok: true,
      async json() {
        return { success: true, hostname: "tudu.school", action: "lead_submit" };
      },
    };
  });
  await verifier({ token: "token", remoteIp: "203.0.113.10" });
  assert.equal(received.url.includes("siteverify"), true);
  assert.equal(received.init.body.includes("secret=secret"), true);
  assert.equal(received.init.body.includes("response=token"), true);
});

test("notification text masks the phone and idempotency keys never contain it", () => {
  const maskedPhone = maskPhone(PHONE);
  const message = buildLeadMessage(
    { baseUrl: "https://example.feishu.cn/base/example" },
    {
      leadCode: "TD-L-20260823-TEST",
      maskedPhone,
      sourceLabel: "首页",
      preferredTimeLabel: "晚上 18:00—21:00",
    },
  );
  assert.equal(maskedPhone, "138****8000");
  assert.equal(message.includes(maskedPhone), true);
  assert.equal(message.includes(PHONE), false);

  const key = createIdempotencyKey(
    "unit-test-idempotency-secret-32-characters-minimum",
    { phone: PHONE, source: "homepage", privacyVersion: "2026-08-24" },
    NOW,
  );
  assert.equal(key.length, 64);
  assert.equal(key.includes(PHONE), false);
});

test("service failures log only safe codes and never the submitted phone", async () => {
  const gateway = makeGateway({
    async createLead() {
      const error = new ServiceError("simulated_write_failure", `must not log ${PHONE}`);
      throw error;
    },
  });
  const logs = [];
  const { runtime } = makeRuntime({ gateway, logger: { error: (...args) => logs.push(args) } });
  const response = await callHandler(runtime);
  assert.equal(response.statusCode, 503);
  assert.equal(JSON.stringify(response.json()).includes(PHONE), false);
  assert.equal(JSON.stringify(logs).includes(PHONE), false);
  assert.equal(JSON.stringify(logs).includes("simulated_write_failure"), true);
});

test("derives the 90-day expiry from the Base system creation timestamp", () => {
  assert.equal(createLeadExpiresAt(NOW), NOW + LEAD_RETENTION_MS);
  assert.equal(LEAD_RETENTION_MS, 90 * 24 * 60 * 60 * 1000);
});

test("validates the Feishu field contract and never writes the system created_at field", () => {
  const config = loadFeishuConfig(fakeFeishuEnv());
  assert.equal(config.fields.submittedAt, "提交时间");
  const remoteFields = fakeRemoteFields(config);
  const result = validateFeishuFieldContract(config, remoteFields, { retentionStatuses: ["未转化"] });
  assert.equal(result.checkedFieldCount, Object.keys(FIELD_CONTRACT).length);

  const leadFields = buildLeadFields(config, {
    leadCode: "TD-L-20260823-FIELDS",
    phone: PHONE,
    sourceLabel: "首页",
    preferredTimeLabel: "晚上 18:00—21:00",
    privacyVersion: "2026-08-24",
    internationalTransferConsent: true,
    internationalTransferConsentVersion: "2026-08-24",
    idempotencyKey: "a".repeat(64),
    submittedAt: NOW,
  });
  assert.equal(leadFields[config.fields.phone], PHONE);
  assert.equal(leadFields[config.fields.privacyVersion], "2026-08-24");
  assert.equal(leadFields[config.fields.internationalTransferConsent], true);
  assert.equal(leadFields[config.fields.internationalTransferConsentVersion], "2026-08-24");
  assert.equal(leadFields[config.fields.idempotencyKey], "a".repeat(64));
  assert.equal(Object.hasOwn(leadFields, config.fields.submittedAt), false);

  const wrongCreatedAtType = remoteFields.map((field) => (
    field.field_name === config.fields.submittedAt ? { ...field, type: FIELD_TYPES.DATETIME } : field
  ));
  assert.throws(
    () => validateFeishuFieldContract(config, wrongCreatedAtType),
    (error) => error instanceof ServiceError && error.code === "invalid_field_contract",
  );
  assert.throws(
    () => loadFeishuConfig(fakeFeishuEnv({ FEISHU_LEADS_FIELD_PHONE: "线索编号" })),
    (error) => error instanceof ServiceError && error.code === "invalid_field_configuration",
  );
});

test("requires explicit safe retention settings and defaults irreversible deletion off", () => {
  const env = {
    LEADS_IDEMPOTENCY_SECRET: "unit-test-idempotency-secret-at-least-32-characters",
    CRON_SECRET: "unit-test-retention-secret-at-least-32-characters",
    FEISHU_LEADS_RETENTION_ELIGIBLE_STATUSES: "待联系,未转化,未转化",
  };
  const config = loadRetentionConfig(env);
  assert.equal(config.deleteEnabled, false);
  assert.equal(config.safetyWindowMinutes, DEFAULT_RETENTION_SAFETY_WINDOW_MINUTES);
  assert.deepEqual(config.eligibleStatuses, ["待联系", "未转化"]);
  assert.equal(hasValidBearerToken(`Bearer ${config.jobSecret}`, config.jobSecret), true);
  assert.equal(hasValidBearerToken("Bearer wrong", config.jobSecret), false);
  const legacy = loadRetentionConfig({
    ...env,
    CRON_SECRET: "",
    LEADS_RETENTION_JOB_SECRET: "legacy-retention-secret-at-least-32-characters",
  });
  assert.equal(legacy.jobSecret, "legacy-retention-secret-at-least-32-characters");
  assert.throws(
    () => loadRetentionConfig({ ...env, FEISHU_LEADS_RETENTION_ELIGIBLE_STATUSES: "已转化" }),
    /不能包含已转化或在读状态/,
  );
  assert.throws(
    () => loadRetentionConfig({ ...env, VERCEL_ENV: "production" }),
    /LEADS_RETENTION_DELETE_ENABLED=true/,
  );
  assert.throws(
    () => loadRetentionConfig({
      ...env,
      VERCEL_ENV: "production",
      LEADS_RETENTION_DELETE_ENABLED: "true",
      LEADS_RETENTION_SAFETY_WINDOW_MINUTES: "60",
    }),
    /至少 1560 分钟/,
  );
  const production = loadRetentionConfig({
    ...env,
    VERCEL_ENV: "production",
    LEADS_RETENTION_DELETE_ENABLED: "true",
  });
  assert.equal(production.deleteEnabled, true);
  assert.equal(production.safetyWindowMinutes, DEFAULT_RETENTION_SAFETY_WINDOW_MINUTES);
});

test("retention dry-run scans but never confirms or deletes records", async () => {
  const candidate = {
    recordId: "rec_expired",
    leadCode: "TD-L-20260501-EXPIRED",
    status: "未转化",
    submittedAt: NOW - LEAD_RETENTION_MS - 1000,
    expiresAt: NOW - 1000,
  };
  const gateway = makeGateway({
    async findExpiredLeads(options) {
      this.calls.retentionScan.push(options);
      return { items: [candidate], truncated: false };
    },
  });
  const { runtime } = makeRetentionRuntime({ gateway });
  const response = await callRetentionHandler(runtime);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    ok: true,
    mode: "dry_run",
    eligibleCount: 1,
    truncated: false,
  });
  assert.equal(gateway.calls.retentionConfirm.length, 0);
  assert.equal(gateway.calls.retentionDelete.length, 0);
  assert.equal(
    gateway.calls.retentionScan[0].expiresAtOrBefore,
    NOW + DEFAULT_RETENTION_SAFETY_WINDOW_MINUTES * 60 * 1000,
  );
});

test("retention delete mode revalidates every candidate and skips a changed status", async () => {
  const candidates = [
    { recordId: "rec_delete", leadCode: "TD-L-1", status: "未转化", submittedAt: NOW - LEAD_RETENTION_MS, expiresAt: NOW },
    { recordId: "rec_converted", leadCode: "TD-L-2", status: "未转化", submittedAt: NOW - LEAD_RETENTION_MS, expiresAt: NOW },
  ];
  const gateway = makeGateway({
    async findExpiredLeads(options) {
      this.calls.retentionScan.push(options);
      return { items: candidates, truncated: false };
    },
    async confirmExpiredLead(candidate, options) {
      this.calls.retentionConfirm.push({ candidate, options });
      return candidate.recordId === "rec_delete";
    },
  });
  const { runtime } = makeRetentionRuntime({ gateway, config: { deleteEnabled: true } });
  const response = await callRetentionHandler(runtime);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    ok: true,
    mode: "delete",
    eligibleCount: 2,
    deletedCount: 1,
    skippedCount: 1,
    failedCount: 0,
    truncated: false,
  });
  assert.equal(gateway.calls.retentionConfirm.length, 2);
  assert.deepEqual(gateway.calls.retentionDelete, ["rec_delete"]);
});

test("retention delete mode reports a truncated backlog as incomplete", async () => {
  const candidate = {
    recordId: "rec_delete",
    leadCode: "TD-L-1",
    status: "未转化",
    submittedAt: NOW - LEAD_RETENTION_MS,
    expiresAt: NOW,
  };
  const gateway = makeGateway({
    async findExpiredLeads(options) {
      this.calls.retentionScan.push(options);
      return { items: [candidate], truncated: true };
    },
  });
  const { runtime } = makeRetentionRuntime({ gateway, config: { deleteEnabled: true } });
  const response = await callRetentionHandler(runtime);
  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.json(), {
    ok: false,
    mode: "delete",
    eligibleCount: 1,
    deletedCount: 1,
    skippedCount: 0,
    failedCount: 0,
    truncated: true,
  });
});

test("retention endpoint rejects missing authorization before a Base scan", async () => {
  const { runtime, gateway } = makeRetentionRuntime();
  const response = await callRetentionHandler(runtime, { headers: { authorization: "" } });
  assert.equal(response.statusCode, 401);
  assert.equal(response.json().code, "unauthorized");
  assert.equal(gateway.calls.retentionScan.length, 0);
});

test("unauthorized retention requests do not require or initialize Feishu credentials", async () => {
  const response = makeResponse();
  const handler = createRetentionHandler({
    env: {
      CRON_SECRET: "unit-test-retention-secret-at-least-32-characters",
      FEISHU_LEADS_RETENTION_ELIGIBLE_STATUSES: "未转化",
    },
  });
  await handler({ method: "GET", headers: {} }, response);
  assert.equal(response.statusCode, 401);
  assert.equal(response.json().code, "unauthorized");
});

test("retention endpoint exposes only the GET method required by Vercel Cron", async () => {
  const { runtime, gateway } = makeRetentionRuntime();
  const response = await callRetentionHandler(runtime, { method: "POST" });
  assert.equal(response.statusCode, 405);
  assert.equal(response.getHeader("allow"), "GET");
  assert.equal(gateway.calls.retentionScan.length, 0);
});

test("expired-lead scans request only non-phone fields and locally enforce the exact 90-day cutoff", async () => {
  const config = loadFeishuConfig(fakeFeishuEnv());
  const submittedAt = NOW - LEAD_RETENTION_MS - 1000;
  const calls = [];
  const sourceRecords = [{
    record_id: "rec_expired",
    created_time: String(submittedAt),
    fields: {
      [config.fields.code]: "TD-L-20260501-EXPIRED",
      [config.fields.status]: "未转化",
    },
  }, {
    record_id: "rec_not_expired",
    created_time: String(NOW - LEAD_RETENTION_MS + 1),
    fields: {
      [config.fields.code]: "TD-L-20260501-NOT-EXPIRED",
      [config.fields.status]: "未转化",
    },
  }];
  const fakeShanghaiExactDateStart = (value) => {
    assert.equal(value[0], "ExactDate");
    const timestamp = Number(value[1]);
    const dayMs = 24 * 60 * 60 * 1000;
    const utc8OffsetMs = 8 * 60 * 60 * 1000;
    return Math.floor((timestamp + utc8OffsetMs) / dayMs) * dayMs - utc8OffsetMs;
  };
  const response = (payload) => ({ ok: true, async json() { return payload; } });
  const gateway = createFeishuGateway(config, {
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      if (url.includes("tenant_access_token")) {
        return response({ code: 0, tenant_access_token: "unit-test-tenant-token", expire: 7200 });
      }
      const body = JSON.parse(init.body);
      const dateCondition = body.filter.conditions.find(
        (condition) => condition.field_name === config.fields.submittedAt,
      );
      const exclusiveDayStart = fakeShanghaiExactDateStart(dateCondition.value);
      const codeCondition = body.filter.conditions.find(
        (condition) => condition.field_name === config.fields.code,
      );
      const statusCondition = body.filter.conditions.find(
        (condition) => condition.field_name === config.fields.status,
      );
      const filteredItems = sourceRecords.filter((record) => (
        Number(record.created_time) < exclusiveDayStart
        && (!codeCondition || record.fields[config.fields.code] === codeCondition.value[0])
        && (!statusCondition || record.fields[config.fields.status] === statusCondition.value[0])
      ));
      return response({
        code: 0,
        data: {
          has_more: false,
          items: filteredItems,
        },
      });
    },
  });
  const result = await gateway.findExpiredLeads({
    expiresAtOrBefore: NOW,
    statuses: ["未转化"],
    limit: 10,
  });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].expiresAt, submittedAt + LEAD_RETENTION_MS);
  assert.equal(await gateway.confirmExpiredLead(result.items[0], {
    expiresAtOrBefore: NOW,
    statuses: ["未转化"],
  }), true);
  const searches = calls.filter((call) => call.url.includes("records/search"));
  assert.equal(searches.length, 2);
  for (const search of searches) {
    const searchBody = JSON.parse(search.init.body);
    assert.equal(searchBody.automatic_fields, true);
    assert.equal(searchBody.field_names.includes(config.fields.phone), false);
    assert.equal(searchBody.field_names.includes(config.fields.submittedAt), false);
    const dateCondition = searchBody.filter.conditions.find(
      (condition) => condition.field_name === config.fields.submittedAt,
    );
    assert.equal(dateCondition.operator, "isLess");
    assert.deepEqual(dateCondition.value, [
      "ExactDate",
      String(Date.parse("2026-05-26T00:00:00+08:00")),
    ]);
    assert.equal(JSON.stringify(searchBody).includes(PHONE), false);
  }
});
