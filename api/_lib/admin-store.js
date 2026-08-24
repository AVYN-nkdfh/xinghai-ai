import { createHash, randomUUID } from "node:crypto";
import { db } from "./db.js";
import { badRequest } from "./validation.js";
import { ensureAdminSchema } from "./admin-schema.js";
import {
  ADMIN_V2_COOKIE,
  ADMIN_V2_SESSION_SECONDS,
  assertCanGrant,
  assertCanGrantDataScope,
  assertPermissionScopeCompatibility,
  cookieMap,
  hashPassword,
  hashSessionToken,
  newSessionToken,
  normalizeEmail,
  passwordMatches,
  resolveEffectivePermissions,
  validateDataScope,
} from "./admin-rbac.js";

function text(value, label, maxLength = 120) {
  const result = String(value || "").trim();
  if (!result || result.length > maxLength) throw badRequest(`${label}不正确`);
  return result;
}

function optionalText(value, maxLength = 160) {
  const result = String(value || "").trim();
  if (result.length > maxLength) throw badRequest("字段内容过长");
  return result || null;
}

function uuid(value, label = "编号") {
  const result = String(value || "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)) {
    throw badRequest(`${label}不正确`);
  }
  return result;
}

function requestIp(req) {
  return String(req?.headers?.["x-forwarded-for"] || req?.socket?.remoteAddress || "")
    .split(",")[0].trim().slice(0, 80) || null;
}

function requestUserAgent(req) {
  return String(req?.headers?.["user-agent"] || "").slice(0, 500) || null;
}

function requestId(req) {
  return String(req?.headers?.["x-vercel-id"] || req?.headers?.["x-request-id"] || "").slice(0, 160) || null;
}

function serializeUser(row) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    status: row.status,
    role: {
      id: row.role_id,
      key: row.role_key,
      name: row.role_name,
      rank: row.role_rank,
      isSystem: row.role_is_system,
    },
    dataScope: row.data_scope,
    dataScopeRef: row.data_scope_ref,
    campusId: row.campus_id,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function adminAuditQuery(sql, {
  req,
  actorUserId = null,
  action,
  module,
  targetType = null,
  targetId = null,
  result = "success",
  details = {},
}) {
  return sql`INSERT INTO admin_audit_logs (
    actor_user_id, action, module_key, target_type, target_id, result,
    details, ip_address, request_id
  ) VALUES (
    ${actorUserId}::uuid, ${text(action, "操作类型", 100)}, ${text(module, "模块", 60)},
    ${optionalText(targetType, 80)}, ${optionalText(targetId, 160)}, ${result},
    ${JSON.stringify(details || {})}::jsonb, ${requestIp(req)}, ${requestId(req)}
  )`;
}

export async function writeAdminAudit(options) {
  await ensureAdminSchema();
  await adminAuditQuery(db(), options);
}

export async function findAdminUserByEmail(email) {
  await ensureAdminSchema();
  const rows = await db()`SELECT
      user_account.*,
      role.role_key, role.name AS role_name, role.rank AS role_rank, role.is_system AS role_is_system
    FROM admin_users AS user_account
    JOIN admin_roles AS role ON role.id = user_account.role_id
    WHERE lower(user_account.email) = ${normalizeEmail(email)}
    LIMIT 1`;
  return rows[0] || null;
}

async function roleRow(roleKey) {
  const key = String(roleKey || "").trim().toLowerCase();
  if (!/^[a-z][a-z0-9_]{1,50}$/.test(key)) throw badRequest("角色不正确");
  const rows = await db()`SELECT * FROM admin_roles WHERE role_key = ${key} LIMIT 1`;
  if (!rows.length) throw badRequest("角色不存在", 404);
  return rows[0];
}

