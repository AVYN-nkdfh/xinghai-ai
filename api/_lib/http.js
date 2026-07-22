export function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify(payload));
}

export function allowMethods(req, res, methods) {
  if (methods.includes(req.method)) return true;
  res.setHeader("Allow", methods.join(", "));
  json(res, 405, { error: "请求方式不支持" });
  return false;
}

export function bodyOf(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return {};
}

export function assertSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return;
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  let originHost = "";
  try { originHost = new URL(origin).host; } catch {}
  if (!host || originHost !== host) {
    const error = new Error("请求来源无效");
    error.status = 403;
    throw error;
  }
}

export function handleError(res, error) {
  console.error(error);
  const status = Number.isInteger(error.status) ? error.status : 500;
  json(res, status, { error: status >= 500 ? "服务暂时不可用，请稍后再试" : error.message });
}
