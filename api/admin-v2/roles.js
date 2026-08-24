import { assertCanGrant, assertPermission, publicPermissionCatalog } from "../_lib/admin-rbac.js";
import { listAdminRoles, loadAdminSession, saveAdminRole } from "../_lib/admin-store.js";
import { allowMethods, assertSameOrigin, bodyOf, handleError, json } from "../_lib/http.js";
import { badRequest } from "../_lib/validation.js";

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["GET", "POST"])) return;
  try {
    const session = await loadAdminSession(req);
    if (req.method === "GET") {
      assertPermission(session, session.permissions.includes("admin.roles.view")
        ? "admin.roles.view"
        : "admin.roles.manage");
      return json(res, 200, {
        roles: await listAdminRoles(),
        permissionCatalog: publicPermissionCatalog(),
      });
    }

    assertSameOrigin(req);
    assertPermission(session, "admin.roles.manage");
    const body = bodyOf(req);
    if (body.action !== "save" || !Array.isArray(body.permissions)) throw badRequest("角色内容不正确");
    assertCanGrant(session, body.permissions);
    const role = await saveAdminRole({
      roleId: body.roleId,
      key: body.key,
      name: body.name,
      description: body.description,
      rank: body.rank,
      permissions: body.permissions,
      actorSession: session,
      req,
    });
    return json(res, body.roleId ? 200 : 201, { ok: true, role });
  } catch (error) {
    handleError(res, error);
  }
}