export async function createAdminUser({
  email,
  displayName,
  password,
  roleKey,
  dataScope,
  dataScopeRef = null,
  campusId = null,
  desiredPermissions = null,
  actorSession = null,
  actorUserId = null,
  req = null,
}) {
  await ensureAdminSchema();
  const normalizedEmail = normalizeEmail(email);
  const role = await roleRow(roleKey);
  if (actorSession && role.rank > actorSession.user.role.rank) {
    throw badRequest("不能分配高于当前账号的角色", 403);
  }
  const scope = validateDataScope(dataScope || role.default_data_scope || "own");
  if (actorSession) assertCanGrantDataScope(actorSession, scope, campusId, dataScopeRef);
  if (!Array.isArray(desiredPermissions) && desiredPermissions != null) throw badRequest("账号权限不正确");
  const rolePermissions = await basePermissions(role.id);
  const desired = desiredPermissions == null ? rolePermissions : [...new Set(desiredPermissions)];
  const knownPermissions = new Set((await db()`SELECT permission_key FROM admin_permissions`).map((row) => row.permission_key));
  if (desired.some((permission) => !knownPermissions.has(permission))) throw badRequest("包含未知权限");
  assertPermissionScopeCompatibility(desired, scope);
  if (actorSession) assertCanGrant(actorSession, desired);
  const rolePermissionSet = new Set(rolePermissions);
  const overrides = [...knownPermissions]
    .filter((permission) => desired.includes(permission) !== rolePermissionSet.has(permission))
    .map((permission) => ({ permission_key: permission, allowed: desired.includes(permission) }));
  const passwordHash = await hashPassword(password);
  const id = randomUUID();
  try {
    const sql = db();
    const [rows] = await sql.transaction([
      sql`INSERT INTO admin_users (
        id, email, display_name, password_hash, role_id,
        data_scope, data_scope_ref, campus_id
      ) VALUES (
        ${id}::uuid, ${normalizedEmail}, ${text(displayName, "员工姓名", 80)}, ${passwordHash}, ${role.id}::uuid,
        ${scope}, ${optionalText(dataScopeRef)}, ${optionalText(campusId, 80)}
      ) RETURNING *`,
      ...(overrides.length ? [sql`INSERT INTO admin_user_permission_overrides (
        user_id, permission_key, allowed, reason, created_by
      ) SELECT
        ${id}::uuid, item.permission_key, item.allowed, 'user_create', ${actorSession?.user?.id || actorUserId}::uuid
        FROM jsonb_to_recordset(${JSON.stringify(overrides)}::jsonb)
          AS item(permission_key text, allowed boolean)`] : []),
      adminAuditQuery(sql, {
        req,
        actorUserId: actorSession?.user?.id || actorUserId,
        action: "admin_user.create",
        module: "users",
        targetType: "admin_user",
        targetId: id,
        details: { roleKey, dataScope: scope, overrideCount: overrides.length },
      }),
    ]);
    return { ...rows[0], role_key: role.role_key, role_name: role.name, role_rank: role.rank, role_is_system: role.is_system };
  } catch (error) {
    if (error?.code === "23505") throw badRequest("这个邮箱已经存在", 409);
    throw error;
  }
}

export async function listAdminUsers() {
  await ensureAdminSchema();
  const rows = await db()`SELECT
      user_account.*,
      role.role_key, role.name AS role_name, role.rank AS role_rank, role.is_system AS role_is_system
    FROM admin_users AS user_account
    JOIN admin_roles AS role ON role.id = user_account.role_id
    ORDER BY CASE user_account.status WHEN 'active' THEN 0 ELSE 1 END,
      role.rank DESC, user_account.display_name`;
  const overrides = await db()`SELECT user_id, permission_key, allowed, reason, expires_at
    FROM admin_user_permission_overrides
    ORDER BY user_id, permission_key`;
  const grouped = Map.groupBy ? Map.groupBy(overrides, (item) => item.user_id) : overrides.reduce((map, item) => {
    const current = map.get(item.user_id) || [];
    current.push(item);
    map.set(item.user_id, current);
    return map;
  }, new Map());
  return rows.map((row) => ({
    ...serializeUser(row),
    permissionOverrides: (grouped.get(row.id) || []).map((item) => ({
      permissionKey: item.permission_key,
      allowed: item.allowed,
      reason: item.reason,
      expiresAt: item.expires_at,
    })),
  }));
}

