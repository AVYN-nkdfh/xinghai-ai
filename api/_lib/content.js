import { db } from "./db.js";

let contentSchemaPromise;

const seedSlides = [
  {
    id: "08e579de-1354-47e2-a3e9-972de690b252",
    headline: "她把一门历史课，做成了自己的学习软件。",
    projectName: "历史学习软件",
    videoUrl: "https://todo-video-hero-aug9-2026.vercel.app/assets/video/raw-create.mp4",
    posterUrl: "https://todo-video-hero-aug9-2026.vercel.app/assets/posters/raw-create.jpg",
    videoAlt: "一位女孩在白板前介绍自己制作的历史学习软件",
    desktopTextPosition: "left-middle",
    displayOrder: 10,
  },
  {
    id: "1c8815e6-af1b-4ea0-bfaf-6351016c1c22",
    headline: "先把自己的思路讲清楚，再继续做。",
    projectName: "梳理自己的思路",
    videoUrl: "https://todo-video-hero-aug9-2026.vercel.app/assets/video/raw-think.mp4",
    posterUrl: "https://todo-video-hero-aug9-2026.vercel.app/assets/posters/raw-think.jpg",
    videoAlt: "一位男孩面对镜头讲述自己的思考过程",
    desktopTextPosition: "left-top",
    displayOrder: 20,
  },
  {
    id: "9953ee44-22a7-4839-b0c2-59c378800a70",
    headline: "她开始把课文，讲成自己的理解。",
    projectName: "讲出课文理解",
    videoUrl: "https://todo-video-hero-aug9-2026.vercel.app/assets/video/raw-understand.mp4",
    posterUrl: "https://todo-video-hero-aug9-2026.vercel.app/assets/posters/raw-understand.jpg",
    videoAlt: "一位女孩在学习空间里讲述自己对课文的理解",
    desktopTextPosition: "left-middle",
    displayOrder: 30,
  },
  {
    id: "ba0b38e6-6044-45ae-85ff-a6ac468b8233",
    headline: "他开始自己复盘，一篇语文课文。",
    projectName: "语文课文复盘",
    videoUrl: "https://todo-video-hero-aug9-2026.vercel.app/assets/video/raw-review.mp4",
    posterUrl: "https://todo-video-hero-aug9-2026.vercel.app/assets/posters/raw-review.jpg",
    videoAlt: "一位男孩在白板前复盘一篇语文课文",
    desktopTextPosition: "left-top",
    displayOrder: 40,
  },
];

export async function ensureContentSchema() {
  if (contentSchemaPromise) return contentSchemaPromise;
  const sql = db();
  contentSchemaPromise = (async () => {
    await sql.transaction([
      sql`CREATE TABLE IF NOT EXISTS homepage_hero_slides (
        id uuid PRIMARY KEY,
        headline text NOT NULL,
        project_name text NOT NULL,
        age_at_capture smallint CHECK (age_at_capture BETWEEN 4 AND 18),
        student_display_name text,
        show_student_name boolean NOT NULL DEFAULT false,
        project_url text,
        video_url text NOT NULL,
        poster_url text,
        video_alt text NOT NULL,
        desktop_text_position text NOT NULL DEFAULT 'left-middle'
          CHECK (desktop_text_position IN ('left-top', 'left-middle', 'right-top', 'right-middle')),
        mobile_text_position text NOT NULL DEFAULT 'top'
          CHECK (mobile_text_position IN ('top')),
        media_focal_x smallint NOT NULL DEFAULT 50 CHECK (media_focal_x BETWEEN 0 AND 100),
        media_focal_y smallint NOT NULL DEFAULT 50 CHECK (media_focal_y BETWEEN 0 AND 100),
        status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
        display_order integer NOT NULL DEFAULT 100,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        published_at timestamptz
      )`,
      sql`CREATE INDEX IF NOT EXISTS homepage_hero_slides_status_order_index
        ON homepage_hero_slides (status, display_order, updated_at DESC)`,
      sql`CREATE TABLE IF NOT EXISTS homepage_content_audit (
        id bigserial PRIMARY KEY,
        slide_id uuid,
        action text NOT NULL,
        details jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
    ]);

    for (const slide of seedSlides) {
      await sql`INSERT INTO homepage_hero_slides (
        id, headline, project_name, video_url, poster_url, video_alt,
        desktop_text_position, display_order, status, published_at
      ) VALUES (
        ${slide.id}::uuid, ${slide.headline}, ${slide.projectName}, ${slide.videoUrl},
        ${slide.posterUrl}, ${slide.videoAlt}, ${slide.desktopTextPosition},
        ${slide.displayOrder}, 'published', now()
      ) ON CONFLICT (id) DO NOTHING`;
    }
  })().catch((error) => {
    contentSchemaPromise = null;
    throw error;
  });
  return contentSchemaPromise;
}

export function serializeHeroSlide(row, { includePrivate = false } = {}) {
  const publicName = row.show_student_name ? row.student_display_name || null : null;
  const result = {
    id: row.id,
    headline: row.headline,
    projectName: row.project_name,
    ageAtCapture: row.age_at_capture,
    studentDisplayName: includePrivate ? row.student_display_name : publicName,
    showStudentName: includePrivate ? row.show_student_name : undefined,
    projectUrl: row.project_url,
    videoUrl: row.video_url,
    posterUrl: row.poster_url,
    videoAlt: row.video_alt,
    desktopTextPosition: row.desktop_text_position,
    mobileTextPosition: row.mobile_text_position,
    mediaFocalPoint: { x: row.media_focal_x, y: row.media_focal_y },
    status: includePrivate ? row.status : undefined,
    displayOrder: row.display_order,
    updatedAt: includePrivate ? row.updated_at : undefined,
    publishedAt: includePrivate ? row.published_at : undefined,
    dataQuality: includePrivate ? {
      ageMissing: row.age_at_capture == null,
      posterMissing: !row.poster_url,
      projectLinkMissing: !row.project_url,
    } : undefined,
  };
  return Object.fromEntries(Object.entries(result).filter(([, value]) => value !== undefined));
}
