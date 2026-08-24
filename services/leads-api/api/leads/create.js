const {
  HttpError,
  createIdempotencyKey,
  createLeadCode,
  createRateLimitKey,
  maskPhone,
  validateLeadPayload,
} = require("../_lib/lead-domain.js");
const {
  ServiceError,
  createFeishuGateway,
  loadFeishuConfig,
} = require("../_lib/feishu-leads.js");
const { splitStatuses } = require("../_lib/lead-retention.js");

const MAX_BODY_BYTES = 4096;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 6;

function requiredEnv(env, name) {
  const value = String(env[name] || "").trim();
  if (!value) throw new ServiceError("missing_configuration", `缺少服务配置：${name}`);
  return value;
}

function splitCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeAllowedOrigin(value, requireHttps = false) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new ServiceError("invalid_configuration", "LEADS_ALLOWED_ORIGINS 配置不正确");
  }
  if (
    !/^https?:$/.test(url.protocol)
    || (requireHttps && url.protocol !== "https:")
    || url.username
    || url.password
    || url.pathname !== "/"
    || url.search
    || url.hash
  ) {
    throw new ServiceError("invalid_configuration", "LEADS_ALLOWED_ORIGINS 配置不正确");
  }
  return url.origin;
}

function previewDeploymentHostname(env) {
  if (env.VERCEL_ENV !== "preview") return "";
  const rawValue = requiredEnv(env, "VERCEL_URL").toLowerCase();
  if (rawValue.includes(":") || rawValue.includes("/") || rawValue.includes("*") || rawValue.includes("@")) {
    throw new ServiceError("invalid_configuration", "VERCEL_URL 配置不正确");
  }
  let url;
  try {
    url = new URL(`https://${rawValue}`);
  } catch {
    throw new ServiceError("invalid_configuration", "VERCEL_URL 配置不正确");
  }
  if (url.hostname !== rawValue || url.pathname !== "/" || url.search || url.hash) {
    throw new ServiceError("invalid_configuration", "VERCEL_URL 配置不正确");
  }
  return url.hostname;
}

function loadRuntimeConfig(env) {
  const vercelEnvironment = String(env.VERCEL_ENV || "").trim();
  if (vercelEnvironment && !new Set(["production", "preview", "development"]).has(vercelEnvironment)) {
    throw new ServiceError("invalid_configuration", "VERCEL_ENV 配置不正确");
  }
  const preview = vercelEnvironment === "preview";
  const production = vercelEnvironment
    ? vercelEnvironment === "production"
    : env.NODE_ENV === "production";
  const turnstileTestModeRequested = env.LEADS_TURNSTILE_TEST_MODE === "true";
  if (turnstileTestModeRequested && !preview) {
    throw new ServiceError(
      "invalid_configuration",
      "LEADS_TURNSTILE_TEST_MODE 仅允许用于 Preview",
    );
  }
  const previewHostname = previewDeploymentHostname(env);
  const allowedOrigins = new Set(
    splitCsv(requiredEnv(env, "LEADS_ALLOWED_ORIGINS"))
      .map((origin) => normalizeAllowedOrigin(origin, production || preview)),
  );
  if (previewHostname) allowedOrigins.add(`https://${previewHostname}`);
  const privacyVersion = requiredEnv(env, "LEADS_PRIVACY_VERSION");
  const expectedFunctionRegion = production || preview
    ? requiredEnv(env, "LEADS_EXPECTED_FUNCTION_REGION").toLowerCase()
    : String(env.LEADS_EXPECTED_FUNCTION_REGION || "").trim().toLowerCase();
  if (expectedFunctionRegion && !/^[a-z]{3}\d$/.test(expectedFunctionRegion)) {
    throw new ServiceError("invalid_configuration", "LEADS_EXPECTED_FUNCTION_REGION 配置不正确");
  }
  const actualFunctionRegion = String(env.VERCEL_REGION || "").trim().toLowerCase();
  if (
    (production || preview)
    && actualFunctionRegion
    && actualFunctionRegion !== expectedFunctionRegion
  ) {
    throw new ServiceError(
      "invalid_configuration",
      `线索函数实际区域 ${actualFunctionRegion} 与已审核区域 ${expectedFunctionRegion} 不一致`,
    );
  }
  const internationalTransferConsentVersion = production || preview
    ? requiredEnv(env, "LEADS_INTERNATIONAL_TRANSFER_CONSENT_VERSION")
    : String(env.LEADS_INTERNATIONAL_TRANSFER_CONSENT_VERSION || "").trim();
  if (
    (production || preview)
    && internationalTransferConsentVersion !== privacyVersion
  ) {
    throw new ServiceError(
      "invalid_configuration",
      "LEADS_INTERNATIONAL_TRANSFER_CONSENT_VERSION 必须与 LEADS_PRIVACY_VERSION 一致",
    );
  }
  const rawRetentionStatuses = String(env.FEISHU_LEADS_RETENTION_ELIGIBLE_STATUSES || "").trim();
  const retentionStatuses = production || preview || rawRetentionStatuses
    ? splitStatuses(rawRetentionStatuses)
    : [];
  const idempotencySecret = requiredEnv(env, "LEADS_IDEMPOTENCY_SECRET");
  if (idempotencySecret.length < 32) {
    throw new ServiceError("invalid_configuration", "LEADS_IDEMPOTENCY_SECRET 至少需要 32 个字符");
  }

  const bypassTurnstile = !production && !preview && env.LEADS_TURNSTILE_BYPASS === "true";
  const turnstileSecret = bypassTurnstile ? "" : requiredEnv(env, "TURNSTILE_SECRET_KEY");
  const turnstileHostnames = bypassTurnstile
    ? new Set()
    : new Set(splitCsv(requiredEnv(env, "TURNSTILE_ALLOWED_HOSTNAMES")).map((value) => value.toLowerCase()));
  if (previewHostname) turnstileHostnames.add(previewHostname);
  const turnstileAction = bypassTurnstile
    ? ""
    : String(env.TURNSTILE_EXPECTED_ACTION || "lead_submit").trim();
  if (!bypassTurnstile && !turnstileAction) {
    throw new ServiceError("invalid_configuration", "TURNSTILE_EXPECTED_ACTION 配置不正确");
  }

  return {
    allowedOrigins,
    bypassTurnstile,
    idempotencySecret,
    expectedFunctionRegion,
    internationalTransferConsentVersion,
    preview,
    privacyVersion,
    production,
    requireOrigin: production || preview,
    retentionStatuses,
    turnstileAction,
    turnstileHostnames,
    turnstileSecret,
    turnstileTestMode: preview && turnstileTestModeRequested,
  };
}