export async function listAdminRoles() {
  await ensureAdminSchema();
  const [roles, permissions] = await Promise.all([
    db()`SELECT id, role_key, name, description, rank, default_data_scope, is_system, created_at, updated_at
      FROM admin_roles ORDER BY rank DESC, name`,
    db()`SELECT role_id, permission_key FROM admin_role_permissions ORDER BY role_id, permission_key`,
  ]);
  const grouped = permissions.reduce((map, item) => {
    const current = map.get(item.role_id) || [];
    current.push(item.permission_key);
    map.set(item.role_id, current);
    return map;
  }, new Map());
  return roles.map((role) => ({
    id: role.id,
    key: role.role_key,
    name: role.name,
    description: role.description,
    rank: role.rank,
    defaultDataScope: role.default_data_scope,
    isSystem: role.is_system,
    permissions: grouped.get(role.id) || [],
    createdAt: role.created_at,
    updatedAt: role.updated_at,
  }));
}

async function basePermissions(roleId) {
  const rows = await db()`SELECT permission_key FROM admin_role_permissions WHERE role_id = ${roleId}::uuid`;
  return rows.map((row) => row.permission_key);
}

async function permissionOverrides(userId) {
  const rows = await db()`SELECT permission_key, allowed, expires_at
    FROM admin_user_permission_overrides WHERE user_id = ${userId}::uuid`;
  return rows.map((row) => ({
    permissionKey: row.permission_key,
    allowed: row.allowed,
    expiresAt: row.expires_at,
  }));
}

export async function createAdminSession(userRow, req) {
  await ensureAdminSchema();
  const token = newSessionToken();
  const tokenHash = hashSessionToken(token);
  const sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + ADMIN_V2_SESSION_SECONDS * 1000);
  const sql = db();
  await sql.transaction([
    sql`INSERT INTO admin_sessions (
      id, user_id, token_hash, expires_at, ip_address, user_agent
    ) VALUES (
      ${sessionId}::uuid, ${userRow.id}::uuid, ${tokenHash}, ${expiresAt.toISOString()},
      ${requestIp(req)}, ${requestUserAgent(req)}
    )`,
    sql`UPDATE admin_users SET last_login_at = now(), updated_at = now() WHERE id = ${userRow.id}::uuid`,
    adminAuditQuery(sql, {
      req,
      actorUserId: userRow.id,
      action: "admin_session.login",
      module: "auth",
      targetType: "admin_session",
      targetId: sessionId,
    }),
  ]);
  return { token, sessionId, expiresAt };
}

export async function authenticateAdminCredentials(email, password) {
  const user = await findAdminUserByEmail(email);
  if (!user || user.status !== "active" || !(await passwordMatches(password, user.password_hash))) {
    throw badRequest("邮箱或密码不正确", 401);
  }
  return user;
}

export async function loadAdminSession(req) {
  await ensureAdminSchema();
  const token = cookieMap(req)[ADMIN_V2_COOKIE];
  if (!token) throw badRequest("请先登录统一后台", 401);
  const rows = await db()`SELECT
      session.id AS session_id, session.expires_at,
      user_account.*,
      role.role_key, role.name AS role_name, role.rank AS role_rank, role.is_system AS role_is_system
    FROM admin_sessions AS session
    JOIN admin_users AS user_account ON user_account.id = session.user_id
    JOIN admin_roles AS role ON role.id = user_account.role_id
    WHERE session.token_hash = ${hashSessionToken(token)}
      AND session.revoked_at IS NULL
      AND session.expires_at > now()
      AND user_account.status = 'active'
    LIMIT 1`;
  if (!rows.length) throw badRequest("登录已过期，请重新登录", 401);
  const row = rows[0];
  await db()`UPDATE admin_sessions SET last_seen_at = now()
    WHERE id = ${row.session_id}::uuid AND last_seen_at < now() - interval '5 minutes'`;
  const permissions = resolveEffectivePermissions(
    await basePermissions(row.role_id),
    await permissionOverrides(row.id),
  );
  return {
    sessionId: row.session_id,
    expiresAt: row.expires_at,
    user: serializeUser(row),
    permissions,
  };
}

