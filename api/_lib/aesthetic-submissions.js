import { db } from "./db.js";

let aestheticSchemaPromise;

export async function ensureAestheticSubmissionSchema() {
  if (aestheticSchemaPromise) return aestheticSchemaPromise;
  const sql = db();
  aestheticSchemaPromise = sql.transaction([
    sql`CREATE TABLE IF NOT EXISTS aesthetic_submissions (
      id uuid PRIMARY KEY,
      kind text NOT NULL CHECK (kind IN ('reference', 'remind')),
      note text,
      source_url text,
      image_url text,
      status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'handled')),
      client_token uuid NOT NULL,
      submission_day date NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      reviewed_at timestamptz
    )`,
    sql`CREATE INDEX IF NOT EXISTS aesthetic_submissions_review_index
      ON aesthetic_submissions (status, created_at DESC)`,
    sql`CREATE INDEX IF NOT EXISTS aesthetic_submissions_client_day_index
      ON aesthetic_submissions (client_token, submission_day, kind)`,
    sql`CREATE UNIQUE INDEX IF NOT EXISTS aesthetic_submissions_daily_reminder_unique
      ON aesthetic_submissions (client_token, submission_day, kind)
      WHERE kind = 'remind'`,
  ]).catch((error) => {
    aestheticSchemaPromise = null;
    throw error;
  });
  return aestheticSchemaPromise;
}

export function shanghaiDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function serializeAestheticSubmission(row) {
  return {
    id: row.id,
    kind: row.kind,
    kindLabel: row.kind === "reference" ? "参考推荐" : "催更",
    note: row.note || "",
    sourceUrl: row.source_url || "",
    imageUrl: row.image_url || "",
    status: row.status,
    statusLabel: row.status === "approved"
      ? "通过初审"
      : row.status === "rejected"
        ? "不采用"
        : row.status === "handled"
          ? "已处理"
          : "待审核",
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
  };
}

export async function listAestheticSubmissions() {
  const rows = await db()`SELECT id, kind, note, source_url, image_url, status, created_at, reviewed_at
    FROM aesthetic_submissions
    ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, created_at DESC
    LIMIT 100`;
  return rows.map(serializeAestheticSubmission);
}
