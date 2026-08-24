const FEISHU_API = "https://open.feishu.cn/open-apis";
const { LEAD_RETENTION_MS, createLeadExpiresAt } = require("./lead-domain.js");
const DAY_MS = 24 * 60 * 60 * 1000;
const SHANGHAI_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;

class ServiceError extends Error {
  constructor(code, message, status = 503) {
    super(message);
    this.name = "ServiceError";
    this.code = code;
    this.status = status;
  }
}

function requiredEnv(env, name) {
  const value = String(env[name] || "").trim();
  if (!value) throw new ServiceError("missing_configuration", `缺少服务配置：${name}`);
  return value;
}

function fieldName(env, envName, fallback) {
  return String(env[envName] || fallback).trim();
}

const FIELD_TYPES = Object.freeze({
  TEXT: 1,
  SINGLE_SELECT: 3,
  DATETIME: 5,
  CHECKBOX: 7,
  PHONE: 13,
  CREATED_TIME: 1001,
});

const FIELD_CONTRACT = Object.freeze({
  code: { acceptedTypes: [FIELD_TYPES.TEXT] },
  phone: { acceptedTypes: [FIELD_TYPES.TEXT, FIELD_TYPES.PHONE] },
  source: {
    acceptedTypes: [FIELD_TYPES.TEXT, FIELD_TYPES.SINGLE_SELECT],
    selectOptions: ["首页", "AI 学习力", "AI 创造力", "作品中心"],
  },
  preferredTime: {
    acceptedTypes: [FIELD_TYPES.TEXT, FIELD_TYPES.SINGLE_SELECT],
    selectOptions: ["都可以", "上午 9:00—12:00", "下午 13:00—18:00", "晚上 18:00—21:00"],
  },
  consent: { acceptedTypes: [FIELD_TYPES.CHECKBOX] },
  privacyVersion: { acceptedTypes: [FIELD_TYPES.TEXT] },
  internationalTransferConsent: { acceptedTypes: [FIELD_TYPES.CHECKBOX] },
  internationalTransferConsentVersion: { acceptedTypes: [FIELD_TYPES.TEXT] },
  idempotencyKey: { acceptedTypes: [FIELD_TYPES.TEXT] },
  status: {
    acceptedTypes: [FIELD_TYPES.TEXT, FIELD_TYPES.SINGLE_SELECT],
    selectOptions: ["待联系"],
  },
  notificationStatus: {
    acceptedTypes: [FIELD_TYPES.TEXT, FIELD_TYPES.SINGLE_SELECT],
    selectOptions: ["待推送", "已推送", "推送失败"],
  },
  submittedAt: { acceptedTypes: [FIELD_TYPES.CREATED_TIME] },
});

function assertUniqueFieldNames(fields) {
  const entries = Object.entries(fields);
  const missing = entries.filter(([, name]) => !name).map(([key]) => key);
  if (missing.length > 0) {
    throw new ServiceError("invalid_field_configuration", `飞书字段名不能为空：${missing.join(", ")}`);
  }
  const seen = new Map();
  const duplicates = [];
  for (const [key, name] of entries) {
    if (seen.has(name)) duplicates.push(`${seen.get(name)}/${key}`);
    else seen.set(name, key);
  }
  if (duplicates.length > 0) {
    throw new ServiceError("invalid_field_configuration", `飞书字段映射不能重复：${duplicates.join(", ")}`);
  }
}

