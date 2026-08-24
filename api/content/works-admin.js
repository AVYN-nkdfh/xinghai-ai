import { randomUUID } from "node:crypto";
import { requireAdmin } from "../_lib/auth.js";
import { db } from "../_lib/db.js";
import { allowMethods, assertSameOrigin, bodyOf, handleError, json } from "../_lib/http.js";
import { badRequest } from "../_lib/validation.js";
import { ensureWorksSchema, serializeWork } from "../_lib/works-content.js";

const PARTITIONS = new Set(["student", "official"]);

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

function workUrl(value, label) {
  const text = requiredText(value, label, 600);
  if (/^\/[a-zA-Z0-9/_?&=.#%-]+$/.test(text)) return text;
  let url;
  try { url = new URL(text); } catch { throw badRequest(`${label}链接不正确`); }
  if (url.protocol !== "https:") throw badRequest(`${label}必须使用站内路径或 HTTPS 链接`);
  return url.toString();
}

function tagsOf(value) {
  const source = Array.isArray(value) ? value : String(value || "").split(/[，,]/u);
  const tags = [...new Set(source.map((tag) => String(tag).trim()).filter(Boolean))];
  if (tags.length > 5 || tags.some((tag) => tag.length > 18)) throw badRequest("标签最多 5 个，每个不超过 18 个字");
  return tags;
}

function workId(value, { optional = false } = {}) {
  const id = String(value || "").trim();
  if (!id && optional) return null;
  if (!/^[a-z0-9][a-z0-9-]{1,79}$/i.test(id)) throw badRequest("作品编号不正确");
  return id;
}

async function listWorks() {
  const rows = await db()`SELECT * FROM website_works
    ORDER BY CASE partition WHEN 'student' THEN 0 ELSE 1 END,
      CASE status WHEN 'published' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END,
      display_order, updated_at DESC`;
  return rows.map((row) => serializeWork(row, { includePrivate: true }));
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["GET", "POST"])) return;
  try {
    requireAdmin(req);
    await ensureWorksSchema();
    if (req.method === "GET") return json(res, 200, { works: await listWorks() });

    assertSameOrigin(req);
    const body = bodyOf(req);
    const sql = db();

    if (body.action === "save") {
      const work = body.work || {};
      const id = workId(work.id, { optional: true }) || randomUUID();
      const partition = PARTITIONS.has(work.partition) ? work.partition : "student";
      const title = requiredText(work.title, "作品标题", 60);
      const kicker = requiredText(work.kicker, "作品类型", 60);
      const summary = requiredText(work.summary, "作品摘要", 260);
      const cover = workUrl(work.cover, "封面");
      const coverAlt = requiredText(work.coverAlt, "封面说明", 120);
      const href = workUrl(work.href, "作品");
      const version = optionalText(work.version, 20);
      const tags = tagsOf(work.tags);
      const showOnHomepage = Boolean(work.showOnHomepage);
      const displayOrder = Number.isInteger(Number(work.displayOrder)) ? Number(work.displayOrder) : 100;

      await sql.transaction([
        sql`INSERT INTO website_works (
          id, partition, title, kicker, summary, cover_url, cover_alt, href,
          version_label, tags, show_on_homepage, display_order, updated_at
        ) VALUES (
          ${id}, ${partition}, ${title}, ${kicker}, ${summary}, ${cover}, ${coverAlt}, ${href},
          ${version}, ${JSON.stringify(tags)}::jsonb, ${showOnHomepage}, ${displayOrder}, now()
        ) ON CONFLICT (id) DO UPDATE SET
          partition = EXCLUDED.partition,
          title = EXCLUDED.title,
          kicker = EXCLUDED.kicker,
          summary = EXCLUDED.summary,
          cover_url = EXCLUDED.cover_url,
          cover_alt = EXCLUDED.cover_alt,
          href = EXCLUDED.href,
          version_label = EXCLUDED.version_label,
          tags = EXCLUDED.tags,
          show_on_homepage = EXCLUDED.show_on_homepage,
          display_order = EXCLUDED.display_order,
          updated_at = now()`,
        sql`INSERT INTO website_works_audit (work_id, action, details)
          VALUES (${id}, 'save', ${JSON.stringify({ partition, showOnHomepage })}::jsonb)`,
      ]);
      return json(res, 200, { ok: true, id, works: await listWorks() });
    }

    if (["publish", "unpublish", "archive"].includes(body.action)) {
      const id = workId(body.id);
      const status = body.action === "publish" ? "published" : body.action === "archive" ? "archived" : "draft";
      const updated = await sql`UPDATE website_works SET
        status = ${status},
        published_at = CASE WHEN ${status} = 'published' THEN COALESCE(published_at, now()) ELSE published_at END,
        updated_at = now()
        WHERE id = ${id}
        RETURNING id`;
      if (!updated.length) throw badRequest("作品不存在", 404);
      await sql`INSERT INTO website_works_audit (work_id, action) VALUES (${id}, ${body.action})`;
      return json(res, 200, { ok: true, works: await listWorks() });
    }

    if (body.action === "reorder") {
      if (!Array.isArray(body.ids) || !body.ids.length) throw badRequest("排序内容为空");
      const ordered = body.ids.map((id, index) => ({ id: workId(id), display_order: (index + 1) * 10 }));
      await sql.transaction([
        sql`WITH ordered AS (
          SELECT id::text, display_order::integer
          FROM jsonb_to_recordset(${JSON.stringify(ordered)}::jsonb) AS row(id text, display_order integer)
        )
        UPDATE website_works AS work
        SET display_order = ordered.display_order, updated_at = now()
        FROM ordered WHERE work.id = ordered.id`,
        sql`INSERT INTO website_works_audit (action, details)
          VALUES ('reorder', ${JSON.stringify({ ids: ordered.map((item) => item.id) })}::jsonb)`,
      ]);
      return json(res, 200, { ok: true, works: await listWorks() });
    }

    throw badRequest("操作类型不正确");
  } catch (error) {
    handleError(res, error);
  }
}
