import {
  DATA_SCOPES,
  modulesForPermissions,
  publicPermissionCatalog,
} from "../_lib/admin-rbac.js";
import { listAdminRoles, loadAdminSession } from "../_lib/admin-store.js";
import { allowMethods, handleError, json } from "../_lib/http.js";

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["GET"])) return;
  try {
    const session = await loadAdminSession(req);
    const canConfigureAccess = session.permissions.some((permission) => [
      "admin.users.manage",
      "admin.roles.view",
      "admin.roles.manage",
    ].includes(permission));
    json(res, 200, {
      apiVersion: "admin-v2",
      user: session.user,
      permissions: session.permissions,
      modules: modulesForPermissions(session.permissions),
      expiresAt: session.expiresAt,
      accessConfiguration: canConfigureAccess ? {
        dataScopes: DATA_SCOPES,
        permissionCatalog: publicPermissionCatalog(),
        roles: await listAdminRoles(),
      } : null,
    });
  } catch (error) {
    handleError(res, error);
  }
}
