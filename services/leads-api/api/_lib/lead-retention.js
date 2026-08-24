const { timingSafeEqual } = require("node:crypto");
const { ServiceError } = require("./feishu-leads.js");

const MAX_RETENTION_BATCH_SIZE = 100;
const DEFAULT_RETENTION_SAFETY_WINDOW_MINUTES = 26 * 60;
const MAX_RETENTION_SAFETY_WINDOW_MINUTES = 48 * 60;
const PROTECTED_LEAD_STATUSES = new Set(["已转化", "已成交", "正式客户", "在读"]);

function splitStatuses(rawValue) {
  const statuses = [...new Set(
    String(rawValue || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  )];
  if (statuses.length === 0) {
    throw new ServiceError(
      "invalid_configuration",
      "FEISHU_LEADS_RETENTION_ELIGIBLE_STATUSES 至少需要一个明确的未转化状态",
    );
  }
  const protectedStatuses = statuses.filter((status) => PROTECTED_LEAD_STATUSES.has(status));
  if (protectedStatuses.length > 0) {
    throw new ServiceError(
      "invalid_configuration",
      `到期删除状态不能包含已转化或在读状态：${protectedStatuses.join("、")}`,
    );
  }
  return statuses;
}

function parseBatchSize(rawValue) {
  if (rawValue === undefined || rawValue === null || String(rawValue).trim() === "") return 50;
  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_RETENTION_BATCH_SIZE) {
    throw new ServiceError(
      "invalid_configuration",
      `LEADS_RETENTION_BATCH_SIZE 必须是 1—${MAX_RETENTION_BATCH_SIZE} 的整数`,
    );
  }
  return value;
}

function parseSafetyWindowMinutes(rawValue) {
  if (rawValue === undefined || rawValue === null || String(rawValue).trim() === "") {
    return DEFAULT_RETENTION_SAFETY_WINDOW_MINUTES;
  }
  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_RETENTION_SAFETY_WINDOW_MINUTES) {
    throw new ServiceError(
      "invalid_configuration",
      `LEADS_RETENTION_SAFETY_WINDOW_MINUTES 必须是 0—${MAX_RETENTION_SAFETY_WINDOW_MINUTES} 的整数`,
    );
  }
  return value;
}

function loadRetentionConfig(env) {
  const cronSecret = String(env.CRON_SECRET || "").trim();
  const legacyJobSecret = String(env.LEADS_RETENTION_JOB_SECRET || "").trim();
  const jobSecret = cronSecret || legacyJobSecret;
  if (!jobSecret) {
    throw new ServiceError(
      "missing_configuration",
      "缺少服务配置：CRON_SECRET（或兼容变量 LEADS_RETENTION_JOB_SECRET）",
    );
  }
  if (jobSecret.length < 32) {
    throw new ServiceError("invalid_configuration", "CRON_SECRET 至少需要 32 个字符");
  }
  if (jobSecret === String(env.LEADS_IDEMPOTENCY_SECRET || "").trim()) {
    throw new ServiceError("invalid_configuration", "到期清理密钥不能复用线索幂等密钥");
  }

  const deleteSetting = String(env.LEADS_RETENTION_DELETE_ENABLED || "false").trim();
  if (deleteSetting !== "true" && deleteSetting !== "false") {
    throw new ServiceError("invalid_configuration", "LEADS_RETENTION_DELETE_ENABLED 只能是 true 或 false");
  }
  const production = env.VERCEL_ENV === "production" || env.REQUIRE_PRODUCTION_CONFIG === "1";
  if (production && deleteSetting !== "true") {
    throw new ServiceError(
      "invalid_configuration",
      "正式环境必须显式设置 LEADS_RETENTION_DELETE_ENABLED=true",
    );
  }
  const safetyWindowMinutes = parseSafetyWindowMinutes(env.LEADS_RETENTION_SAFETY_WINDOW_MINUTES);
  if (production && safetyWindowMinutes < DEFAULT_RETENTION_SAFETY_WINDOW_MINUTES) {
    throw new ServiceError(
      "invalid_configuration",
      `当前每日调度的正式环境需要至少 ${DEFAULT_RETENTION_SAFETY_WINDOW_MINUTES} 分钟的提前清理安全窗口`,
    );
  }

  return {
    batchSize: parseBatchSize(env.LEADS_RETENTION_BATCH_SIZE),
    deleteEnabled: deleteSetting === "true",
    eligibleStatuses: splitStatuses(env.FEISHU_LEADS_RETENTION_ELIGIBLE_STATUSES),
    jobSecret,
    safetyWindowMs: safetyWindowMinutes * 60 * 1000,
    safetyWindowMinutes,
  };
}

function hasValidBearerToken(rawHeader, expectedSecret) {
  const actual = Buffer.from(String(rawHeader || ""), "utf8");
  const expected = Buffer.from(`Bearer ${expectedSecret}`, "utf8");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

module.exports = {
  MAX_RETENTION_BATCH_SIZE,
  DEFAULT_RETENTION_SAFETY_WINDOW_MINUTES,
  MAX_RETENTION_SAFETY_WINDOW_MINUTES,
  PROTECTED_LEAD_STATUSES,
  hasValidBearerToken,
  loadRetentionConfig,
  parseSafetyWindowMinutes,
  splitStatuses,
};
