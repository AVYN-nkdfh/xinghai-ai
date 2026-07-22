import { clearSessionCookie } from "../_lib/auth.js";
import { allowMethods, assertSameOrigin, handleError, json } from "../_lib/http.js";

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["POST"])) return;
  try {
    assertSameOrigin(req);
    res.setHeader("Set-Cookie", clearSessionCookie());
    json(res, 200, { ok: true });
  } catch (error) {
    handleError(res, error);
  }
}
