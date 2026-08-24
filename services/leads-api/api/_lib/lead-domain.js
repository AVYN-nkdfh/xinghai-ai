const { createHmac, randomBytes } = require("node:crypto");

const LEAD_RETENTION_DAYS = 90;
const LEAD_RETENTION_MS = LEAD_RETENTION_DAYS * 24 * 60 * 60 * 1000;

const ALLOWED_FIELDS = new Set([
  "phone",
  "preferredTime",
  "consent",
  "internationalTransferConsent",
  "internationalTransferConsentVersion",
  "source",
  "privacyVersion",
  "turnstileToken",
  "company",
  "startedAt",
]);

const SOURCE_LABELS = Object.freeze({
  homepage: "首页",
  learning: "AI 学习力",
  create: "AI 创造力",
  works: "作品中心",
});

const CONTACT_TIME_LABELS = Object.freeze({
  anytime: "都可以",
  morning: "上午 9:00—12:00",
  afternoon: "下午 13:00—18:00",
  evening: "晚上 18:00—21:00",
});

class HttpError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = "HttpError";
    this.code = code;
    this.status = status;
  }
}

function cleanString(value, maxLength, fieldName) {
  if (typeof value !== "string") {
    throw new HttpError("invalid_payload", `${fieldName}格式不正确`);
  }
  const result = value.trim();
  if (result.length > maxLength) {
    throw new HttpError("invalid_payload", `${fieldName}填写内容过长`);
  }
  return result;
}

function normalizePhone(value) {
  const raw = cleanString(value, 24, "手机号");
  if (!/^[\d\s-]+$/.test(raw)) {
    throw new HttpError("invalid_phone", "请填写正确的 11 位手机号");
  }
  const phone = raw.replace(/[\s-]/g, "");
  if (!/^1[3-9]\d{9}$/.test(phone)) {
    throw new HttpError("invalid_phone", "请填写正确的 11 位手机号");
  }
  return phone;
}

function validateLeadPayload(body, options) {
  const {
    internationalTransferConsentVersion = options.privacyVersion,
    nowMs,
    privacyVersion,
  } = options;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError("invalid_payload", "提交内容格式不正确");
  }

  const unknownFields = Object.keys(body).filter((field) => !ALLOWED_FIELDS.has(field));
  if (unknownFields.length > 0) {
    throw new HttpError("unknown_fields", "提交内容包含不支持的字段");
  }

  const honeypot = cleanString(body.company ?? "", 120, "提交内容");
  if (honeypot) {
    throw new HttpError("bot_rejected", "提交未通过校验");
  }

  const phone = normalizePhone(body.phone);
  if (body.consent !== true) {
    throw new HttpError("consent_required", "请先同意本次咨询联系");
  }
  if (body.internationalTransferConsent !== true) {
    throw new HttpError(
      "international_transfer_consent_required",
      "请先同意本次提交所需的第三方服务",
    );
  }

  const source = cleanString(body.source, 32, "来源");
  if (!SOURCE_LABELS[source]) {
    throw new HttpError("invalid_source", "咨询来源不正确");
  }

  const submittedPrivacyVersion = cleanString(body.privacyVersion, 40, "隐私说明版本");
  if (submittedPrivacyVersion !== privacyVersion) {
    throw new HttpError(
      "privacy_version_changed",
      "隐私说明已更新，请刷新页面后重新确认",
      409,
    );
  }
  const submittedInternationalTransferConsentVersion = cleanString(
    body.internationalTransferConsentVersion,
    40,
    "第三方服务同意版本",
  );
  if (submittedInternationalTransferConsentVersion !== internationalTransferConsentVersion) {
    throw new HttpError(
      "international_transfer_consent_version_changed",
      "第三方服务说明已更新，请刷新页面后重新确认",
      409,
    );
  }

  let preferredTime = "";
  if (body.preferredTime !== undefined && body.preferredTime !== "") {
    preferredTime = cleanString(body.preferredTime, 24, "方便联系时间");
    if (!CONTACT_TIME_LABELS[preferredTime]) {
      throw new HttpError("invalid_preferred_time", "方便联系时间不正确");
    }
  }

  const turnstileToken = cleanString(body.turnstileToken, 2048, "安全验证");
  if (!turnstileToken) {
    throw new HttpError("turnstile_required", "请先完成安全验证");
  }

  if (!Number.isSafeInteger(body.startedAt)) {
    throw new HttpError("invalid_started_at", "页面状态已失效，请刷新后重试");
  }
  const formAgeMs = nowMs - body.startedAt;
  if (formAgeMs < 1200 || formAgeMs > 24 * 60 * 60 * 1000) {
    throw new HttpError("invalid_started_at", "页面状态已失效，请刷新后重试");
  }

  return {
    phone,
    internationalTransferConsent: true,
    internationalTransferConsentVersion: submittedInternationalTransferConsentVersion,
    preferredTime,
    preferredTimeLabel: preferredTime ? CONTACT_TIME_LABELS[preferredTime] : "都可以",
    source,
    sourceLabel: SOURCE_LABELS[source],
    privacyVersion: submittedPrivacyVersion,
    turnstileToken,
    startedAt: body.startedAt,
  };
}

function shanghaiDay(nowMs) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(nowMs));
}

function createIdempotencyKey(secret, lead, nowMs) {
  return createHmac("sha256", secret)
    .update(`${lead.phone}\n${lead.source}\n${lead.privacyVersion}\n${shanghaiDay(nowMs)}`)
    .digest("hex");
}

function createRateLimitKey(secret, remoteIp) {
  return createHmac("sha256", secret).update(String(remoteIp || "unknown")).digest("hex");
}

function createLeadCode(nowMs = Date.now()) {
  const day = shanghaiDay(nowMs).replaceAll("-", "");
  return `TD-L-${day}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

function createLeadExpiresAt(submittedAt) {
  if (!Number.isSafeInteger(submittedAt) || submittedAt < 0) {
    throw new TypeError("submittedAt must be a non-negative safe integer");
  }
  const expiresAt = submittedAt + LEAD_RETENTION_MS;
  if (!Number.isSafeInteger(expiresAt)) throw new RangeError("lead expiry exceeds the safe timestamp range");
  return expiresAt;
}

function maskPhone(phone) {
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

module.exports = {
  CONTACT_TIME_LABELS,
  HttpError,
  LEAD_RETENTION_DAYS,
  LEAD_RETENTION_MS,
  SOURCE_LABELS,
  createIdempotencyKey,
  createLeadCode,
  createLeadExpiresAt,
  createRateLimitKey,
  maskPhone,
  validateLeadPayload,
};