function loadFeishuConfig(env) {
  const fields = {
    code: fieldName(env, "FEISHU_LEADS_FIELD_CODE", "线索编号"),
    phone: fieldName(env, "FEISHU_LEADS_FIELD_PHONE", "家长手机号"),
    source: fieldName(env, "FEISHU_LEADS_FIELD_SOURCE", "来源入口"),
    preferredTime: fieldName(env, "FEISHU_LEADS_FIELD_PREFERRED_TIME", "方便联系时间"),
    consent: fieldName(env, "FEISHU_LEADS_FIELD_CONSENT", "同意本次联系"),
    privacyVersion: fieldName(env, "FEISHU_LEADS_FIELD_PRIVACY_VERSION", "隐私版本"),
    internationalTransferConsent: fieldName(
      env,
      "FEISHU_LEADS_FIELD_INTERNATIONAL_TRANSFER_CONSENT",
      "同意境外处理",
    ),
    internationalTransferConsentVersion: fieldName(
      env,
      "FEISHU_LEADS_FIELD_INTERNATIONAL_TRANSFER_CONSENT_VERSION",
      "境外同意版本",
    ),
    idempotencyKey: fieldName(env, "FEISHU_LEADS_FIELD_IDEMPOTENCY_KEY", "幂等键"),
    status: fieldName(env, "FEISHU_LEADS_FIELD_STATUS", "跟进状态"),
    notificationStatus: fieldName(env, "FEISHU_LEADS_FIELD_NOTIFICATION_STATUS", "通知状态"),
    submittedAt: fieldName(env, "FEISHU_LEADS_FIELD_SUBMITTED_AT", "提交时间"),
  };
  assertUniqueFieldNames(fields);
  return {
    appId: requiredEnv(env, "FEISHU_APP_ID"),
    appSecret: requiredEnv(env, "FEISHU_APP_SECRET"),
    baseToken: requiredEnv(env, "FEISHU_LEADS_BASE_TOKEN"),
    tableId: requiredEnv(env, "FEISHU_LEADS_TABLE_ID"),
    chatId: requiredEnv(env, "FEISHU_LEADS_CHAT_ID"),
    baseUrl: requiredEnv(env, "FEISHU_LEADS_BASE_URL"),
    fields,
  };
}

async function fetchWithTimeout(fetchImpl, url, init, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new ServiceError("upstream_timeout", "外部服务响应超时");
    }
    throw new ServiceError("upstream_unavailable", "外部服务暂时不可用");
  } finally {
    clearTimeout(timer);
  }
}

async function responseJson(response, operation) {
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new ServiceError("upstream_invalid_response", `${operation}返回格式不正确`);
  }
  if (!response.ok || Number(payload.code || 0) !== 0) {
    throw new ServiceError("upstream_rejected", `${operation}失败`, 502);
  }
  return payload;
}

function readTextCell(value) {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    return value.map((item) => readTextCell(item?.text ?? item)).filter(Boolean).join("");
  }
  if (value && typeof value === "object" && typeof value.text === "string") return value.text;
  return "";
}

function readDateCell(value) {
  if (Number.isSafeInteger(value)) return value;
  if (typeof value === "string" && /^\d{10,13}$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed)) return parsed < 10_000_000_000 ? parsed * 1000 : parsed;
  }
  return NaN;
}

function fieldOptionNames(field) {
  return new Set(
    (Array.isArray(field?.property?.options) ? field.property.options : [])
      .map((option) => String(option?.name || "").trim())
      .filter(Boolean),
  );
}

function validateFeishuFieldContract(config, remoteFields, options = {}) {
  if (!Array.isArray(remoteFields)) {
    throw new ServiceError("invalid_field_contract", "飞书字段列表格式不正确", 502);
  }
  const byName = new Map(remoteFields.map((field) => [String(field?.field_name || "").trim(), field]));
  const retentionStatuses = Array.isArray(options.retentionStatuses) ? options.retentionStatuses : [];
  const problems = [];

  for (const [key, rule] of Object.entries(FIELD_CONTRACT)) {
    const name = config.fields[key];
    const field = byName.get(name);
    if (!field) {
      problems.push(`${name}：字段不存在`);
      continue;
    }
    if (!rule.acceptedTypes.includes(Number(field.type))) {
      problems.push(`${name}：字段类型 ${field.type} 不符合契约`);
      continue;
    }
    if (Number(field.type) === FIELD_TYPES.SINGLE_SELECT) {
      const requiredOptions = [
        ...(rule.selectOptions || []),
        ...(key === "status" ? retentionStatuses : []),
      ];
      const actualOptions = fieldOptionNames(field);
      const missingOptions = [...new Set(requiredOptions)].filter((option) => !actualOptions.has(option));
      if (missingOptions.length > 0) {
        problems.push(`${name}：缺少选项 ${missingOptions.join("、")}`);
      }
    }
  }

  if (problems.length > 0) {
    throw new ServiceError("invalid_field_contract", `飞书线索表字段契约不匹配：${problems.join("；")}`, 502);
  }
  return {
    checkedFieldCount: Object.keys(FIELD_CONTRACT).length,
    fieldNames: Object.keys(FIELD_CONTRACT).map((key) => config.fields[key]),
  };
}

