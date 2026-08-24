import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { badRequest } from "./validation.js";

const scrypt = promisify(scryptCallback);

export const ADMIN_V2_COOKIE = "xh_admin_session";
export const ADMIN_V2_SESSION_SECONDS = 8 * 60 * 60;
export const DATA_SCOPES = ["organization", "campus", "team", "own"];

export const PERMISSIONS = [
  { key: "overview.view", module: "overview", action: "view", label: "查看工作台" },
  { key: "students.view", module: "students", action: "view", label: "查看学员" },
  { key: "students.create", module: "students", action: "create", label: "新增学员", sensitive: true },
  { key: "students.edit", module: "students", action: "edit", label: "编辑学员", sensitive: true },
  { key: "students.export", module: "students", action: "export", label: "导出学员数据", sensitive: true },
  { key: "classes.view", module: "students", action: "view_classes", label: "查看课堂记录" },
  { key: "classes.create", module: "students", action: "create_classes", label: "新增课堂记录" },
  { key: "classes.edit", module: "students", action: "edit_classes", label: "编辑课堂记录" },
  { key: "projects.view", module: "students", action: "view_projects", label: "查看成长项目" },
  { key: "projects.edit", module: "students", action: "edit_projects", label: "编辑成长项目" },
  { key: "projects.review", module: "students", action: "review_projects", label: "审核项目归属" },
  { key: "content.view", module: "content", action: "view", label: "查看内容与作品" },
  { key: "content.edit", module: "content", action: "edit", label: "编辑网站内容" },
  { key: "content.review", module: "content", action: "review", label: "审核内容与作品" },
  { key: "content.publish", module: "content", action: "publish", label: "发布或下线内容", sensitive: true },
  { key: "content.upload", module: "content", action: "upload", label: "上传网站媒体" },
  { key: "booking.view", module: "booking", action: "view", label: "查看预约与场地" },
  { key: "booking.manage", module: "booking", action: "manage", label: "管理时段与维护" },
  { key: "booking.cancel", module: "booking", action: "cancel", label: "取消预约", sensitive: true },
  { key: "devices.view", module: "devices", action: "view", label: "查看设备" },
  { key: "devices.manage", module: "devices", action: "manage", label: "配置设备", sensitive: true },
  { key: "agent.view", module: "devices", action: "view_agent", label: "查看 Agent 队列" },
  { key: "agent.retry", module: "devices", action: "retry", label: "重跑 Agent 任务" },
  { key: "agent.assign", module: "devices", action: "assign", label: "指定作品归属", sensitive: true },
  { key: "admin.users.view", module: "users", action: "view", label: "查看员工账号" },
  { key: "admin.users.manage", module: "users", action: "manage", label: "管理员工账号", sensitive: true },
  { key: "admin.roles.view", module: "roles", action: "view", label: "查看角色权限" },
  { key: "admin.roles.manage", module: "roles", action: "manage", label: "管理角色权限", sensitive: true },
  { key: "admin.audit.view", module: "audit", action: "view", label: "查看操作日志" },
  { key: "admin.audit.export", module: "audit", action: "export", label: "导出操作日志", sensitive: true },
];

const ALL_PERMISSION_KEYS = PERMISSIONS.map((permission) => permission.key);
const CAMPUS_PERMISSION_KEYS = ALL_PERMISSION_KEYS.filter((key) => !key.startsWith("admin."))
  .filter((key) => key !== "students.export" && key !== "devices.manage");
const TEACHER_PERMISSION_KEYS = [
  "overview.view",
  "students.view",
  "students.edit",
  "classes.view",
  "classes.create",
  "classes.edit",
  "projects.view",
  "projects.edit",
  "projects.review",
  "content.view",
  "content.review",
];
const CONTENT_PERMISSION_KEYS = [
  "overview.view",
  "content.view",
  "content.edit",
  "content.review",
  "content.publish",
  "content.upload",
];
const DEVICE_PERMISSION_KEYS = [
  "overview.view",
  "devices.view",
  "devices.manage",
  "agent.view",
  "agent.retry",
  "agent.assign",
];

