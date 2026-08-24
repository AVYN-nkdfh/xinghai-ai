import { db } from "./db.js";

let worksSchemaPromise;

const seedWorks = [
  {
    id: "animal-cars",
    title: "动物汽车收藏馆",
    kicker: "动物 × 汽车概念设计",
    summary: "把猎豹、鲨鱼、犀牛、孔雀等动物特征转化成 22 款概念汽车，并做成可筛选、可打开详情的线上收藏馆。",
    cover: "/works/covers/animal-cars-cover-v2.webp",
    coverAlt: "黑金汽车展厅中的动物汽车收藏馆项目封面",
    href: "/projects/animal-cars/",
    version: "2026.08",
    tags: ["概念汽车", "视觉设计", "互动收藏馆"],
    displayOrder: 10,
  },
  {
    id: "hsv-fan",
    title: "HSV 球迷之家",
    kicker: "足球球迷信息网站",
    summary: "围绕喜欢的 HSV 球队，整理球员、比赛、文化、视频与球迷互动，做成一座内容丰富的非官方球迷站。",
    cover: "/works/covers/hsv-fan-cover-v2.webp",
    coverAlt: "HSV 球迷之家蓝白球场与球队资料封面",
    href: "/projects/hsv-fan/",
    version: "2026.08",
    tags: ["足球", "球迷网站", "资料整理"],
    displayOrder: 20,
  },
  {
    id: "valorant-teams",
    title: "无畏战队中心",
    kicker: "电竞战队数据项目",
    summary: "把 48 支战队的排名、赛区、公开阵容与比赛快照整理成可搜索、可筛选、可查看详情的 H5 网站。",
    cover: "/works/covers/valorant-teams-cover-v2.webp",
    coverAlt: "无畏战队中心排名与阵容数据封面",
    href: "/projects/valorant-teams/",
    version: "2026.08",
    tags: ["电竞", "数据整理", "H5 网站"],
    displayOrder: 30,
  },
  {
    id: "game-archive",
    title: "二游设定档案馆",
    kicker: "游戏角色与设定资料库",
    summary: "把游戏角色、阵营、剧情与编辑资讯整理成可搜索、可浏览的资料门户，并尝试评分、收藏等产品概念。",
    cover: "/works/covers/game-archive-cover-v2.webp",
    coverAlt: "二游设定档案馆暖白粉蓝资料门户封面",
    href: "/projects/game-archive/",
    version: "2026.08",
    tags: ["游戏资料", "角色设定", "产品原型"],
    displayOrder: 40,
  },
  {
    id: "ocean-environment",
    title: "海洋会记住",
    kicker: "海洋环保视觉项目",
    summary: "从“想保护海洋动物”出发，孩子把污染问题做成了一段可浏览、可分享的视觉旅程。",
    cover: "/projects/ocean-environment/assets/scene-1-surface.webp",
    coverAlt: "《海洋会记住》视觉项目的海面场景",
    href: "/projects/ocean-environment/",
    version: "2026.07",
    tags: ["海洋环保", "视觉叙事", "可浏览作品"],
    displayOrder: 50,
  },
  {
    id: "moments-copy",
    title: "文案便利店",
    kicker: "朋友圈文案小程序预览",
    summary: "把不同心情和场景的短句整理成可搜索、可分类、可收藏、可一键复制的小程序网页预览。",
    cover: "/works/covers/moments-copy-cover-v1.webp",
    coverAlt: "文案便利店紫色小程序网页预览封面",
    href: "/works/moments-copy/",
    version: "2026.08",
    tags: ["小程序预览", "内容分类", "交互设计"],
    displayOrder: 60,
  },
  {
    id: "parent-child-relationship-test",
    title: "亲子关系测试",
    kicker: "锐锐作品 · 亲子共测 H5",
    summary: "让家长和孩子分别完成 12 道情景题，再把双方答案汇成一个可解释、可保存分享的相处模式结果。",
    cover: "/works/covers/parent-child-relationship-test-cover-v1.webp",
    coverAlt: "亲子关系测试首页与家长孩子共同使用手机的作品封面",
    href: "/works/parent-child-relationship-test/",
    version: "2026.08",
    tags: ["亲子共测", "产品设计", "H5 应用"],
    showOnHomepage: false,
    displayOrder: 70,
  },
];

export async function ensureWorksSchema() {
  if (worksSchemaPromise) return worksSchemaPromise;
  const sql = db();
  worksSchemaPromise = (async () => {
    await sql.transaction([
      sql`CREATE TABLE IF NOT EXISTS website_works (
        id text PRIMARY KEY,
        partition text NOT NULL DEFAULT 'student' CHECK (partition IN ('student', 'official')),
        title text NOT NULL,
        kicker text NOT NULL,
        summary text NOT NULL,
        cover_url text NOT NULL,
        cover_alt text NOT NULL,
        href text NOT NULL,
        version_label text,
        tags jsonb NOT NULL DEFAULT '[]'::jsonb,
        show_on_homepage boolean NOT NULL DEFAULT true,
        status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
        display_order integer NOT NULL DEFAULT 100,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        published_at timestamptz
      )`,
      sql`CREATE INDEX IF NOT EXISTS website_works_partition_status_order_index
        ON website_works (partition, status, display_order, updated_at DESC)`,
      sql`CREATE TABLE IF NOT EXISTS website_works_audit (
        id bigserial PRIMARY KEY,
        work_id text,
        action text NOT NULL,
        details jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
    ]);

    for (const work of seedWorks) {
      await sql`INSERT INTO website_works (
        id, partition, title, kicker, summary, cover_url, cover_alt, href,
        version_label, tags, show_on_homepage, status, display_order, published_at
      ) VALUES (
        ${work.id}, 'student', ${work.title}, ${work.kicker}, ${work.summary},
        ${work.cover}, ${work.coverAlt}, ${work.href}, ${work.version},
        ${JSON.stringify(work.tags)}::jsonb, ${work.showOnHomepage !== false}, 'published', ${work.displayOrder}, now()
      ) ON CONFLICT (id) DO NOTHING`;
    }
  })().catch((error) => {
    worksSchemaPromise = null;
    throw error;
  });
  return worksSchemaPromise;
}

export function serializeWork(row, { includePrivate = false } = {}) {
  const result = {
    id: row.id,
    partition: row.partition,
    title: row.title,
    kicker: row.kicker,
    summary: row.summary,
    cover: row.cover_url,
    coverAlt: row.cover_alt,
    href: row.href,
    version: row.version_label,
    tags: Array.isArray(row.tags) ? row.tags : [],
    showOnHomepage: row.show_on_homepage,
    status: includePrivate ? row.status : undefined,
    statusLabel: includePrivate ? (row.status === "published" ? "已上线" : row.status === "archived" ? "已归档" : "草稿") : undefined,
    displayOrder: row.display_order,
    updatedAt: includePrivate ? row.updated_at : undefined,
    publishedAt: includePrivate ? row.published_at : undefined,
  };
  return Object.fromEntries(Object.entries(result).filter(([, value]) => value !== undefined));
}