function buildLeadFields(config, lead) {
  const fields = config.fields;
  return {
    [fields.code]: lead.leadCode,
    [fields.phone]: lead.phone,
    [fields.source]: lead.sourceLabel,
    [fields.preferredTime]: lead.preferredTimeLabel,
    [fields.consent]: true,
    [fields.privacyVersion]: lead.privacyVersion,
    [fields.internationalTransferConsent]: lead.internationalTransferConsent === true,
    [fields.internationalTransferConsentVersion]: lead.internationalTransferConsentVersion,
    [fields.idempotencyKey]: lead.idempotencyKey,
    [fields.status]: "待联系",
    [fields.notificationStatus]: "待推送",
  };
}

function exactDateFilterValue(timestampMs) {
  if (!Number.isSafeInteger(timestampMs) || timestampMs < 0) {
    throw new TypeError("timestampMs must be a non-negative safe integer");
  }
  return ["ExactDate", String(timestampMs)];
}

function nextShanghaiDayStart(timestampMs) {
  if (!Number.isSafeInteger(timestampMs) || timestampMs < 0) {
    throw new TypeError("timestampMs must be a non-negative safe integer");
  }
  const shanghaiTimestamp = timestampMs + SHANGHAI_UTC_OFFSET_MS;
  const nextDayStart = (Math.floor(shanghaiTimestamp / DAY_MS) + 1) * DAY_MS - SHANGHAI_UTC_OFFSET_MS;
  if (!Number.isSafeInteger(nextDayStart)) throw new RangeError("next day start exceeds the safe timestamp range");
  return nextDayStart;
}

function buildLeadMessage(config, lead) {
  return [
    "【官网新咨询】",
    `线索编号：${lead.leadCode}`,
    `家长手机号：${lead.maskedPhone}`,
    `来源入口：${lead.sourceLabel}`,
    `方便联系：${lead.preferredTimeLabel}`,
    `打开线索表：${config.baseUrl}`,
  ].join("\n");
}