export const SYSTEM_ROLES = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    key: "super_admin",
    name: "平台超级管理员",
    description: "全部组织、全部板块和系统安全配置",
    rank: 100,
    defaultScope: "organization",
    permissions: ALL_PERMISSION_KEYS,
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    key: "campus_admin",
    name: "校区管理员",
    description: "本校区教学、内容、预约和设备运营",
    rank: 70,
    defaultScope: "campus",
    permissions: CAMPUS_PERMISSION_KEYS,
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    key: "teacher",
    name: "老师",
    description: "本人负责的学员、课堂、项目与作品审核",
    rank: 40,
    defaultScope: "own",
    permissions: TEACHER_PERMISSION_KEYS,
  },
  {
    id: "00000000-0000-4000-8000-000000000004",
    key: "content_operator",
    name: "内容运营",
    description: "网站内容、作品审核与发布",
    rank: 40,
    defaultScope: "organization",
    permissions: CONTENT_PERMISSION_KEYS,
  },
  {
    id: "00000000-0000-4000-8000-000000000005",
    key: "device_operator",
    name: "设备运维",
    description: "课堂设备、Agent、存储和技术任务",
    rank: 40,
    defaultScope: "organization",
    permissions: DEVICE_PERMISSION_KEYS,
  },
];

export function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 160) {
    throw badRequest("邮箱格式不正确");
  }
  return email;
}

export function validatePassword(value) {
  const password = String(value || "");
  if (password.length < 12 || password.length > 200) {
    throw badRequest("密码长度应为 12–200 个字符");
  }
  return password;
}

export function validateDataScope(value) {
  const scope = String(value || "");
  if (!DATA_SCOPES.includes(scope)) throw badRequest("数据范围不正确");
  return scope;
}

export function roleDefinition(roleKey) {
  const role = SYSTEM_ROLES.find((item) => item.key === roleKey);
  if (!role) throw badRequest("角色不正确");
  return role;
}