export async function revokeAdminSession(req, sessionId = null) {
  await ensureAdminSchema();
  const token = cookieMap(req)[ADMIN_V2_COOKIE];
  if (!token && !sessionId) return;
  if (sessionId) {
    await db()`UPDATE admin_sessions SET revoked_at = now() WHERE id = ${uuid(sessionId, "会话编号")}::uuid`;
  } else {
    await db()`UPDATE admin_sessions SET revoked_at = now()
      WHERE token_hash = ${hashSessionToken(token)} AND revoked_at IS NULL`;
  }
}

export async function updateAdminUserAccess({
  userId,
  roleKey,
  dataScope,
  dataScopeRef = null,
  campusId = null,
  desiredPermissions,
  actorSession,
  req,
}) {
  await ensureAdminSchema();
  const id = uuid(userId, "员工编号");
  const currentRows = await db()`SELECT user_account.id, user_account.role_id, role.role_key, role.rank AS role_rank
    FROM admin_users AS user_account JOIN admin_roles AS role ON role.id = user_account.role_id
    WHERE user_account.id = ${id}::uuid LIMIT 1`;
  if (!currentRows.length) throw badRequest("员工不存在", 404);
  const current = currentRows[0];
  if (current.role_rank > actorSession.user.role.rank) throw badRequest("不能修改高于当前账号的管理员", 403);
  const nextRole = await roleRow(roleKey);
  if (nextRole.rank > actorSession.user.role.rank) throw badRequest("不能分配高于当前账号的角色", 403);
  const scope = assertCanGrantDataScope(actorSession, dataScope, campusId, dataScopeRef);
  if (!Array.isArray(desiredPermissions)) throw badRequest("账号权限不正确");
  const knownPermissions = new Set((await db()`SELECT permission_key FROM admin_permissions`).map((row) => row.permission_key));
  const desired = [...new Set(desiredPermissions || [])];
  if (desired.some((permission) => !knownPermissions.has(permission))) throw badRequest("包含未知权限");
  assertPermissionScopeCompatibility(desired, scope);
  assertCanGrant(actorSession, desired);
  const nextBase = new Set(await basePermissions(nextRole.id));
  const overrides = [...knownPermissions]
    .filter((permission) => desired.includes(permission) !== nextBase.has(permission))
    .map((permission) => ({ permission_key: permission, allowed: desired.includes(permission) }));

  const scopeRef = optionalText(dataScopeRef);
  const selectedCampusId = optionalText(campusId, 80);
  const auditDetails = JSON.stringify({ roleKey, dataScope: scope, overrideCount: overrides.length });
  const sql = db();
  const [, auditRows] = await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(hashtext('unified-admin-super-admin-safety'))`,
    sql`WITH updated AS (
        UPDATE admin_users AS target SET
          role_id = ${nextRole.id}::uuid,
          data_scope = ${scope},
          data_scope_ref = ${scopeRef},
          campus_id = ${selectedCampusId},
          updated_at = now()
        WHERE target.id = ${id}::uuid
          AND EXISTS (
            SELECT 1 FROM admin_roles AS current_role
            WHERE current_role.id = target.role_id AND current_role.rank <= ${actorSession.user.role.rank}
          )
          AND (
            ${roleKey} = 'super_admin'
            OR NOT EXISTS (
              SELECT 1 FROM admin_roles AS current_role
              WHERE current_role.id = target.role_id AND current_role.role_key = 'super_admin'
            )
            OR EXISTS (
              SELECT 1
              FROM admin_users AS other_user
              JOIN admin_roles AS other_role ON other_role.id = other_user.role_id
              WHERE other_user.status = 'active'
                AND other_role.role_key = 'super_admin'
                AND other_user.id <> target.id
            )
          )
        RETURNING target.id
      ), cleared AS (
        DELETE FROM admin_user_permission_overrides
        WHERE user_id IN (SELECT id FROM updated)
      ), inserted AS (
        INSERT INTO admin_user_permission_overrides (
          user_id, permission_key, allowed, reason, created_by
        ) SELECT
          updated.id, item.permission_key, item.allowed, 'user_access_update', ${actorSession.user.id}::uuid
        FROM updated
        CROSS JOIN jsonb_to_recordset(${JSON.stringify(overrides)}::jsonb)
          AS item(permission_key text, allowed boolean)
      )
      INSERT INTO admin_audit_logs (
        actor_user_id, action, module_key, target_type, target_id, result,
        details, ip_address, request_id
      )
      SELECT
        ${actorSession.user.id}::uuid, 'admin_user.access.update', 'users',
        'admin_user', updated.id::text, 'success', ${auditDetails}::jsonb,
        ${requestIp(req)}, ${requestId(req)}
      FROM updated
      RETURNING id`,
  ], { isolationMode: "ReadCommitted" });
  if (!auditRows.length) throw badRequest("不能降级最后一名超级管理员或修改更高权限账号", 409);
  return { ok: true };
}

export async function setAdminUserStatus({ userId, status, actorSession, req }) {
  await ensureAdminSchema();
  const id = uuid(userId, "员工编号");
  if (!["active", "disabled"].includes(status)) throw badRequest("账号状态不正确");
  const rows = await db()`SELECT user_account.id, role.role_key, role.rank AS role_rank
    FROM admin_users AS user_account JOIN admin_roles AS role ON role.id = user_account.role_id
    WHERE user_account.id = ${id}::uuid LIMIT 1`;
  if (!rows.length) throw badRequest("员工不存在", 404);
  if (rows[0].role_rank > actorSession.user.role.rank) throw badRequest("不能修改高于当前账号的管理员", 403);
  const sql = db();
  const [, auditRows] = await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(hashtext('unified-admin-super-admin-safety'))`,
    sql`WITH updated AS (
        UPDATE admin_users AS target SET status = ${status}, updated_at = now()
        WHERE target.id = ${id}::uuid
          AND EXISTS (
            SELECT 1 FROM admin_roles AS current_role
            WHERE current_role.id = target.role_id AND current_role.rank <= ${actorSession.user.role.rank}
          )
          AND (
            ${status} <> 'disabled'
            OR NOT EXISTS (
              SELECT 1 FROM admin_roles AS current_role
              WHERE current_role.id = target.role_id AND current_role.role_key = 'super_admin'
            )
            OR EXISTS (
              SELECT 1
              FROM admin_users AS other_user
              JOIN admin_roles AS other_role ON other_role.id = other_user.role_id
              WHERE other_user.status = 'active'
                AND other_role.role_key = 'super_admin'
                AND other_user.id <> target.id
            )
          )
        RETURNING target.id
      ), revoked AS (
        UPDATE admin_sessions SET revoked_at = now()
        WHERE ${status} = 'disabled'
          AND user_id IN (SELECT id FROM updated)
          AND revoked_at IS NULL
      )
      INSERT INTO admin_audit_logs (
        actor_user_id, action, module_key, target_type, target_id, result,
        details, ip_address, request_id
      )
      SELECT
        ${actorSession.user.id}::uuid, ${`admin_user.${status}`}, 'users',
        'admin_user', updated.id::text, 'success', '{}'::jsonb,
        ${requestIp(req)}, ${requestId(req)}
      FROM updated
      RETURNING id`,
  ], { isolationMode: "ReadCommitted" });
  if (!auditRows.length) throw badRequest("不能停用最后一名超级管理员或修改更高权限账号", 409);
  return { ok: true };
}