function createFeishuGateway(config, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new ServiceError("missing_fetch", "当前运行环境不支持网络请求");
  }

  let cachedTenantToken = "";
  let cachedTenantTokenExpiresAt = 0;

  async function tenantAccessToken() {
    if (cachedTenantToken && Date.now() < cachedTenantTokenExpiresAt) return cachedTenantToken;
    const response = await fetchWithTimeout(fetchImpl, `${FEISHU_API}/auth/v3/tenant_access_token/internal`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ app_id: config.appId, app_secret: config.appSecret }),
    });
    const payload = await responseJson(response, "获取飞书访问凭证");
    cachedTenantToken = String(payload.tenant_access_token || "");
    if (!cachedTenantToken) throw new ServiceError("missing_tenant_token", "飞书没有返回访问凭证", 502);
    cachedTenantTokenExpiresAt = Date.now() + Math.max(60, Number(payload.expire || 7200) - 300) * 1000;
    return cachedTenantToken;
  }

  async function request(path, init = {}) {
    const token = await tenantAccessToken();
    const response = await fetchWithTimeout(fetchImpl, `${FEISHU_API}${path}`, {
      method: init.method || "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    return responseJson(response, "调用飞书");
  }

  function recordsPath(suffix = "") {
    return `/bitable/v1/apps/${encodeURIComponent(config.baseToken)}/tables/${encodeURIComponent(config.tableId)}/records${suffix}`;
  }

  async function searchRecords(body, options = {}) {
    const query = new URLSearchParams({ page_size: String(options.pageSize || 100) });
    if (options.pageToken) query.set("page_token", options.pageToken);
    return request(`${recordsPath("/search")}?${query.toString()}`, {
      method: "POST",
      body,
    });
  }

  async function listFields() {
    const fields = [];
    let pageToken = "";
    do {
      const query = new URLSearchParams({ page_size: "100" });
      if (pageToken) query.set("page_token", pageToken);
      const payload = await request(
        `/bitable/v1/apps/${encodeURIComponent(config.baseToken)}/tables/${encodeURIComponent(config.tableId)}/fields?${query.toString()}`,
      );
      fields.push(...(Array.isArray(payload.data?.items) ? payload.data.items : []));
      pageToken = payload.data?.has_more ? String(payload.data?.page_token || "") : "";
      if (payload.data?.has_more && !pageToken) {
        throw new ServiceError("invalid_pagination", "飞书字段列表缺少下一页标识", 502);
      }
    } while (pageToken);
    return fields;
  }

  async function validateFieldContract(options = {}) {
    return validateFeishuFieldContract(config, await listFields(), options);
  }

  async function findByIdempotencyKey(idempotencyKey) {
    const fields = config.fields;
    const payload = await searchRecords(
      {
        automatic_fields: false,
        field_names: [fields.code, fields.idempotencyKey],
        filter: {
          conjunction: "and",
          conditions: [
            {
              field_name: fields.idempotencyKey,
              operator: "is",
              value: [idempotencyKey],
            },
          ],
        },
      },
      { pageSize: 1 },
    );
    const record = payload.data?.items?.[0];
    if (!record) return null;
    const leadCode = readTextCell(record.fields?.[fields.code]);
    if (!leadCode) throw new ServiceError("invalid_lead_record", "已存在的线索缺少编号", 502);
    return { recordId: record.record_id, leadCode };
  }

  async function createLead(lead) {
    const payload = await request(
      recordsPath(),
      {
        method: "POST",
        body: { fields: buildLeadFields(config, lead) },
      },
    );
    const recordId = payload.data?.record?.record_id;
    if (!recordId) throw new ServiceError("missing_record_id", "飞书没有返回记录编号", 502);
    return { recordId };
  }

  async function updateNotificationStatus(recordId, status) {
    const fields = config.fields;
    await request(
      `/bitable/v1/apps/${encodeURIComponent(config.baseToken)}/tables/${encodeURIComponent(config.tableId)}/records/${encodeURIComponent(recordId)}`,
      {
        method: "PUT",
        body: { fields: { [fields.notificationStatus]: status } },
      },
    );
  }

  async function findExpiredLeads({ expiresAtOrBefore, statuses, limit = 50 }) {
    if (!Number.isSafeInteger(expiresAtOrBefore)) {
      throw new TypeError("expiresAtOrBefore must be a safe integer timestamp");
    }
    if (!Array.isArray(statuses) || statuses.length === 0 || statuses.some((status) => !String(status).trim())) {
      throw new TypeError("statuses must contain at least one non-empty value");
    }
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) {
      throw new TypeError("limit must be an integer between 1 and 200");
    }

    const fields = config.fields;
    const submittedAtOrBefore = expiresAtOrBefore - LEAD_RETENTION_MS;
    const cutoff = exactDateFilterValue(nextShanghaiDayStart(submittedAtOrBefore));
    const items = [];
    const seen = new Set();
    let truncated = false;

    for (let statusIndex = 0; statusIndex < statuses.length; statusIndex += 1) {
      const status = String(statuses[statusIndex]).trim();
      let pageToken = "";
      do {
        const remaining = limit - items.length;
        if (remaining <= 0) {
          truncated = true;
          break;
        }
        const payload = await searchRecords(
          {
            automatic_fields: true,
            field_names: [fields.code, fields.status],
            filter: {
              conjunction: "and",
              conditions: [
                { field_name: fields.status, operator: "is", value: [status] },
                { field_name: fields.submittedAt, operator: "isLess", value: cutoff },
              ],
            },
          },
          { pageSize: Math.min(100, remaining), pageToken },
        );
        for (const record of Array.isArray(payload.data?.items) ? payload.data.items : []) {
          const recordId = String(record?.record_id || "");
          const leadCode = readTextCell(record?.fields?.[fields.code]);
          const currentStatus = readTextCell(record?.fields?.[fields.status]);
          const submittedAt = readDateCell(record?.created_time);
          const expiresAt = Number.isSafeInteger(submittedAt) ? createLeadExpiresAt(submittedAt) : NaN;
          if (
            recordId
            && leadCode
            && currentStatus === status
            && Number.isSafeInteger(expiresAt)
            && expiresAt <= expiresAtOrBefore
            && !seen.has(recordId)
          ) {
            seen.add(recordId);
            items.push({ recordId, leadCode, status: currentStatus, submittedAt, expiresAt });
            if (items.length >= limit) break;
          }
        }
        const hasMore = Boolean(payload.data?.has_more);
        pageToken = hasMore ? String(payload.data?.page_token || "") : "";
        if (hasMore && !pageToken) {
          throw new ServiceError("invalid_pagination", "飞书线索列表缺少下一页标识", 502);
        }
        if (items.length >= limit && (hasMore || statusIndex < statuses.length - 1)) truncated = true;
      } while (pageToken && items.length < limit);
      if (items.length >= limit) break;
    }

    return { items, truncated };
  }

  async function confirmExpiredLead(candidate, { expiresAtOrBefore, statuses }) {
    const fields = config.fields;
    if (!candidate?.recordId || !candidate?.leadCode || !Number.isSafeInteger(expiresAtOrBefore)) return false;
    const payload = await searchRecords(
      {
        automatic_fields: true,
        field_names: [fields.code, fields.status],
        filter: {
          conjunction: "and",
          conditions: [
            { field_name: fields.code, operator: "is", value: [candidate.leadCode] },
            {
              field_name: fields.submittedAt,
              operator: "isLess",
              value: exactDateFilterValue(nextShanghaiDayStart(expiresAtOrBefore - LEAD_RETENTION_MS)),
            },
          ],
        },
      },
      { pageSize: 5 },
    );
    const allowedStatuses = new Set(statuses);
    return (Array.isArray(payload.data?.items) ? payload.data.items : []).some((record) => {
      const status = readTextCell(record?.fields?.[fields.status]);
      const submittedAt = readDateCell(record?.created_time);
      const expiresAt = Number.isSafeInteger(submittedAt) ? createLeadExpiresAt(submittedAt) : NaN;
      return record?.record_id === candidate.recordId
        && allowedStatuses.has(status)
        && Number.isSafeInteger(expiresAt)
        && expiresAt <= expiresAtOrBefore;
    });
  }

  async function deleteLead(recordId) {
    if (!recordId) throw new TypeError("recordId is required");
    await request(recordsPath(`/${encodeURIComponent(recordId)}`), { method: "DELETE" });
  }

  async function notify(lead) {
    await request("/im/v1/messages?receive_id_type=chat_id", {
      method: "POST",
      body: {
        receive_id: config.chatId,
        msg_type: "text",
        content: JSON.stringify({ text: buildLeadMessage(config, lead) }),
      },
    });
  }

  return {
    createLead,
    confirmExpiredLead,
    deleteLead,
    findByIdempotencyKey,
    findExpiredLeads,
    listFields,
    notify,
    updateNotificationStatus,
    validateFieldContract,
  };
}

module.exports = {
  FIELD_CONTRACT,
  FIELD_TYPES,
  ServiceError,
  buildLeadFields,
  buildLeadMessage,
  createFeishuGateway,
  exactDateFilterValue,
  loadFeishuConfig,
  validateFeishuFieldContract,
};
