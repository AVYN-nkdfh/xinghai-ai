import {
  createAdminSessionCookie,
  clearAdminSessionCookie,
  modulesForPermissions,
} from "../_lib/admin-rbac.js";
import {
  assertAdminLoginAllowed,
  authenticateAdminCredentials,
  clearAdminLoginFailures,
  createAdminSession,
  loadAdminSession,
  recordAdminLoginFailure,
  revokeAdminSession,
  writeAdminAudit,
} from "../_lib/admin-store.js";
import { allowMethods, assertSameOrigin, bodyOf, handleError, json } from "../_lib/http.js";
import { badRequest } from "../_lib/validation.js";

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["GET", "POST", "DELETE"])) return;
  try {
    if (req.method === "GET") {
      const session = await loadAdminSession(req);
      return json(res, 200, {
        authenticated: true,
        user: session.user,
        permissions: session.permissions,
        modules: modulesForPermissions(session.permissions),
        expiresAt: session.expiresAt,
      });
    }

    assertSameOrigin(req);
    if (req.method === "DELETE") {
      let session = null;
      try { session = await loadAdminSession(req); } catch {}
      await revokeAdminSession(req, session?.sessionId || null);
      if (session) {
        await writeAdminAudit({
          req,
          actorUserId: session.user.id,
          action: "admin_session.logout",
          module: "auth",
          targetType: "admin_session",
          targetId: session.sessionId,
        });
      }
      res.setHeader("Set-Cookie", clearAdminSessionCookie(req));
      return json(res, 200, { ok: true });
    }

    const body = bodyOf(req);
    const email = String(body.email || "");
    const password = String(body.password || "");
    await assertAdminLoginAllowed(req, email);
    let user;
    try {
      user = await authenticateAdminCredentials(email, password);
    } catch (error) {
      if (![400, 401].includes(error?.status)) throw error;
      await recordAdminLoginFailure(req, email);
      await writeAdminAudit({
        req,
        action: "admin_session.login_failed",
        module: "auth",
        result: "denied",
        details: { reason: "invalid_credentials" },
      });
      throw badRequest("邮箱或密码不正确", 401);
    }
    await clearAdminLoginFailures(req, email);
    const session = await createAdminSession(user, req);
    res.setHeader("Set-Cookie", createAdminSessionCookie(session.token, req));
    return json(res, 200, { ok: true, expiresAt: session.expiresAt });
  } catch (error) {
    handleError(res, error);
  }
}
