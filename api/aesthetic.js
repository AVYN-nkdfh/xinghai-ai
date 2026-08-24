import { randomUUID } from "node:crypto";
import { put } from "@vercel/blob";
import { requireAdmin } from "./_lib/auth.js";
import { db } from "./_lib/db.js";
import {
  ensureAestheticSubmissionSchema,
  listAestheticSubmissions,
  serializeAestheticSubmission,
  shanghaiDate,
} from "./_lib/aesthetic-submissions.js";
import { allowMethods, assertSameOrigin, bodyOf, handleError, json } from "./_lib/http.js";
import { badRequest } from "./_lib/validation.js";

const MAX_IMAGE_BYTES = 1_572_864;
const IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

function isAdminMode(req) {
  if (req.query?.mode === "admin") return true;
  try { return new URL(req.url, "https://local.invalid").searchParams.get("mode") === "admin"; } catch { return false; }
}

function requireSameOriginPost(req) {
  const origin = String(req.headers.origin || "").trim();
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  let originHost = "";
  try { originHost = new URL(origin).host; } catch {}
  if (!origin || !host || originHost !== host) throw badRequest("请求来源无效", 403);
}

function uuidOf(value, message) {
  const id = String(value || "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw badRequest(message);
  }
  return id;
}

function noteOf(value) {
  const note = String(value || "").trim();
  if (!note) throw badRequest("请简单说说为什么想推荐它");
  if (note.length > 240) throw badRequest("推荐理由请控制在 240 字以内");
  return note;
}

function sourceUrlOf(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  if (text.length > 800) throw badRequest("来源链接过长");
  let url;
  try { url = new URL(text); } catch { throw badRequest("来源链接不正确"); }
  if (url.protocol !== "https:" || url.username || url.password) throw badRequest("来源必须是公开 HTTPS 链接");
  if (["localhost", "127.0.0.1", "::1"].includes(url.hostname.toLowerCase())) throw badRequest("来源必须是公开网站");
  return url.toString();
}

function hasMagicBytes(buffer, type) {
  if (type === "image/jpeg") return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (type === "image/png") return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (type === "image/webp") return buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  return false;
}

function imageOf(value) {
  if (!value) return null;
  const type = String(value.type || "").toLowerCase();
  const extension = IMAGE_TYPES.get(type);
  if (!extension) throw badRequest("图片只支持 JPG、PNG 或 WebP");
  const match = String(value.dataUrl || "").match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match || match[1] !== type) throw badRequest("图片内容不正确，请重新选择");
  if (match[2].length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 8) throw badRequest("图片不能超过 1.5MB");
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) throw badRequest("图片不能超过 1.5MB");
  if (!hasMagicBytes(buffer, type)) throw badRequest("图片格式与内容不一致");
  return { buffer, type, extension };
}

async function createReminder(sql, id, clientToken, submissionDay) {
  const existing = await sql`SELECT * FROM aesthetic_submissions
    WHERE kind = 'remind' AND client_token = ${clientToken} AND submission_day = ${submissionDay}
    LIMIT 1`;
  if (existing.length) return existing[0];
  try {
    const rows = await sql`INSERT INTO aesthetic_submissions (id, kind, client_token, submission_day)
      VALUES (${id}, 'remind', ${clientToken}, ${submissionDay}) RETURNING *`;
    return rows[0];
  } catch (error) {
    if (error?.code !== "23505") throw error;
    const rows = await sql`SELECT * FROM aesthetic_submissions
      WHERE kind = 'remind' AND client_token = ${clientToken} AND submission_day = ${submissionDay}
      LIMIT 1`;
    return rows[0];
  }
}

async function handleAdmin(req, res) {
  if (!allowMethods(req, res, ["GET", "POST"])) return;
  requireAdmin(req);
  await ensureAestheticSubmissionSchema();
  if (req.method === "GET") return json(res, 200, { submissions: await listAestheticSubmissions() });

  assertSameOrigin(req);
  const body = bodyOf(req);
  const id = uuidOf(body.id, "推荐记录不存在");
  const status = body.action === "approve" ? "approved" : body.action === "reject" ? "rejected" : body.action === "handle" ? "handled" : null;
  if (!status) throw badRequest("审核操作不正确");
  const updated = await db()`UPDATE aesthetic_submissions
    SET status = ${status}, reviewed_at = now()
    WHERE id = ${id} AND status = 'pending'
      AND (kind = 'reference' OR ${status} = 'handled')
    RETURNING id`;
  if (!updated.length) throw badRequest("这条内容已处理，刷新后再看", 409);
  return json(res, 200, { ok: true, submissions: await listAestheticSubmissions() });
}

async function handlePublic(req, res) {
  if (!allowMethods(req, res, ["POST"])) return;
  requireSameOriginPost(req);
  const body = bodyOf(req);
  const kind = body.kind === "remind" ? "remind" : body.kind === "reference" ? "reference" : null;
  if (!kind) throw badRequest("提交类型不正确");
  const clientToken = uuidOf(body.clientToken, "匿名提交标识无效，请刷新页面后再试");
  const submissionDay = shanghaiDate();
  await ensureAestheticSubmissionSchema();
  const sql = db();
  const id = randomUUID();

  if (kind === "remind") {
    const row = await createReminder(sql, id, clientToken, submissionDay);
    return json(res, 200, { ok: true, duplicate: row.id !== id, submission: serializeAestheticSubmission(row) });
  }

  const note = noteOf(body.note);
  const sourceUrl = sourceUrlOf(body.sourceUrl);
  const image = imageOf(body.image);
  if (!sourceUrl && !image) throw badRequest("请上传一张图片，或填写一个公开来源链接");
  const todayCount = await sql`SELECT count(*)::integer AS count FROM aesthetic_submissions
    WHERE kind = 'reference' AND client_token = ${clientToken} AND submission_day = ${submissionDay}`;
  if ((todayCount[0]?.count || 0) >= 3) throw badRequest("今天已经推荐了 3 个参考，明天再来看看吧", 429);

  let imageUrl = null;
  if (image) {
    const blob = await put(`aesthetic-submissions/${id}.${image.extension}`, image.buffer, {
      access: "public",
      contentType: image.type,
      addRandomSuffix: false,
      allowOverwrite: false,
      cacheControlMaxAge: 31_536_000,
    });
    imageUrl = blob.url;
  }
  const rows = await sql`INSERT INTO aesthetic_submissions (
    id, kind, note, source_url, image_url, client_token, submission_day
  ) VALUES (
    ${id}, 'reference', ${note}, ${sourceUrl}, ${imageUrl}, ${clientToken}, ${submissionDay}
  ) RETURNING *`;
  return json(res, 201, { ok: true, submission: serializeAestheticSubmission(rows[0]) });
}

export default async function handler(req, res) {
  try {
    return isAdminMode(req) ? await handleAdmin(req, res) : await handlePublic(req, res);
  } catch (error) {
    handleError(res, error);
  }
}
