import { assertPermission, publicPermissionCatalog } from "../_lib/admin-rbac.js";
import {
  createAdminUser,
  listAdminRoles,
  listAdminUsers,
  loadAdminSession,
  resetAdminUserPassword,
  serializeUser,
  setAdminUserStatus,
  updateAdminUserAccess,
} from "../_lib/admin-store.js";
import { allowMethods, assertSameOrigin, bodyOf, handleError, json } from "../_lib/http.js";
import { badRequest } from "../_lib/validation.js";

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["GET", "POST"])) return;
  try {
    const session = await loadAdminSession(req);
    if (req.method === "GET") {
      assertPermission(session, session.permissions.includes("admin.users.view")
        ? "admin.users.view"
        : "admin.users.manage");
      return json(res, 200, {
        users: await listAdminUsers(),
        roles: await listAdminRoles(),
        permissionCatalog: publicPermissionCatalog(),
      });
    }

    assertSameOrigin(req);
    assertPermission(session, "admin.users.manage");
    const body = bodyOf(req);
    if (body.action === "create") {
      const user = await createAdminUser({
        email: body.email,
        displayName: body.displayName,
        password: body.password,
        roleKey: body.roleKey,
        dataScope: body.dataScope,
        dataScopeRef: body.dataScopeRef,
        campusId: body.campusId,
        desiredPermissions: body.permissions,
        actorSession: session,
        req,
      });
      return json(res, 201, { ok: true, user: serializeUser(user) });
    }
    if (body.action === "updateAccess") {
      if (!Array.isArray(body.permissions)) throw badRequest("账号权限不正确");
      await updateAdminUserAccess({
        userId: body.userId,
        roleKey: body.roleKey,
        dataScope: body.dataScope,
        dataScopeRef: body.dataScopeRef,
        campusId: body.campusId,
        desiredPermissions: body.permissions,
        actorSession: session,
        req,
      });
      return json(res, 200, { ok: true });
    }
    if (body.action === "setStatus") {
      await setAdminUserStatus({
        userId: body.userId,
        status: body.status,
        actorSession: session,
        req,
      });
      return json(res, 200, { ok: true });
    }
    if (body.action === "resetPassword") {
      await resetAdminUserPassword({
        userId: body.userId,
        password: body.password,
        actorSession: session,
        req,
      });
      return json(res, 200, { ok: true });
    }
    throw badRequest("操作类型不正确");
  } catch (error) {
    handleError(res, error);
  }
}
