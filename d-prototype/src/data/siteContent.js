import {
  Boxes,
  Brush,
  CalendarCheck,
  Code2,
  FlaskConical,
  Presentation,
  Sparkles,
} from "lucide-react";

export const assetSlots = {
  heroVideo: "/assets/xinghai-orbital-hero.mp4",
  heroPoster: "/assets/xinghai-hero-poster.webp",
  orbitMap: "/assets/ability-orbit-map.webp",
  showcase: "/assets/student-output-showcase.webp",
  finalCta: "/assets/final-cta-portal.webp",
};

export const abilities = [
  {
    id: "business-lab",
    name: "商业实验室",
    icon: FlaskConical,
    orbit: 0,
    accent: "#ffcf6b",
    coordinates: { x: 29, y: 36 },
    tagline: "把一个想法变成一个产品。",
    training: "产品思维 / 用户意识 / 商业表达",
    childBuilds: "AI 小品牌 / 产品发布页 / 商业路演",
    output: "品牌主页 / 海报 / 1分钟发布稿",
    image: "/assets/ability-business-lab.webp",
  },
  {
    id: "code-workshop",
    name: "代码工坊",
    icon: Code2,
    orbit: 1,
    accent: "#63f7d4",
    coordinates: { x: 67, y: 28 },
    tagline: "把创意真正搭出来。",
    training: "Coding / 工程思维 / AI 协作开发",
    childBuilds: "个人网站 / AI 助手原型 / 项目展示页",
    output: "作品网站 / 功能演示 / 页面原型",
    image: "/assets/ability-code-workshop.webp",
  },
  {
    id: "creative-studio",
    name: "创造力工作室",
    icon: Brush,
    orbit: 2,
    accent: "#b9a1ff",
    coordinates: { x: 76, y: 58 },
    tagline: "把脑海里的想象变成作品。",
    training: "审美 / 视觉表达 / 创意生成",
    childBuilds: "角色设计 / 海报 / 故事世界观 / 视觉创作",
    output: "主视觉 / 角色图 / 创意作品集",
    image: "/assets/ability-creative-studio.webp",
  },
  {
    id: "expression-theater",
    name: "表达剧场",
    icon: Presentation,
    orbit: 3,
    accent: "#6ee8ff",
    coordinates: { x: 44, y: 68 },
    tagline: "把作品讲清楚，把观点讲出来。",
    training: "表达力 / 路演能力 / 观点组织",
    childBuilds: "60秒路演 / 项目发布 / 创作过程讲解",
    output: "路演稿 / 发布视频 / 现场展示",
    image: "/assets/ability-expression-theater.webp",
  },
  {
    id: "personal-ip-factory",
    name: "个人IP工厂",
    icon: Boxes,
    orbit: 4,
    accent: "#8dff7a",
    coordinates: { x: 57, y: 45 },
    tagline: "让孩子的作品被看见。",
    training: "新媒体表达 / 作品包装 / 个人影响力",
    childBuilds: "个人主页 / 作品短视频 / 创作者介绍卡",
    output: "个人IP主页 / 作品发布卡 / 项目视频",
    image: "/assets/ability-personal-ip.webp",
  },
];

export const journey = [
  {
    step: "01",
    title: "提出一个真实想法",
    text: "从孩子自己的兴趣、问题或观察出发，先确认要做给谁看。",
  },
  {
    step: "02",
    title: "用 AI 扩展成方案",
    text: "把模糊点子拆成产品、视觉、代码、表达和发布任务。",
  },
  {
    step: "03",
    title: "做出可展示作品",
    text: "形成网页、海报、视频、演示稿或项目原型，而不是只停留在学习工具。",
  },
  {
    step: "04",
    title: "完成一次公开表达",
    text: "用路演、作品页或短视频讲清楚作品的价值、过程和下一步。",
  },
];

export const outputs = [
  "AI 小品牌",
  "个人主页",
  "作品发布页",
  "AI 助手原型",
  "项目路演稿",
  "创作者介绍卡",
];

export const faqs = [
  {
    question: "孩子没有编程基础可以参加吗？",
    answer:
      "可以。星海计划不是先考编程，而是用项目目标带出 AI 协作、表达、视觉和工程思维。",
  },
  {
    question: "最后能看到什么成果？",
    answer:
      "每个项目都会收束到可展示产出，例如网站、海报、发布页、项目视频或路演稿。",
  },
  {
    question: "为什么要先做 1V1 项目评估？",
    answer:
      "我们需要先判断孩子的兴趣、基础和适合的项目方向，再安排具体训练路径。",
  },
];

export const navItems = [
  { label: "能力区", href: "#abilities" },
  { label: "项目路径", href: "#journey" },
  { label: "作品产出", href: "#outputs" },
  { label: "预约评估", href: "#assessment", icon: CalendarCheck },
];

export const heroBadges = [
  { label: "AI", value: "创造力" },
  { label: "5", value: "能力区" },
  { label: "1V1", value: "项目评估" },
];

export const proofPoints = [
  {
    icon: Sparkles,
    title: "不是工具课",
    text: "所有工具都服务于孩子自己的作品，而不是停在功能演示。",
  },
  {
    icon: Code2,
    title: "不是空想课",
    text: "每个阶段都要落成网页、视觉、发布稿或路演表达。",
  },
  {
    icon: Presentation,
    title: "不是只会做",
    text: "孩子还要学会把作品讲清楚，让想法被看见。",
  },
];