export async function resetAdminUserPassword({ userId, password, actorSession, req }) {
  await ensureAdminSchema();
  const id = uuid(userId, "员工编号");
  const rows = await db()`SELECT user_account.id, role.rank AS role_rank
    FROM admin_users AS user_account JOIN admin_roles AS role ON role.id = user_account.role_id
    WHERE user_account.id = ${id}::uuid LIMIT 1`;
  if (!rows.length) throw badRequest("员工不存在", 404);
  if (rows[0].role_rank > actorSession.user.role.rank) throw badRequest("不能修改高于当前账号的管理员", 403);
  const passwordHash = await hashPassword(password);
  const sql = db();
  await sql.transaction([
    sql`UPDATE admin_users SET password_hash = ${passwordHash}, password_changed_at = now(), updated_at = now()
      WHERE id = ${id}::uuid`,
    sql`UPDATE admin_sessions SET revoked_at = now() WHERE user_id = ${id}::uuid AND revoked_at IS NULL`,
    adminAuditQuery(sql, {
      req,
      actorUserId: actorSession.user.id,
      action: "admin_user.password.reset",
      module: "users",
      targetType: "admin_user",
      targetId: id,
    }),
  ]);
  return { ok: true };
}

export async function saveAdminRole({
  roleId = null,
  key,
  name,
  description = "",
  rank = 20,
  permissions,
  actorSession,
  req,
}) {
  await ensureAdminSchema();
  const desiredPermissions = [...new Set(permissions || [])];
  const knownPermissions = new Set((await db()`SELECT permission_key FROM admin_permissions`).map((row) => row.permission_key));
  if (!desiredPermissions.length || desiredPermissions.some((permission) => !knownPermissions.has(permission))) {
    throw badRequest("角色权限不正确");
  }
  const safeRank = Number(rank);
  if (!Number.isInteger(safeRank) || safeRank < 0 || safeRank > actorSession.user.role.rank) {
    throw badRequest("角色等级不正确");
  }

  let id = roleId ? uuid(roleId, "角色编号") : randomUUID();
  let roleKey = String(key || "").trim().toLowerCase();
  if (roleId) {
    const rows = await db()`SELECT id, role_key, rank, is_system FROM admin_roles WHERE id = ${id}::uuid LIMIT 1`;
    if (!rows.length) throw badRequest("角色不存在", 404);
    if (rows[0].is_system) throw badRequest("系统角色不能直接修改，请使用个人权限覆盖", 409);
    if (rows[0].rank > actorSession.user.role.rank) throw badRequest("不能修改高于当前账号的角色", 403);
    roleKey = rows[0].role_key;
  } else if (!/^custom_[a-z0-9_]{2,40}$/.test(roleKey)) {
    throw badRequest("自定义角色标识应以 custom_ 开头");
  }

  const roleName = text(name, "角色名称", 80);
  const roleDescription = optionalText(description, 240) || "";
  const permissionRows = desiredPermissions.map((permissionKey) => ({ permission_key: permissionKey }));
  assertCanGrant(actorSession, desiredPermissions);
  const sql = db();
  try {
    await sql.transaction([
      roleId
        ? sql`UPDATE admin_roles SET name = ${roleName}, description = ${roleDescription}, rank = ${safeRank}, updated_at = now()
          WHERE id = ${id}::uuid AND is_system = false`
        : sql`INSERT INTO admin_roles (id, role_key, name, description, rank, is_system)
          VALUES (${id}::uuid, ${roleKey}, ${roleName}, ${roleDescription}, ${safeRank}, false)`,
      sql`DELETE FROM admin_role_permissions WHERE role_id = ${id}::uuid`,
      sql`INSERT INTO admin_role_permissions (role_id, permission_key)
        SELECT ${id}::uuid, permission_key
        FROM jsonb_to_recordset(${JSON.stringify(permissionRows)}::jsonb)
          AS item(permission_key text)`,
      adminAuditQuery(sql, {
        req,
        actorUserId: actorSession.user.id,
        action: roleId ? "admin_role.update" : "admin_role.create",
        module: "roles",
        targetType: "admin_role",
        targetId: id,
        details: { roleKey, rank: safeRank, permissionCount: desiredPermissions.length },
      }),
    ]);
  } catch (error) {
    if (error?.code === "23505") throw badRequest("角色标识已经存在", 409);
    throw error;
  }
  return { id, key: roleKey, name: roleName, permissions: desiredPermissions };
}

