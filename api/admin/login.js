import { createSessionCookie, passwordMatches } from "../_lib/auth.js";
import { allowMethods, assertSameOrigin, bodyOf, handleError, json } from "../_lib/http.js";
import { badRequest } from "../_lib/validation.js";

const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;

function attemptKey(req) {
  return String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["POST"])) return;
  try {
    assertSameOrigin(req);
    const key = attemptKey(req);
    const now = Date.now();
    const record = attempts.get(key);
    if (record && record.expiresAt > now && record.count >= 5) throw badRequest("尝试次数过多，请稍后再试", 429);
    const password = String(bodyOf(req).password || "");
    if (!passwordMatches(password)) {
      attempts.set(key, record && record.expiresAt > now ? { ...record, count: record.count + 1 } : { count: 1, expiresAt: now + WINDOW_MS });
      throw badRequest("管理员密码不正确", 401);
    }
    attempts.delete(key);
    res.setHeader("Set-Cookie", createSessionCookie());
    json(res, 200, { ok: true });
  } catch (error) {
    handleError(res, error);
  }
}
