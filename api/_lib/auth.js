import { createHmac, timingSafeEqual } from "node:crypto";
import { badRequest } from "./validation.js";

const COOKIE_NAME = "xh_booking_admin";
const SESSION_SECONDS = 8 * 60 * 60;

function secret() {
  if (!process.env.SESSION_SECRET) throw new Error("SESSION_SECRET is not configured");
  return process.env.SESSION_SECRET;
}

function sign(value) {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function passwordMatches(password) {
  if (!process.env.ADMIN_PASSWORD) throw new Error("ADMIN_PASSWORD is not configured");
  return safeEqual(password, process.env.ADMIN_PASSWORD);
}

export function createSessionCookie() {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS })).toString("base64url");
  return `${COOKIE_NAME}=${payload}.${sign(payload)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_SECONDS}`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export function requireAdmin(req) {
  const cookies = Object.fromEntries(String(req.headers.cookie || "").split(";").map((part) => part.trim().split(/=(.*)/s).slice(0, 2)).filter(([key]) => key));
  const token = cookies[COOKIE_NAME];
  if (!token) throw badRequest("请先登录管理后台", 401);
  const [payload, signature] = token.split(".");
  if (!payload || !signature || !safeEqual(signature, sign(payload))) throw badRequest("登录已过期，请重新登录", 401);
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!session.exp || session.exp < Math.floor(Date.now() / 1000)) throw new Error("expired");
  } catch {
    throw badRequest("登录已过期，请重新登录", 401);
  }
}