async function fetchWithTimeout(fetchImpl, url, init, timeoutMs = 6000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new ServiceError("turnstile_unavailable", "安全验证服务响应超时");
    }
    throw new ServiceError("turnstile_unavailable", "安全验证服务暂时不可用");
  } finally {
    clearTimeout(timer);
  }
}

function createTurnstileVerifier(config, fetchImpl = globalThis.fetch) {
  if (config.bypassTurnstile) return async () => true;
  if (typeof fetchImpl !== "function") {
    throw new ServiceError("missing_fetch", "当前运行环境不支持安全验证");
  }

  return async ({ token, remoteIp }) => {
    const form = new URLSearchParams({
      secret: config.turnstileSecret,
      response: token,
    });
    if (remoteIp && remoteIp !== "unknown") form.set("remoteip", remoteIp);

    const response = await fetchWithTimeout(
      fetchImpl,
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      },
    );

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new ServiceError("turnstile_invalid_response", "安全验证服务返回格式不正确");
    }
    if (!response.ok) {
      throw new ServiceError("turnstile_unavailable", "安全验证服务暂时不可用");
    }
    if (!payload.success) {
      throw new HttpError("turnstile_failed", "安全验证已失效，请重新验证");
    }

    const hostname = String(payload.hostname || "").toLowerCase();
    const officialTestingResult = payload.metadata?.result_with_testing_key === true;
    if (officialTestingResult) {
      if (
        !config.turnstileTestMode
        || hostname !== "example.com"
        || String(payload.action || "") !== ""
      ) {
        throw new HttpError("turnstile_failed", "安全验证测试来源不正确");
      }
      return true;
    }
    if (!config.turnstileHostnames.has(hostname)) {
      throw new HttpError("turnstile_failed", "安全验证来源不正确");
    }
    if (String(payload.action || "") !== config.turnstileAction) {
      throw new HttpError("turnstile_failed", "安全验证用途不正确");
    }
    return true;
  };
}

function createDefaultRuntime(env = process.env) {
  const config = loadRuntimeConfig(env);
  if (
    (config.production || config.preview)
    && !String(env.VERCEL_REGION || "").trim()
  ) {
    throw new ServiceError("missing_configuration", "运行时缺少 VERCEL_REGION，无法核对线索处理区域");
  }
  const gateway = createFeishuGateway(loadFeishuConfig(env));
  return {
    config,
    gateway,
    logger: console,
    now: () => Date.now(),
    verifyTurnstile: createTurnstileVerifier(config),
  };
}

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify(payload));
}

function header(req, name) {
  const value = req.headers?.[name] ?? req.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : String(value || "");
}