export async function listAdminAudit({ limit = 100, module = null, actorUserId = null } = {}) {
  await ensureAdminSchema();
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 200);
  const actor = actorUserId ? uuid(actorUserId, "员工编号") : null;
  const moduleKey = optionalText(module, 60);
  const rows = await db()`SELECT
      audit.id, audit.action, audit.module_key, audit.target_type, audit.target_id,
      audit.result, audit.details, audit.ip_address, audit.request_id, audit.created_at,
      user_account.id AS actor_id, user_account.display_name AS actor_name, user_account.email AS actor_email
    FROM admin_audit_logs AS audit
    LEFT JOIN admin_users AS user_account ON user_account.id = audit.actor_user_id
    WHERE (${moduleKey}::text IS NULL OR audit.module_key = ${moduleKey})
      AND (${actor}::uuid IS NULL OR audit.actor_user_id = ${actor}::uuid)
    ORDER BY audit.created_at DESC
    LIMIT ${safeLimit}`;
  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    module: row.module_key,
    targetType: row.target_type,
    targetId: row.target_id,
    result: row.result,
    details: row.details,
    ipAddress: row.ip_address,
    requestId: row.request_id,
    createdAt: row.created_at,
    actor: row.actor_id ? { id: row.actor_id, name: row.actor_name, email: row.actor_email } : null,
  }));
}

