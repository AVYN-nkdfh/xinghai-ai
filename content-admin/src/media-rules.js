export const mediaRules = {
  video: {
    types: ["video/mp4", "video/webm"],
    extensions: ["mp4", "webm"],
    maxBytes: 300 * 1024 * 1024,
  },
  poster: {
    types: ["image/jpeg", "image/png", "image/webp"],
    extensions: ["jpg", "jpeg", "png", "webp"],
    maxBytes: 10 * 1024 * 1024,
  },
};

export function validateMediaFile(kind, file) {
  const rule = mediaRules[kind];
  if (!rule || !file) return "没有选择文件";
  const extension = String(file.name || "").split(".").pop().toLowerCase();
  const typeAccepted = rule.types.includes(String(file.type || "").toLowerCase());
  const extensionAccepted = rule.extensions.includes(extension);
  if (!typeAccepted && !extensionAccepted) {
    return kind === "video"
      ? "视频格式不支持，请选择 MP4 或 WebM 文件"
      : "封面格式不支持，请选择 JPG、PNG 或 WebP 图片";
  }
  if (Number(file.size) > rule.maxBytes) {
    return kind === "video"
      ? "视频超过 300MB，请压缩后重新选择"
      : "封面超过 10MB，请压缩后重新选择";
  }
  return "";
}
