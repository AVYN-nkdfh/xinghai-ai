import { db } from "../_lib/db.js";
import { isMissingSchemaError } from "../_lib/db.js";
import { allowMethods, handleError, setPublicCache } from "../_lib/http.js";
import { ensureWorksSchema, serializeWork } from "../_lib/works-content.js";

async function publishedWorks() {
  return db()`SELECT * FROM website_works
    WHERE status = 'published'
    ORDER BY partition, display_order, updated_at DESC`;
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["GET"])) return;
  try {
    let rows;
    try {
      rows = await publishedWorks();
    } catch (error) {
      if (!isMissingSchemaError(error)) throw error;
      await ensureWorksSchema();
      rows = await publishedWorks();
    }
    const works = rows.map((row) => serializeWork(row));
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    setPublicCache(res);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.end(JSON.stringify({
      studentWorks: works.filter((work) => work.partition === "student"),
      officialWorks: works.filter((work) => work.partition === "official"),
      homepageWorks: works.filter((work) => work.showOnHomepage),
    }));
  } catch (error) {
    handleError(res, error);
  }
}
