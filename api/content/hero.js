import { db } from "../_lib/db.js";
import { ensureContentSchema, serializeHeroSlide } from "../_lib/content.js";
import { isMissingSchemaError } from "../_lib/db.js";
import { allowMethods, handleError, setPublicCache } from "../_lib/http.js";

async function publishedSlides() {
  return db()`SELECT * FROM homepage_hero_slides
    WHERE status = 'published'
    ORDER BY display_order, updated_at DESC`;
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["GET"])) return;
  try {
    let rows;
    try {
      rows = await publishedSlides();
    } catch (error) {
      if (!isMissingSchemaError(error)) throw error;
      await ensureContentSchema();
      rows = await publishedSlides();
    }
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    setPublicCache(res);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.end(JSON.stringify({ slides: rows.map((row) => serializeHeroSlide(row)) }));
  } catch (error) {
    handleError(res, error);
  }
}
