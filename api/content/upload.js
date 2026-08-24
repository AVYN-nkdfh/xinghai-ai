import { handleUpload } from "@vercel/blob/client";
import { requireAdmin } from "../_lib/auth.js";
import { allowMethods, assertSameOrigin, bodyOf, handleError, json } from "../_lib/http.js";

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["POST"])) return;
  try {
    const body = bodyOf(req);
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        assertSameOrigin(req);
        requireAdmin(req);
        if (!String(pathname || "").startsWith("homepage/")) throw new Error("上传路径不正确");
        return {
          allowedContentTypes: ["video/mp4", "video/webm", "image/jpeg", "image/png", "image/webp"],
          maximumSizeInBytes: 300 * 1024 * 1024,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ scope: "homepage-media" }),
        };
      },
      onUploadCompleted: async () => {},
    });
    json(res, 200, result);
  } catch (error) {
    handleError(res, error);
  }
}