function loginAttemptKey(req, email) {
  return createHash("sha256")
    .update(`${requestIp(req) || "unknown"}\n${String(email || "").trim().toLowerCase().slice(0, 160)}`)
    .digest("base64url");
}

export async function assertAdminLoginAllowed(req, email) {
  await ensureAdminSchema();
  const key = loginAttemptKey(req, email);
  const rows = await db()`SELECT blocked_until FROM admin_login_attempts
    WHERE attempt_key = ${key} AND expires_at > now() LIMIT 1`;
  if (rows[0]?.blocked_until && new Date(rows[0].blocked_until) > new Date()) {
    throw badRequest("尝试次数过多，请 15 分钟后再试", 429);
  }
  return key;
}

export async function recordAdminLoginFailure(req, email) {
  await ensureAdminSchema();
  const key = loginAttemptKey(req, email);
  const rows = await db()`INSERT INTO admin_login_attempts (
      attempt_key, failure_count, window_started_at, blocked_until, expires_at, updated_at
    ) VALUES (${key}, 1, now(), NULL, now() + interval '15 minutes', now())
    ON CONFLICT (attempt_key) DO UPDATE SET
      failure_count = CASE
        WHEN admin_login_attempts.expires_at <= now() THEN 1
        ELSE admin_login_attempts.failure_count + 1
      END,
      window_started_at = CASE
        WHEN admin_login_attempts.expires_at <= now() THEN now()
        ELSE admin_login_attempts.window_started_at
      END,
      blocked_until = CASE
        WHEN admin_login_attempts.expires_at <= now() THEN NULL
        WHEN admin_login_attempts.failure_count + 1 >= 5 THEN now() + interval '15 minutes'
        ELSE admin_login_attempts.blocked_until
      END,
      expires_at = CASE
        WHEN admin_login_attempts.expires_at <= now() THEN now() + interval '15 minutes'
        WHEN admin_login_attempts.failure_count + 1 >= 5 THEN now() + interval '15 minutes'
        ELSE admin_login_attempts.expires_at
      END,
      updated_at = now()
    RETURNING failure_count, blocked_until`;
  return rows[0];
}

export async function clearAdminLoginFailures(req, email) {
  await ensureAdminSchema();
  await db()`DELETE FROM admin_login_attempts WHERE attempt_key = ${loginAttemptKey(req, email)}`;
}

export { serializeUser };