function assertAndApplyOrigin(req, res, config) {
  const rawOrigin = header(req, "origin");
  if (!rawOrigin) {
    if (config.requireOrigin) throw new HttpError("origin_required", "请求来源无效", 403);
    return;
  }

  let origin;
  try {
    origin = new URL(rawOrigin).origin;
  } catch {
    throw new HttpError("invalid_origin", "请求来源无效", 403);
  }
  if (origin !== rawOrigin || !config.allowedOrigins.has(origin)) {
    throw new HttpError("invalid_origin", "请求来源无效", 403);
  }
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "600");
  res.setHeader("Vary", "Origin");
}

function assertJsonContentType(req) {
  const contentType = header(req, "content-type").toLowerCase();
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/.test(contentType)) {
    throw new HttpError("unsupported_media_type", "请使用 JSON 格式提交", 415);
  }
}

async function readBody(req) {
  const declaredLength = Number(header(req, "content-length") || 0);
  if (!Number.isFinite(declaredLength) || declaredLength < 0) {
    throw new HttpError("invalid_content_length", "提交内容格式不正确");
  }
  if (declaredLength > MAX_BODY_BYTES) {
    throw new HttpError("payload_too_large", "提交内容过大", 413);
  }

  if (req.body !== undefined) {
    if (Buffer.isBuffer(req.body)) {
      if (req.body.byteLength > MAX_BODY_BYTES) throw new HttpError("payload_too_large", "提交内容过大", 413);
      try {
        return JSON.parse(req.body.toString("utf8"));
      } catch {
        throw new HttpError("invalid_json", "提交内容格式不正确");
      }
    }
    if (typeof req.body === "string") {
      if (Buffer.byteLength(req.body, "utf8") > MAX_BODY_BYTES) {
        throw new HttpError("payload_too_large", "提交内容过大", 413);
      }
      try {
        return JSON.parse(req.body);
      } catch {
        throw new HttpError("invalid_json", "提交内容格式不正确");
      }
    }
    if (typeof req.body === "object" && req.body !== null) {
      let serialized;
      try {
        serialized = JSON.stringify(req.body);
      } catch {
        throw new HttpError("invalid_json", "提交内容格式不正确");
      }
      if (Buffer.byteLength(serialized, "utf8") > MAX_BODY_BYTES) {
        throw new HttpError("payload_too_large", "提交内容过大", 413);
      }
      return req.body;
    }
    throw new HttpError("invalid_json", "提交内容格式不正确");
  }

  if (!req || typeof req[Symbol.asyncIterator] !== "function") {
    throw new HttpError("invalid_json", "提交内容格式不正确");
  }
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.byteLength;
    if (bytes > MAX_BODY_BYTES) throw new HttpError("payload_too_large", "提交内容过大", 413);
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError("invalid_json", "提交内容格式不正确");
  }
}

function requestIp(req) {
  return (
    header(req, "x-forwarded-for").split(",")[0].trim()
    || header(req, "x-real-ip").trim()
    || req.socket?.remoteAddress
    || "unknown"
  );
}

function createRateLimiter(config, now) {
  const buckets = new Map();
  return (remoteIp) => {
    const nowMs = now();
    const key = createRateLimitKey(config.idempotencySecret, remoteIp);
    const bucket = buckets.get(key);
    if (!bucket || nowMs - bucket.startedAt >= RATE_LIMIT_WINDOW_MS) {
      buckets.set(key, { count: 1, startedAt: nowMs });
    } else {
      bucket.count += 1;
      if (bucket.count > RATE_LIMIT_MAX) {
        throw new HttpError("rate_limited", "提交过于频繁，请稍后再试", 429);
      }
    }
    if (buckets.size > 1000) {
      for (const [bucketKey, value] of buckets) {
        if (nowMs - value.startedAt >= RATE_LIMIT_WINDOW_MS) buckets.delete(bucketKey);
      }
    }
  };
}

