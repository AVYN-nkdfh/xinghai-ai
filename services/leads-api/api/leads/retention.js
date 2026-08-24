const {
  ServiceError,
  createFeishuGateway,
  loadFeishuConfig,
} = require("../_lib/feishu-leads.js");
const {
  hasValidBearerToken,
  loadRetentionConfig,
} = require("../_lib/lead-retention.js");

function header(req, name) {
  const value = req.headers?.[name] ?? req.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : String(value || "");
}

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify(payload));
}

function createDefaultRuntime(env = process.env) {
  let gateway = null;
  return {
    config: loadRetentionConfig(env),
    get gateway() {
      if (!gateway) gateway = createFeishuGateway(loadFeishuConfig(env));
      return gateway;
    },
    logger: console,
    now: () => Date.now(),
  };
}

function createRetentionHandler(options = {}) {
  let runtime = options.runtime || null;

  function getRuntime() {
    if (!runtime) runtime = createDefaultRuntime(options.env || process.env);
    return runtime;
  }

  return async function retentionHandler(req, res) {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      json(res, 405, { ok: false, code: "method_not_allowed" });
      return;
    }

    try {
      const activeRuntime = getRuntime();
      if (!hasValidBearerToken(header(req, "authorization"), activeRuntime.config.jobSecret)) {
        throw new ServiceError("unauthorized", "清理任务鉴权失败", 401);
      }

      const nowMs = activeRuntime.now();
      const expiresAtOrBefore = nowMs + activeRuntime.config.safetyWindowMs;
      if (!Number.isSafeInteger(expiresAtOrBefore)) {
        throw new ServiceError("invalid_retention_cutoff", "清理截止时间超出安全范围");
      }
      const statuses = activeRuntime.config.eligibleStatuses;
      const scan = await activeRuntime.gateway.findExpiredLeads({
        expiresAtOrBefore,
        statuses,
        limit: activeRuntime.config.batchSize,
      });

      if (!activeRuntime.config.deleteEnabled) {
        json(res, 200, {
          ok: true,
          mode: "dry_run",
          eligibleCount: scan.items.length,
          truncated: scan.truncated,
        });
        return;
      }

      let deletedCount = 0;
      let failedCount = 0;
      let skippedCount = 0;
      for (const candidate of scan.items) {
        try {
          const stillEligible = await activeRuntime.gateway.confirmExpiredLead(candidate, {
            expiresAtOrBefore,
            statuses,
          });
          if (!stillEligible) {
            skippedCount += 1;
            continue;
          }
          await activeRuntime.gateway.deleteLead(candidate.recordId);
          deletedCount += 1;
        } catch (error) {
          failedCount += 1;
          activeRuntime.logger.error("lead_retention_delete_failed", {
            code: error?.code || "unknown",
          });
        }
      }

      const ok = failedCount === 0 && !scan.truncated;
      json(res, ok ? 200 : 503, {
        ok,
        mode: "delete",
        eligibleCount: scan.items.length,
        deletedCount,
        skippedCount,
        failedCount,
        truncated: scan.truncated,
      });
    } catch (error) {
      const status = Number.isInteger(error?.status) ? error.status : 503;
      const activeLogger = runtime?.logger || console;
      if (status >= 500) {
        activeLogger.error("lead_retention_failed", {
          code: error?.code || "unknown",
          status,
        });
      }
      json(res, status, {
        ok: false,
        code: status === 401 ? "unauthorized" : "service_unavailable",
      });
    }
  };
}

const handler = createRetentionHandler();

module.exports = handler;
module.exports.createDefaultRuntime = createDefaultRuntime;
module.exports.createRetentionHandler = createRetentionHandler;