export async function hashPassword(value) {
  const password = validatePassword(value);
  const salt = randomBytes(16);
  const cost = 16384;
  const blockSize = 8;
  const parallelization = 1;
  const derived = await scrypt(password, salt, 64, {
    N: cost,
    r: blockSize,
    p: parallelization,
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt$${cost}$${blockSize}$${parallelization}$${salt.toString("base64url")}$${Buffer.from(derived).toString("base64url")}`;
}

export async function passwordMatches(value, encoded) {
  try {
    const [algorithm, cost, blockSize, parallelization, saltValue, hashValue] = String(encoded || "").split("$");
    if (algorithm !== "scrypt") return false;
    const expected = Buffer.from(hashValue, "base64url");
    const derived = Buffer.from(await scrypt(String(value || ""), Buffer.from(saltValue, "base64url"), expected.length, {
      N: Number(cost),
      r: Number(blockSize),
      p: Number(parallelization),
      maxmem: 64 * 1024 * 1024,
    }));
    return expected.length === derived.length && timingSafeEqual(expected, derived);
  } catch {
    return false;
  }
}

export function newSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token) {
  return createHash("sha256").update(String(token || "")).digest("base64url");
}

export function cookieMap(req) {
  return Object.fromEntries(String(req?.headers?.cookie || "")
    .split(";")
    .map((part) => part.trim().split(/=(.*)/s).slice(0, 2))
    .filter(([key]) => key));
}

export function requestIsSecure(req) {
  const forwarded = String(req?.headers?.["x-forwarded-proto"] || "").split(",")[0].trim();
  const host = String(req?.headers?.host || "");
  return forwarded === "https" || (!host.startsWith("localhost") && !host.startsWith("127.0.0.1"));
}

export function createAdminSessionCookie(token, req, maxAge = ADMIN_V2_SESSION_SECONDS) {
  const secure = requestIsSecure(req) ? "; Secure" : "";
  return `${ADMIN_V2_COOKIE}=${token}; Path=/; HttpOnly${secure}; SameSite=Strict; Max-Age=${maxAge}`;
}

export function clearAdminSessionCookie(req) {
  const secure = requestIsSecure(req) ? "; Secure" : "";
  return `${ADMIN_V2_COOKIE}=; Path=/; HttpOnly${secure}; SameSite=Strict; Max-Age=0`;
}

export function resolveEffectivePermissions(basePermissions, overrides = [], now = new Date()) {
  const effective = new Set(basePermissions || []);
  for (const override of overrides || []) {
    if (override.expiresAt && new Date(override.expiresAt) <= now) continue;
    if (override.allowed) effective.add(override.permissionKey);
    else effective.delete(override.permissionKey);
  }
  return [...effective].sort();
}

export function modulesForPermissions(permissionKeys) {
  const allowed = new Set(permissionKeys || []);
  return [...new Set(PERMISSIONS.filter((permission) => allowed.has(permission.key)).map((permission) => permission.module))];
}

export function assertPermission(session, permissionKey) {
  if (!session?.permissions?.includes(permissionKey)) {
    throw badRequest("你没有执行这个操作的权限", 403);
  }
  if (permissionKey.startsWith("admin.") && session?.user?.dataScope !== "organization") {
    throw badRequest("系统管理权限只允许组织级数据范围使用", 403);
  }
  return session;
}

export function assertCanGrant(actorSession, desiredPermissions) {
  const actorPermissions = new Set(actorSession?.permissions || []);
  if ((desiredPermissions || []).some((permission) => !actorPermissions.has(permission))) {
    throw badRequest("不能授予超过当前账号的权限", 403);
  }
}

export function assertPermissionScopeCompatibility(permissionKeys, dataScope) {
  const scope = validateDataScope(dataScope);
  if (scope !== "organization" && (permissionKeys || []).some((permission) => permission.startsWith("admin."))) {
    throw badRequest("系统管理权限必须配合组织级数据范围", 400);
  }
  return scope;
}

export function assertCanGrantDataScope(actorSession, desiredScope, desiredCampusId = null, desiredScopeRef = null) {
  const scope = validateDataScope(desiredScope);
  const actorScope = validateDataScope(actorSession?.user?.dataScope || "own");
  const scopeRank = { own: 1, team: 2, campus: 3, organization: 4 };
  if (["campus", "team"].includes(actorScope) && !String(actorSession?.user?.campusId || "").trim()) {
    throw badRequest("当前账号缺少校区数据范围配置", 403);
  }
  if (actorScope === "team" && !String(actorSession?.user?.dataScopeRef || "").trim()) {
    throw badRequest("当前账号缺少团队数据范围配置", 403);
  }
  if (scopeRank[scope] > scopeRank[actorScope]) {
    throw badRequest("不能授予超过当前账号的数据范围", 403);
  }
  if (["campus", "team"].includes(scope) && !String(desiredCampusId || "").trim()) {
    throw badRequest("校区数据范围必须指定校区");
  }
  if (scope === "team" && !String(desiredScopeRef || "").trim()) {
    throw badRequest("团队数据范围必须指定团队");
  }
  if (actorScope !== "organization") {
    const actorCampusId = String(actorSession?.user?.campusId || "");
    const targetCampusId = String(desiredCampusId || "");
    if (actorCampusId && targetCampusId && actorCampusId !== targetCampusId) {
      throw badRequest("不能授予其他校区的数据范围", 403);
    }
    const actorScopeRef = String(actorSession?.user?.dataScopeRef || "");
    const targetScopeRef = String(desiredScopeRef || "");
    if (actorScope === "team" && scope === "team" && actorScopeRef && actorScopeRef !== targetScopeRef) {
      throw badRequest("不能授予其他团队的数据范围", 403);
    }
  }
  return scope;
}

export function publicPermissionCatalog() {
  return PERMISSIONS.map(({ key, module, action, label, sensitive = false }) => ({ key, module, action, label, sensitive }));
}
