import { assertPermission } from "../_lib/admin-rbac.js";
import { listAdminAudit, loadAdminSession } from "../_lib/admin-store.js";
import { allowMethods, handleError, json } from "../_lib/http.js";

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["GET"])) return;
  try {
    const session = await loadAdminSession(req);
    assertPermission(session, "admin.audit.view");
    const query = req.query || {};
    json(res, 200, {
      logs: await listAdminAudit({
        limit: query.limit,
        module: query.module,
        actorUserId: query.actorUserId,
      }),
    });
  } catch (error) {
    handleError(res, error);
  }
}