function createHandler(options = {}) {
  let runtime = options.runtime || null;
  let rateLimiter = null;
  let fieldContractPromise = null;
  const inFlight = new Map();

  function getRuntime() {
    if (!runtime) runtime = createDefaultRuntime(options.env || process.env);
    if (!rateLimiter) rateLimiter = createRateLimiter(runtime.config, runtime.now);
    return runtime;
  }

  async function ensureFieldContract(activeRuntime) {
    if (!fieldContractPromise) {
      fieldContractPromise = Promise.resolve().then(() => activeRuntime.gateway.validateFieldContract({
        retentionStatuses: activeRuntime.config.retentionStatuses || [],
      }));
    }
    const pendingContract = fieldContractPromise;
    try {
      return await pendingContract;
    } catch (error) {
      if (fieldContractPromise === pendingContract) fieldContractPromise = null;
      throw new ServiceError(
        error?.code || "field_contract_unavailable",
        "线索字段契约校验未通过",
        503,
      );
    }
  }

  async function createOrFindLead(activeRuntime, lead, nowMs) {
    const idempotencyKey = createIdempotencyKey(
      activeRuntime.config.idempotencySecret,
      lead,
      nowMs,
    );
    const existingPromise = inFlight.get(idempotencyKey);
    if (existingPromise) return existingPromise;

    const operation = (async () => {
      const existing = await activeRuntime.gateway.findByIdempotencyKey(idempotencyKey);
      if (existing) return { duplicate: true, leadCode: existing.leadCode };

      const storedLead = {
        phone: lead.phone,
        preferredTime: lead.preferredTime,
        preferredTimeLabel: lead.preferredTimeLabel,
        source: lead.source,
        sourceLabel: lead.sourceLabel,
        privacyVersion: lead.privacyVersion,
        internationalTransferConsent: lead.internationalTransferConsent,
        internationalTransferConsentVersion: lead.internationalTransferConsentVersion,
        idempotencyKey,
        leadCode: createLeadCode(nowMs),
        maskedPhone: maskPhone(lead.phone),
        submittedAt: nowMs,
      };
      const { recordId } = await activeRuntime.gateway.createLead(storedLead);

      try {
        await activeRuntime.gateway.notify({
          leadCode: storedLead.leadCode,
          maskedPhone: storedLead.maskedPhone,
          sourceLabel: storedLead.sourceLabel,
          preferredTimeLabel: storedLead.preferredTimeLabel,
        });
        try {
          await activeRuntime.gateway.updateNotificationStatus(recordId, "已推送");
        } catch (error) {
          activeRuntime.logger.error("lead_notification_status_update_failed", {
            code: error?.code || "unknown",
          });
        }
      } catch (error) {
        activeRuntime.logger.error("lead_notification_failed", { code: error?.code || "unknown" });
        try {
          await activeRuntime.gateway.updateNotificationStatus(recordId, "推送失败");
        } catch (statusError) {
          activeRuntime.logger.error("lead_notification_status_update_failed", {
            code: statusError?.code || "unknown",
          });
        }
      }

      return { duplicate: false, leadCode: storedLead.leadCode };
    })();

    inFlight.set(idempotencyKey, operation);
    try {
      return await operation;
    } finally {
      if (inFlight.get(idempotencyKey) === operation) inFlight.delete(idempotencyKey);
    }
  }

  return async function handler(req, res) {
    try {
      const activeRuntime = getRuntime();
      assertAndApplyOrigin(req, res, activeRuntime.config);

      if (req.method === "OPTIONS") {
        res.statusCode = 204;
        res.setHeader("Cache-Control", "no-store");
        res.end();
        return;
      }
      if (req.method !== "POST") {
        res.setHeader("Allow", "POST, OPTIONS");
        throw new HttpError("method_not_allowed", "请求方式不支持", 405);
      }

      assertJsonContentType(req);
      const remoteIp = requestIp(req);
      rateLimiter(remoteIp);
      const nowMs = activeRuntime.now();
      const body = await readBody(req);
      const lead = validateLeadPayload(body, {
        internationalTransferConsentVersion: activeRuntime.config.internationalTransferConsentVersion,
        nowMs,
        privacyVersion: activeRuntime.config.privacyVersion,
      });
      await activeRuntime.verifyTurnstile({ token: lead.turnstileToken, remoteIp });
      await ensureFieldContract(activeRuntime);
      const result = await createOrFindLead(activeRuntime, lead, nowMs);

      json(res, result.duplicate ? 200 : 201, {
        ok: true,
        leadCode: result.leadCode,
        status: "received",
      });
    } catch (error) {
      const status = Number.isInteger(error?.status) ? error.status : 503;
      if (status === 429) res.setHeader("Retry-After", "600");
      const activeLogger = runtime?.logger || console;
      activeLogger.error("lead_create_failed", {
        code: error?.code || "unknown",
        status,
      });
      json(res, status, {
        ok: false,
        code: status >= 500 ? "service_unavailable" : error.code || "invalid_request",
        error: status >= 500
          ? "暂时没有提交成功，请稍后重试或直接使用微信咨询"
          : error.message,
      });
    }
  };
}

const handler = createHandler();

module.exports = handler;
module.exports.createDefaultRuntime = createDefaultRuntime;
module.exports.createHandler = createHandler;
module.exports.createTurnstileVerifier = createTurnstileVerifier;
module.exports.loadRuntimeConfig = loadRuntimeConfig;
module.exports.previewDeploymentHostname = previewDeploymentHostname;
module.exports.readBody = readBody;
