import { randomUUID } from "node:crypto";
import { requireAdmin } from "../_lib/auth.js";
import { ensureContentSchema, serializeHeroSlide } from "../_lib/content.js";
import { db } from "../_lib/db.js";
import { allowMethods, assertSameOrigin, bodyOf, handleError, json } from "../_lib/http.js";
import { badRequest } from "../_lib/validation.js";

const POSITIONS = new Set(["left-top", "left-middle", "right-top", "right-middle"]);

function optionalText(value, maxLength = 120) {
  const text = String(value || "").trim();
  if (text.length > maxLength) throw badRequest("字段内容过长");
  return text || null;
}

function requiredText(value, label, maxLength) {
  const text = optionalText(value, maxLength);
  if (!text) throw badRequest(`请填写${label}`);
  return text;
}

function optionalUrl(value, label) {
  const text = optionalText(value, 600);
  if (!text) return null;
  let url;
  try { url = new URL(text); } catch { throw badRequest(`${label}链接不正确`); }
  if (url.protocol !== "https:") throw badRequest(`${label}必须使用 HTTPS 链接`);
  return url.toString();
}

function requiredUrl(value, label) {
  const url = optionalUrl(value, label);
  if (!url) throw badRequest(`请填写${label}链接`);
  return url;
}

function optionalAge(value) {
  if (value === "" || value == null) return null;
  const age = Number(value);
  if (!Number.isInteger(age) || age < 4 || age > 18) throw badRequest("拍摄时年龄应为 4–18 岁");
  return age;
}

function percent(value, fallback = 50) {
  const number = value == null || value === "" ? fallback : Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 100) throw badRequest("媒体焦点应在 0–100 之间");
  return number;
}

function uuid(value, { optional = false } = {}) {
  const id = String(value || "").trim();
  if (!id && optional) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw badRequest("内容编号不正确");
  }
  return id;
}

async function listSlides() {
  const rows = await db()`SELECT * FROM homepage_hero_slides
    ORDER BY CASE status WHEN 'published' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END,
      display_order, updated_at DESC`;
  return rows.map((row) => serializeHeroSlide(row, { includePrivate: true }));
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["GET", "POST"])) return;
  try {
    requireAdmin(req);
    await ensureContentSchema();
    if (req.method === "GET") return json(res, 200, { slides: await listSlides() });

    assertSameOrigin(req);
    const body = bodyOf(req);
    const sql = db();

    if (body.action === "save") {
      const id = uuid(body.slide?.id, { optional: true }) || randomUUID();
      const headline = requiredText(body.slide?.headline, "事实标题", 90);
      const projectName = requiredText(body.slide?.projectName, "项目名称", 48);
      const ageAtCapture = optionalAge(body.slide?.ageAtCapture);
      const studentDisplayName = optionalText(body.slide?.studentDisplayName, 30);
      const showStudentName = Boolean(body.slide?.showStudentName && studentDisplayName);
      const projectUrl = optionalUrl(body.slide?.projectUrl, "项目");
      const videoUrl = requiredUrl(body.slide?.videoUrl, "视频");
      const posterUrl = optionalUrl(body.slide?.posterUrl, "封面");
      const videoAlt = requiredText(body.slide?.videoAlt, "视频替代说明", 100);
      const desktopTextPosition = POSITIONS.has(body.slide?.desktopTextPosition) ? body.slide.desktopTextPosition : "left-middle";
      const focalX = percent(body.slide?.mediaFocalPoint?.x);
      const focalY = percent(body.slide?.mediaFocalPoint?.y);
      const displayOrder = Number.isInteger(Number(body.slide?.displayOrder)) ? Number(body.slide.displayOrder) : 100;

      await sql.transaction([
        sql`INSERT INTO homepage_hero_slides (
          id, headline, project_name, age_at_capture, student_display_name, show_student_name,
          project_url, video_url, poster_url, video_alt, desktop_text_position,
          mobile_text_position, media_focal_x, media_focal_y, display_order, updated_at
        ) VALUES (
          ${id}::uuid, ${headline}, ${projectName}, ${ageAtCapture}, ${studentDisplayName}, ${showStudentName},
          ${projectUrl}, ${videoUrl}, ${posterUrl}, ${videoAlt}, ${desktopTextPosition},
          'top', ${focalX}, ${focalY}, ${displayOrder}, now()
        ) ON CONFLICT (id) DO UPDATE SET
          headline = EXCLUDED.headline,
          project_name = EXCLUDED.project_name,
          age_at_capture = EXCLUDED.age_at_capture,
          student_display_name = EXCLUDED.student_display_name,
          show_student_name = EXCLUDED.show_student_name,
          project_url = EXCLUDED.project_url,
          video_url = EXCLUDED.video_url,
          poster_url = EXCLUDED.poster_url,
          video_alt = EXCLUDED.video_alt,
          desktop_text_position = EXCLUDED.desktop_text_position,
          mobile_text_position = EXCLUDED.mobile_text_position,
          media_focal_x = EXCLUDED.media_focal_x,
          media_focal_y = EXCLUDED.media_focal_y,
          display_order = EXCLUDED.display_order,
          updated_at = now()`,
        sql`INSERT INTO homepage_content_audit (slide_id, action, details)
          VALUES (${id}::uuid, 'save', ${JSON.stringify({ ageMissing: ageAtCapture == null })}::jsonb)`,
      ]);
      return json(res, 200, { ok: true, id, slides: await listSlides() });
    }

    if (["publish", "unpublish", "archive"].includes(body.action)) {
      const id = uuid(body.id);
      const status = body.action === "publish" ? "published" : body.action === "archive" ? "archived" : "draft";
      const updated = await sql`UPDATE homepage_hero_slides SET
        status = ${status},
        published_at = CASE WHEN ${status} = 'published' THEN COALESCE(published_at, now()) ELSE published_at END,
        updated_at = now()
        WHERE id = ${id}::uuid
        RETURNING id`;
      if (!updated.length) throw badRequest("内容不存在", 404);
      await sql`INSERT INTO homepage_content_audit (slide_id, action) VALUES (${id}::uuid, ${body.action})`;
      return json(res, 200, { ok: true, slides: await listSlides() });
    }

    if (body.action === "reorder") {
      if (!Array.isArray(body.ids) || !body.ids.length) throw badRequest("排序内容为空");
      const ordered = body.ids.map((id, index) => ({ id: uuid(id), display_order: (index + 1) * 10 }));
      await sql.transaction([
        sql`WITH ordered AS (
          SELECT id::uuid, display_order::integer
          FROM jsonb_to_recordset(${JSON.stringify(ordered)}::jsonb) AS row(id text, display_order integer)
        )
        UPDATE homepage_hero_slides AS slide
        SET display_order = ordered.display_order, updated_at = now()
        FROM ordered WHERE slide.id = ordered.id`,
        sql`INSERT INTO homepage_content_audit (action, details)
          VALUES ('reorder', ${JSON.stringify({ ids: ordered.map((item) => item.id) })}::jsonb)`,
      ]);
      return json(res, 200, { ok: true, slides: await listSlides() });
    }

    throw badRequest("操作类型不正确");
  } catch (error) {
    handleError(res, error);
  }
}
