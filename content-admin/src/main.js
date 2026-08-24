import { upload } from "@vercel/blob/client";
import { validateMediaFile } from "./media-rules.js";
import "./styles.css";

const app = document.querySelector("#app");

const emptySlide = () => ({
  id: "",
  headline: "",
  projectName: "",
  ageAtCapture: "",
  studentDisplayName: "",
  showStudentName: false,
  projectUrl: "",
  videoUrl: "",
  posterUrl: "",
  videoAlt: "",
  desktopTextPosition: "left-middle",
  mobileTextPosition: "top",
  mediaFocalPoint: { x: 50, y: 50 },
  status: "draft",
  displayOrder: 100,
  dataQuality: { ageMissing: true, posterMissing: true, projectLinkMissing: true },
});

const emptyWork = () => ({
  id: "",
  partition: "student",
  title: "",
  kicker: "",
  summary: "",
  cover: "",
  coverAlt: "",
  href: "",
  version: "",
  tags: [],
  showOnHomepage: true,
  status: "draft",
  displayOrder: 100,
});

const state = {
  authenticated: null,
  module: "hero",
  slides: [],
  works: [],
  submissions: [],
  selectedSlideId: null,
  selectedWorkId: null,
  selectedSubmissionId: null,
  heroDraft: emptySlide(),
  workDraft: emptyWork(),
  previewMode: "desktop",
  busy: false,
  uploadProgress: {},
  notice: "",
  error: "",
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[char]);
}

function api(path, options = {}) {
  return fetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  }).then(async (response) => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || "请求失败");
      error.status = response.status;
      throw error;
    }
    return payload;
  });
}

function statusLabel(item) {
  if (item.status === "published") return "已上线";
  if (item.status === "archived") return "已归档";
  return "草稿";
}

function submissionStatusLabel(item) {
  if (item.status === "approved") return "通过初审";
  if (item.status === "rejected") return "不采用";
  if (item.status === "handled") return "已处理";
  return "待审核";
}

function submissionDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function contextLine(slide) {
  return [
    slide.showStudentName && slide.studentDisplayName ? slide.studentDisplayName : "",
    slide.ageAtCapture ? `${slide.ageAtCapture}岁` : "",
    slide.projectName || "项目名称",
  ].filter(Boolean).join(" · ");
}

function renderLogin() {
  app.innerHTML = `
    <main class="login-shell">
      <section class="login-card" aria-labelledby="login-title">
        <img src="/assets/todo-shield.png" alt="" class="login-mark">
        <p class="eyebrow">内部管理入口</p>
        <h1 id="login-title">网站内容后台</h1>
        <p class="login-copy">统一管理首页首屏和作品展馆内容。</p>
        <form id="login-form">
          <label><span>管理员密码</span><input name="password" type="password" autocomplete="current-password" required></label>
          <button class="button primary" type="submit" ${state.busy ? "disabled" : ""}>${state.busy ? "正在登录…" : "进入后台"}</button>
          ${state.error ? `<p class="form-error" role="alert">${escapeHtml(state.error)}</p>` : ""}
        </form>
      </section>
    </main>`;
  document.querySelector("#login-form").addEventListener("submit", login);
}

function renderHeroList() {
  const items = state.slides.map((slide, index) => `
    <article class="content-row ${state.selectedSlideId === slide.id ? "is-selected" : ""}">
      <button class="content-select" type="button" data-action="select-hero" data-id="${slide.id}">
        <span class="row-index">${String(index + 1).padStart(2, "0")}</span>
        <span class="row-copy"><strong>${escapeHtml(slide.projectName)}</strong><small>${slide.ageAtCapture ? `${slide.ageAtCapture}岁` : "年龄待补"} · ${statusLabel(slide)}</small></span>
        ${slide.dataQuality?.ageMissing ? `<span class="quality-dot" title="年龄待补"></span>` : ""}
      </button>
      <div class="row-move"><button type="button" data-action="move-up" data-id="${slide.id}" aria-label="向前移动" ${index === 0 ? "disabled" : ""}>↑</button><button type="button" data-action="move-down" data-id="${slide.id}" aria-label="向后移动" ${index === state.slides.length - 1 ? "disabled" : ""}>↓</button></div>
    </article>`).join("");
  return renderContentList("首屏内容", `${state.slides.filter((slide) => slide.status === "published").length} 条已上线`, items, "新增首屏内容");
}

function renderWorksList() {
  const items = state.works.map((work, index) => `
    <article class="content-row ${state.selectedWorkId === work.id ? "is-selected" : ""}">
      <button class="content-select" type="button" data-action="select-work" data-id="${work.id}">
        <span class="row-index">${String(index + 1).padStart(2, "0")}</span>
        <span class="row-copy"><strong>${escapeHtml(work.title)}</strong><small>${work.partition === "official" ? "官方与老师" : "学员作品"} · ${statusLabel(work)}</small></span>
        ${work.showOnHomepage ? `<span class="home-dot" title="首页展示"></span>` : ""}
      </button>
      <div class="row-move"><button type="button" data-action="move-up" data-id="${work.id}" aria-label="向前移动" ${index === 0 ? "disabled" : ""}>↑</button><button type="button" data-action="move-down" data-id="${work.id}" aria-label="向后移动" ${index === state.works.length - 1 ? "disabled" : ""}>↓</button></div>
    </article>`).join("");
  return renderContentList("作品展馆", `${state.works.filter((work) => work.status === "published").length} 条已上线`, items, "新增作品");
}

function renderSubmissionList() {
  const pendingCount = state.submissions.filter((item) => item.status === "pending").length;
  const items = state.submissions.map((item, index) => `
    <article class="content-row review-row ${state.selectedSubmissionId === item.id ? "is-selected" : ""}">
      <button class="content-select" type="button" data-action="select-submission" data-id="${escapeHtml(item.id)}">
        <span class="row-index">${String(index + 1).padStart(2, "0")}</span>
        <span class="row-copy"><strong>${item.kind === "remind" ? "催老师上新" : escapeHtml(item.note || "参考推荐")}</strong><small>${submissionDate(item.createdAt)} · ${submissionStatusLabel(item)}</small></span>
        ${item.status === "pending" ? `<span class="quality-dot" title="待审核"></span>` : ""}
      </button>
    </article>`).join("");
  return `
    <aside class="content-list">
      <div class="list-heading"><div><span>美学待审核</span><small>${pendingCount ? `${pendingCount} 条待处理` : "没有新的待处理内容"}</small></div></div>
      <div class="content-rows">${items || `<div class="empty-list">孩子的推荐和催更会出现在这里。</div>`}</div>
    </aside>`;
}

function renderContentList(title, subtitle, items, addLabel) {
  return `
    <aside class="content-list">
      <div class="list-heading"><div><span>${title}</span><small>${subtitle}</small></div><button class="icon-button" data-action="add" type="button" aria-label="${addLabel}">＋</button></div>
      <div class="content-rows">${items || `<div class="empty-list">还没有内容，先新增一条。</div>`}</div>
    </aside>`;
}

function field(name, label, value, options = {}) {
  const type = options.type || "text";
  const hint = options.hint ? `<small>${options.hint}</small>` : "";
  if (options.textarea) return `<label class="field ${options.wide ? "wide" : ""}"><span>${label}</span><textarea name="${name}" maxlength="${options.max || 120}" ${options.required ? "required" : ""}>${escapeHtml(value)}</textarea>${hint}</label>`;
  const minAttribute = type === "number" && options.min != null ? `min="${options.min}"` : "";
  const maxAttribute = type === "number" && options.max != null ? `max="${options.max}"` : options.max ? `maxlength="${options.max}"` : "";
  return `<label class="field ${options.wide ? "wide" : ""}"><span>${label}</span><input name="${name}" type="${type}" value="${escapeHtml(value)}" ${minAttribute} ${maxAttribute} ${options.required ? "required" : ""}>${hint}</label>`;
}

function selectField(name, label, value, options, hint = "") {
  return `<label class="field"><span>${label}</span><select name="${name}">${options.map(([optionValue, optionLabel]) => `<option value="${optionValue}" ${value === optionValue ? "selected" : ""}>${optionLabel}</option>`).join("")}</select>${hint ? `<small>${hint}</small>` : ""}</label>`;
}

function renderImpactFigure(kind) {
  const labels = {
    headline: ["大标题", "影响视频上的主要文字"],
    context: ["孩子与项目", "影响大标题上方的辅助信息"],
    media: ["视频与封面", "影响整张首屏画面"],
    position: ["文字与人物位置", "影响文字安全位和人物裁切"],
  };
  const [label, copy] = labels[kind];
  return `<figure class="impact-figure impact-kind-${kind}"><div class="impact-screen"><i class="impact-media"></i><span class="impact-context"></span><b class="impact-headline"></b><em class="impact-focus"></em></div><figcaption><strong>${label}示意</strong><span>${copy}</span></figcaption></figure>`;
}

function renderHeroPreview(slide) {
  const isMobile = state.previewMode === "mobile";
  const mediaStyle = `object-position:${slide.mediaFocalPoint?.x ?? 50}% ${slide.mediaFocalPoint?.y ?? 50}%`;
  const media = slide.videoUrl
    ? `<video src="${escapeHtml(slide.videoUrl)}" poster="${escapeHtml(slide.posterUrl)}" muted autoplay loop playsinline style="${mediaStyle}"></video>`
    : slide.posterUrl ? `<img src="${escapeHtml(slide.posterUrl)}" alt="" style="${mediaStyle}">` : `<div class="preview-empty">上传视频后在这里预览</div>`;
  return `
    <section class="preview-panel hero-live-preview">
      <div class="preview-heading"><div><span>实时预览</span><small>标题和说明会随输入同步变化</small></div><div class="preview-tabs"><button type="button" data-action="preview-desktop" class="${isMobile ? "" : "is-active"}">桌面</button><button type="button" data-action="preview-mobile" class="${isMobile ? "is-active" : ""}">手机</button></div></div>
      <div class="preview-stage ${isMobile ? "is-mobile" : "is-desktop"} position-${escapeHtml(slide.desktopTextPosition)}">
        ${media}<div class="preview-veil"></div><div class="preview-brand">图度AI未来学校</div>
        <div class="preview-copy"><p>${escapeHtml(contextLine(slide))}</p><h2>${escapeHtml(slide.headline || "在这里预览视频大标题")}</h2></div>
        <div class="preview-progress"><i></i><i></i><i></i><i></i></div>
      </div>
      <p class="preview-note">这是运营预览，不会替代作品本身，也不会在保存前影响线上。</p>
    </section>`;
}

function renderWorkPreview(work) {
  const tags = (work.tags || []).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("");
  return `
    <section class="preview-panel work-live-preview">
      <div class="preview-heading"><div><span>展馆卡片预览</span><small>对应作品页中的展示信息</small></div></div>
      <article class="work-preview-card">
        <div class="work-preview-cover">${work.cover ? `<img src="${escapeHtml(work.cover)}" alt="">` : `<span>上传作品封面</span>`}</div>
        <div class="work-preview-meta"><span>${escapeHtml(work.kicker || "作品类型")}</span><span>${escapeHtml(work.version || "版本")}</span></div>
        <h2>${escapeHtml(work.title || "作品标题")}</h2>
        <p>${escapeHtml(work.summary || "这里显示作品摘要，帮助家长理解孩子做了什么。")}</p>
        <div class="work-preview-tags">${tags || "<span>标签</span>"}</div>
        <div class="work-preview-open">打开作品 →</div>
      </article>
      <div class="preview-publish-state"><span>${work.partition === "official" ? "官方与老师作品" : "学员作品"}</span><span>${work.showOnHomepage ? "同时展示在首页" : "只展示在作品展馆"}</span></div>
    </section>`;
}

function renderHeroEditor() {
  const slide = state.heroDraft;
  const ageWarning = !slide.ageAtCapture ? `<div class="quality-warning"><strong>年龄待补</strong><span>请填写拍摄时真实年龄；不知道就留空，不能推测。</span></div>` : "";
  const positions = [
    ["left-top", "左上", "人物在右侧或下方"], ["left-middle", "左中", "人物主体在右侧"],
    ["right-top", "右上", "人物在左侧或下方"], ["right-middle", "右中", "人物主体在左侧"],
  ].map(([value, label, help]) => `<label class="position-option"><input type="radio" name="desktopTextPosition" value="${value}" ${slide.desktopTextPosition === value ? "checked" : ""}><span><b>${label}</b><small>${help}</small></span></label>`).join("");
  return `
    <div class="editor-with-preview">
      <main class="editor-shell">
        <div class="editor-title"><div><p class="eyebrow">首页首屏</p><h1>${slide.id ? "编辑首屏内容" : "新增首屏内容"}</h1></div><span class="status status-${slide.status}">${statusLabel(slide)}</span></div>
        ${ageWarning}
        <form id="hero-form">
          <section class="form-section"><div class="section-heading"><span>01</span><div><h2>视频上的大标题</h2><p>先写最重要的一句话，再补其他信息。</p></div></div><div class="section-content"><div class="field-grid">${field("headline", "大标题（可编辑）", slide.headline, { textarea: true, required: true, max: 90, wide: true, hint: "建议 12–28 个字，只写画面能够证明的一件事" })}</div>${renderImpactFigure("headline")}</div></section>
          <section class="form-section"><div class="section-heading"><span>02</span><div><h2>孩子与项目</h2><p>补充家长判断这段视频所需的背景。</p></div></div><div class="section-content"><div class="field-grid">
            ${field("ageAtCapture", "拍摄时年龄", slide.ageAtCapture, { type: "number", min: 4, max: 18, hint: "填写拍摄当天周岁；不知道就留空" })}
            ${field("projectName", "正在做的项目", slide.projectName, { required: true, max: 48, hint: "建议 4–12 个字，例如“历史学习软件”" })}
            ${field("studentDisplayName", "孩子展示名（可选）", slide.studentDisplayName, { max: 30, hint: "默认不公开" })}
            ${field("projectUrl", "项目链接（可选）", slide.projectUrl, { type: "url", max: 600, hint: "已有正式作品页时再填" })}
            <label class="check-field wide"><input name="showStudentName" type="checkbox" ${slide.showStudentName ? "checked" : ""}><span>已确认可以在公开首屏显示孩子展示名</span></label>
          </div>${renderImpactFigure("context")}</div></section>
          <section class="form-section"><div class="section-heading"><span>03</span><div><h2>视频与封面</h2><p>素材决定整个首屏的画面质量。</p></div></div><div class="section-content"><div class="field-grid">
            <div class="requirements-box wide"><strong>视频文件要求</strong><p><b>支持：</b>MP4 或 WebM，不超过 300MB。</p><p><b>推荐：</b>横屏 16:9，1920×1080 或 1280×720，24/25/30 帧，8–20 秒。</p><p><b>不要：</b>烧录字幕、旧标识、黑边或片内标题。</p></div>
            <label class="upload-field wide"><input class="file-input" id="video-file" type="file" accept="video/mp4,video/webm"><span class="upload-action">选择视频文件</span><span class="upload-status">${state.uploadProgress.video != null ? `正在上传 ${state.uploadProgress.video}%` : "选择后立即上传"}</span></label>
            ${field("videoUrl", "视频链接（自动生成）", slide.videoUrl, { type: "url", required: true, max: 600, wide: true })}
            <div class="requirements-box wide"><strong>封面图片要求</strong><p>JPG、PNG 或 WebP，不超过 10MB；推荐 16:9 清晰静帧，不叠文字。</p></div>
            <label class="upload-field wide"><input class="file-input" id="poster-file" type="file" accept="image/jpeg,image/png,image/webp"><span class="upload-action">选择封面图片</span><span class="upload-status">${state.uploadProgress.poster != null ? `正在上传 ${state.uploadProgress.poster}%` : "用于视频尚未播放时的第一帧"}</span></label>
            ${field("posterUrl", "封面链接（自动生成）", slide.posterUrl, { type: "url", max: 600, wide: true })}
            ${field("videoAlt", "画面说明", slide.videoAlt, { required: true, max: 100, wide: true, hint: "用一句话说明谁在做什么" })}
          </div>${renderImpactFigure("media")}</div></section>
          <section class="form-section"><div class="section-heading"><span>04</span><div><h2>文字与人物位置</h2><p>选择文字安全位，再微调人物裁切。</p></div></div><div class="section-content"><div class="position-grid">${positions}</div><p class="position-help">滑杆只移动视频裁切中心，不会移动文字。</p><div class="range-grid"><label><span>人物横向焦点 <b>${slide.mediaFocalPoint?.x ?? 50}%</b></span><input name="focalX" type="range" min="0" max="100" value="${slide.mediaFocalPoint?.x ?? 50}"></label><label><span>人物纵向焦点 <b>${slide.mediaFocalPoint?.y ?? 50}%</b></span><input name="focalY" type="range" min="0" max="100" value="${slide.mediaFocalPoint?.y ?? 50}"></label></div>${renderImpactFigure("position")}</div></section>
        </form>
      </main>
      <aside class="preview-column">${renderHeroPreview(slide)}</aside>
    </div>`;
}

function renderWorkEditor() {
  const work = state.workDraft;
  return `
    <div class="editor-with-preview">
      <main class="editor-shell">
        <div class="editor-title"><div><p class="eyebrow">作品展馆</p><h1>${work.id ? "编辑作品卡片" : "新增作品卡片"}</h1><p class="editor-subtitle">这里只控制展馆和首页的展示信息，不会修改作品详情页本身。</p></div><span class="status status-${work.status}">${statusLabel(work)}</span></div>
        <form id="work-form">
          <section class="form-section"><div class="section-heading"><span>01</span><div><h2>作品标题与身份</h2><p>决定作品在哪个分区、以什么名字出现。</p></div></div><div class="section-content"><div class="field-grid">
            ${selectField("partition", "作品分区", work.partition, [["student", "学员作品"], ["official", "官方与老师作品"]], "分区会影响作品页标签")}
            ${field("version", "版本标记（可选）", work.version, { max: 20, hint: "例如 2026.08" })}
            ${field("title", "作品标题", work.title, { required: true, max: 60, wide: true, hint: "建议 4–16 个字" })}
            ${field("kicker", "作品短类型", work.kicker, { required: true, max: 60, wide: true, hint: "例如“海洋环保视觉项目”" })}
          </div></div></section>
          <section class="form-section"><div class="section-heading"><span>02</span><div><h2>作品介绍</h2><p>让家长快速理解孩子具体做了什么。</p></div></div><div class="section-content"><div class="field-grid">
            ${field("summary", "作品摘要", work.summary, { textarea: true, required: true, max: 260, wide: true, hint: "写具体内容和可见成果，不写空泛评价" })}
            ${field("tags", "作品标签", (work.tags || []).join("，"), { required: true, max: 120, wide: true, hint: "用逗号分隔，最多 5 个" })}
          </div></div></section>
          <section class="form-section"><div class="section-heading"><span>03</span><div><h2>作品封面</h2><p>同时用于作品展馆和首页作品走马灯。</p></div></div><div class="section-content"><div class="field-grid">
            <div class="requirements-box wide"><strong>封面要求</strong><p>JPG、PNG 或 WebP，不超过 10MB；必须是 16:9，建议 1600×900，不叠标题和边框。</p></div>
            <label class="upload-field wide"><input class="file-input" id="work-cover-file" type="file" accept="image/jpeg,image/png,image/webp"><span class="upload-action">选择作品封面</span><span class="upload-status">${state.uploadProgress.workCover != null ? `正在上传 ${state.uploadProgress.workCover}%` : "上传后自动回填链接"}</span></label>
            ${field("cover", "封面链接", work.cover, { required: true, max: 600, wide: true, hint: "支持站内路径或 https:// 地址" })}
            ${field("coverAlt", "封面说明", work.coverAlt, { required: true, max: 120, wide: true, hint: "说明封面里是什么，不写“图片”二字" })}
          </div></div></section>
          <section class="form-section"><div class="section-heading"><span>04</span><div><h2>作品链接与展示</h2><p>控制点开去哪里，以及是否出现在首页。</p></div></div><div class="section-content"><div class="field-grid">
            ${field("href", "作品链接", work.href, { required: true, max: 600, wide: true, hint: "站内路径例如 /projects/ocean-environment/，也支持 https:// 地址" })}
            <label class="check-field wide"><input name="showOnHomepage" type="checkbox" ${work.showOnHomepage ? "checked" : ""}><span>同时展示在正式首页作品走马灯</span></label>
          </div></div></section>
        </form>
      </main>
      <aside class="preview-column">${renderWorkPreview(work)}</aside>
    </div>`;
}

function renderSubmissionEditor() {
  const item = state.submissions.find((submission) => submission.id === state.selectedSubmissionId);
  if (!item) return `
    <main class="review-editor review-empty">
      <p class="eyebrow">美学教育</p>
      <h1>还没有推荐</h1>
      <p>孩子提交的参考和催更会进入这里，审核后再决定是否整理进展馆。</p>
    </main>`;

  const isPending = item.status === "pending";
  const media = item.imageUrl
    ? `<div class="review-image"><img src="${escapeHtml(item.imageUrl)}" alt="孩子推荐的参考图片"></div>`
    : `<div class="review-image review-image-empty"><span>${item.kind === "remind" ? "这是一条催更，不含图片" : "这条推荐没有上传图片"}</span></div>`;
  return `
    <main class="review-editor">
      <div class="editor-title"><div><p class="eyebrow">${item.kind === "remind" ? "催老师上新" : "参考推荐"}</p><h1>${item.kind === "remind" ? "孩子想继续看新的" : "看看这个参考是否适合展馆"}</h1></div><span class="status status-${escapeHtml(item.status)}">${submissionStatusLabel(item)}</span></div>
      <div class="review-layout">
        ${media}
        <section class="review-copy">
          <div><span>收到时间</span><p>${submissionDate(item.createdAt)}</p></div>
          ${item.kind === "reference" ? `<div><span>推荐理由</span><p>${escapeHtml(item.note)}</p></div>` : `<div><span>孩子的动作</span><p>匿名提醒老师继续补充新的美学参考。</p></div>`}
          ${item.sourceUrl ? `<div><span>原网页</span><p><a href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noreferrer">打开来源页面 ↗</a></p></div>` : ""}
          <p class="review-safety">公开前仍需检查题材、来源、版权和儿童适龄性。通过初审不会自动发布到展馆。</p>
          ${isPending ? `<div class="review-actions">${item.kind === "remind"
            ? `<button class="button primary" type="button" data-action="review-handle" data-id="${escapeHtml(item.id)}">已收到，稍后上新</button>`
            : `<button class="button primary" type="button" data-action="review-approve" data-id="${escapeHtml(item.id)}">通过初审</button><button class="button secondary" type="button" data-action="review-reject" data-id="${escapeHtml(item.id)}">不采用</button>`}
          </div>` : `<p class="reviewed-note">这条内容已经处理。</p>`}
          ${state.error ? `<p class="form-error" role="alert">${escapeHtml(state.error)}</p>` : state.notice ? `<p class="inline-success">${escapeHtml(state.notice)}</p>` : ""}
        </section>
      </div>
    </main>`;
}

function renderActionBar() {
  const item = state.module === "hero" ? state.heroDraft : state.workDraft;
  return `<div class="action-bar"><span>${state.error ? `<b class="inline-error">${escapeHtml(state.error)}</b>` : state.notice ? `<b class="inline-success">${escapeHtml(state.notice)}</b>` : "修改只在保存后进入数据库"}</span><div><button class="button secondary" type="button" data-action="save" ${state.busy ? "disabled" : ""}>保存草稿</button>${item.status === "published" ? `<button class="button secondary" type="button" data-action="unpublish">下线</button>` : `<button class="button primary" type="button" data-action="publish">保存并上线</button>`}${item.id ? `<button class="text-button" type="button" data-action="archive">归档</button>` : ""}</div></div>`;
}

function renderApp() {
  const isAesthetic = state.module === "aesthetic";
  const contentList = state.module === "hero" ? renderHeroList() : state.module === "works" ? renderWorksList() : renderSubmissionList();
  const editor = state.module === "hero" ? renderHeroEditor() : state.module === "works" ? renderWorkEditor() : renderSubmissionEditor();
  const pageHref = state.module === "hero" ? "https://todo-video-hero-aug9-2026.vercel.app/" : state.module === "works" ? "/works" : "/aesthetic";
  const pendingCount = state.submissions.filter((item) => item.status === "pending").length;
  app.innerHTML = `
    <div class="admin-app">
      <header class="topbar"><div class="topbar-brand"><img src="/assets/todo-shield.png" alt=""><div><strong>图度网站内容后台</strong><small>电脑端内容管理</small></div></div><nav><a href="${pageHref}" target="_blank" rel="noreferrer">打开对应页面 ↗</a><button type="button" data-action="logout">退出</button></nav></header>
      <div class="module-tabs" role="tablist"><button type="button" data-module="hero" class="${state.module === "hero" ? "is-active" : ""}">首页首屏</button><button type="button" data-module="works" class="${state.module === "works" ? "is-active" : ""}">作品展馆</button><button type="button" data-module="aesthetic" class="${isAesthetic ? "is-active" : ""}">美学待审核${pendingCount ? ` · ${pendingCount}` : ""}</button></div>
      <div class="desktop-note">建议使用电脑编辑和上传素材；手机端仅保留基础查看与应急修改。</div>
      <div class="workspace ${isAesthetic ? "review-workspace" : ""}">${contentList}<div class="module-editor">${editor}</div></div>
      ${isAesthetic ? "" : renderActionBar()}
    </div>`;
  bindEvents();
}

function render() {
  if (state.authenticated === false) return renderLogin();
  if (state.authenticated === null) {
    app.innerHTML = `<div class="loading-screen"><span></span><p>正在读取内容后台…</p></div>`;
    return;
  }
  renderApp();
}

function syncHeroDraft() {
  const form = document.querySelector("#hero-form");
  if (!form) return;
  const values = new FormData(form);
  state.heroDraft = { ...state.heroDraft,
    headline: values.get("headline"),
    ageAtCapture: values.get("ageAtCapture"), projectName: values.get("projectName"),
    studentDisplayName: values.get("studentDisplayName"), showStudentName: values.get("showStudentName") === "on",
    projectUrl: values.get("projectUrl"), videoUrl: values.get("videoUrl"), posterUrl: values.get("posterUrl"),
    videoAlt: values.get("videoAlt"), desktopTextPosition: values.get("desktopTextPosition") || "left-middle",
    mediaFocalPoint: { x: Number(values.get("focalX")), y: Number(values.get("focalY")) },
  };
}

function syncWorkDraft() {
  const form = document.querySelector("#work-form");
  if (!form) return;
  const values = new FormData(form);
  state.workDraft = { ...state.workDraft,
    partition: values.get("partition") || "student", title: values.get("title"), kicker: values.get("kicker"),
    summary: values.get("summary"), cover: values.get("cover"), coverAlt: values.get("coverAlt"), href: values.get("href"),
    version: values.get("version"), tags: String(values.get("tags") || "").split(/[，,]/u).map((tag) => tag.trim()).filter(Boolean),
    showOnHomepage: values.get("showOnHomepage") === "on",
  };
}

function syncActiveDraft() {
  if (state.module === "hero") syncHeroDraft();
  if (state.module === "works") syncWorkDraft();
}

function refreshPreview() {
  syncActiveDraft();
  const column = document.querySelector(".preview-column");
  if (!column) return;
  column.innerHTML = state.module === "hero" ? renderHeroPreview(state.heroDraft) : renderWorkPreview(state.workDraft);
  bindPreviewEvents();
  document.querySelectorAll(".range-grid b").forEach((label, index) => {
    label.textContent = `${index === 0 ? state.heroDraft.mediaFocalPoint.x : state.heroDraft.mediaFocalPoint.y}%`;
  });
}

function selectHero(id) {
  const slide = state.slides.find((item) => item.id === id);
  if (!slide) return;
  state.selectedSlideId = id;
  state.heroDraft = structuredClone(slide);
  clearMessages();
  render();
}

function selectWork(id) {
  const work = state.works.find((item) => item.id === id);
  if (!work) return;
  state.selectedWorkId = id;
  state.workDraft = structuredClone(work);
  clearMessages();
  render();
}

function selectSubmission(id) {
  if (!state.submissions.some((item) => item.id === id)) return;
  state.selectedSubmissionId = id;
  clearMessages();
  render();
}

function clearMessages() {
  state.error = "";
  state.notice = "";
}

async function loadContent() {
  try {
    const heroResult = await api("/api/content/admin");
    state.authenticated = true;
    state.slides = heroResult.slides;
    const slide = state.slides.find((item) => item.id === state.selectedSlideId) || state.slides[0];
    if (slide) { state.selectedSlideId = slide.id; state.heroDraft = structuredClone(slide); }
    const worksResult = await api("/api/content/works-admin");
    state.works = worksResult.works;
    const work = state.works.find((item) => item.id === state.selectedWorkId) || state.works[0];
    if (work) { state.selectedWorkId = work.id; state.workDraft = structuredClone(work); }
    try {
      const aestheticResult = await api("/api/aesthetic?mode=admin");
      state.submissions = aestheticResult.submissions;
      const submission = state.submissions.find((item) => item.id === state.selectedSubmissionId) || state.submissions[0];
      if (submission) state.selectedSubmissionId = submission.id;
    } catch (error) {
      if (error.status === 401) throw error;
      state.error = `美学推荐暂时没读到：${error.message}`;
    }
  } catch (error) {
    state.authenticated = false;
    if (error.status !== 401) state.error = error.message;
  }
  render();
}

async function login(event) {
  event.preventDefault();
  const password = new FormData(event.currentTarget).get("password");
  state.busy = true;
  clearMessages();
  render();
  try {
    await api("/api/admin/login", { method: "POST", body: JSON.stringify({ password }) });
    state.authenticated = true;
    await loadContent();
  } catch (error) {
    state.busy = false;
    state.authenticated = false;
    state.error = error.message;
    render();
  }
}

async function saveActive({ quiet = false } = {}) {
  syncActiveDraft();
  state.busy = true;
  state.error = "";
  if (!quiet) state.notice = "";
  const isHero = state.module === "hero";
  const endpoint = isHero ? "/api/content/admin" : "/api/content/works-admin";
  const payload = isHero ? { action: "save", slide: state.heroDraft } : { action: "save", work: state.workDraft };
  try {
    const result = await api(endpoint, { method: "POST", body: JSON.stringify(payload) });
    if (isHero) {
      state.slides = result.slides; state.selectedSlideId = result.id;
      state.heroDraft = structuredClone(state.slides.find((item) => item.id === result.id));
    } else {
      state.works = result.works; state.selectedWorkId = result.id;
      state.workDraft = structuredClone(state.works.find((item) => item.id === result.id));
    }
    if (!quiet) state.notice = "草稿已保存";
    return result.id;
  } catch (error) {
    state.error = error.message;
    return null;
  } finally {
    state.busy = false;
    render();
  }
}

async function runStatusAction(action, id) {
  const isHero = state.module === "hero";
  const endpoint = isHero ? "/api/content/admin" : "/api/content/works-admin";
  state.busy = true;
  state.error = "";
  try {
    const result = await api(endpoint, { method: "POST", body: JSON.stringify({ action, id }) });
    if (isHero) {
      state.slides = result.slides;
      const item = state.slides.find((slide) => slide.id === id) || state.slides[0];
      if (item) { state.selectedSlideId = item.id; state.heroDraft = structuredClone(item); }
    } else {
      state.works = result.works;
      const item = state.works.find((work) => work.id === id) || state.works[0];
      if (item) { state.selectedWorkId = item.id; state.workDraft = structuredClone(item); }
    }
    state.notice = action === "publish" ? "已经上线" : action === "unpublish" ? "已经下线" : "已经归档";
  } catch (error) { state.error = error.message; }
  finally { state.busy = false; render(); }
}

async function runReviewAction(action, id) {
  state.busy = true;
  clearMessages();
  try {
    const result = await api("/api/aesthetic?mode=admin", { method: "POST", body: JSON.stringify({ action, id }) });
    state.submissions = result.submissions;
    state.selectedSubmissionId = state.submissions.find((item) => item.id === id)?.id || state.submissions[0]?.id || null;
    state.notice = action === "approve" ? "已通过初审，公开前还需要整理来源与内容" : action === "reject" ? "已标记为不采用" : "已记下这次催更";
  } catch (error) {
    state.error = error.message;
  } finally {
    state.busy = false;
    render();
  }
}

async function publishActive() {
  const id = await saveActive({ quiet: true });
  if (id) await runStatusAction("publish", id);
}

async function reorder(id, delta) {
  const isHero = state.module === "hero";
  const items = [...(isHero ? state.slides : state.works)];
  const index = items.findIndex((item) => item.id === id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= items.length) return;
  [items[index], items[target]] = [items[target], items[index]];
  try {
    const endpoint = isHero ? "/api/content/admin" : "/api/content/works-admin";
    const result = await api(endpoint, { method: "POST", body: JSON.stringify({ action: "reorder", ids: items.map((item) => item.id) }) });
    if (isHero) state.slides = result.slides; else state.works = result.works;
    state.notice = "顺序已更新";
  } catch (error) { state.error = error.message; }
  render();
}

async function uploadFile(kind, file) {
  if (!file) return;
  syncActiveDraft();
  const validationKind = kind === "video" ? "video" : "poster";
  const validationError = validateMediaFile(validationKind, file);
  if (validationError) { state.error = validationError; state.notice = ""; render(); return; }
  state.uploadProgress[kind] = 0;
  render();
  try {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
    const prefix = kind === "workCover" ? "works" : "homepage";
    const blob = await upload(`${prefix}/${crypto.randomUUID()}-${safeName}`, file, {
      access: "public", handleUploadUrl: "/api/content/upload",
      onUploadProgress: ({ percentage }) => {
        state.uploadProgress[kind] = Math.round(percentage);
        const inputId = kind === "workCover" ? "work-cover-file" : `${kind}-file`;
        const label = document.querySelector(`#${inputId}`)?.closest("label")?.querySelector(".upload-status");
        if (label) label.textContent = `正在上传 ${state.uploadProgress[kind]}%`;
      },
    });
    if (kind === "video") state.heroDraft.videoUrl = blob.url;
    if (kind === "poster") state.heroDraft.posterUrl = blob.url;
    if (kind === "workCover") state.workDraft.cover = blob.url;
    state.notice = "上传完成，请保存";
  } catch (error) { state.error = error.message || "上传失败"; }
  finally { delete state.uploadProgress[kind]; render(); }
}

function bindPreviewEvents() {
  document.querySelectorAll(".preview-tabs [data-action]").forEach((button) => button.addEventListener("click", () => {
    state.previewMode = button.dataset.action === "preview-mobile" ? "mobile" : "desktop";
    refreshPreview();
  }));
}

function bindEvents() {
  document.querySelectorAll("[data-module]").forEach((button) => button.addEventListener("click", () => {
    syncActiveDraft();
    state.module = button.dataset.module;
    clearMessages();
    render();
  }));

  const activeForm = document.querySelector(state.module === "hero" ? "#hero-form" : state.module === "works" ? "#work-form" : "#missing-form");
  activeForm?.addEventListener("input", refreshPreview);
  activeForm?.addEventListener("change", refreshPreview);

  document.querySelector("#video-file")?.addEventListener("change", (event) => uploadFile("video", event.target.files?.[0]));
  document.querySelector("#poster-file")?.addEventListener("change", (event) => uploadFile("poster", event.target.files?.[0]));
  document.querySelector("#work-cover-file")?.addEventListener("change", (event) => uploadFile("workCover", event.target.files?.[0]));

  document.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", async () => {
    const action = button.dataset.action;
    if (action.startsWith("preview-")) return;
    if (action === "select-hero") return selectHero(button.dataset.id);
    if (action === "select-work") return selectWork(button.dataset.id);
    if (action === "select-submission") return selectSubmission(button.dataset.id);
    if (action === "review-approve") return runReviewAction("approve", button.dataset.id);
    if (action === "review-reject") return runReviewAction("reject", button.dataset.id);
    if (action === "review-handle") return runReviewAction("handle", button.dataset.id);
    if (action === "add") {
      clearMessages();
      if (state.module === "hero") { state.selectedSlideId = null; state.heroDraft = emptySlide(); }
      else { state.selectedWorkId = null; state.workDraft = emptyWork(); }
      return render();
    }
    if (action === "move-up") return reorder(button.dataset.id, -1);
    if (action === "move-down") return reorder(button.dataset.id, 1);
    if (action === "save") return saveActive();
    if (action === "publish") return publishActive();
    const item = state.module === "hero" ? state.heroDraft : state.workDraft;
    if (action === "unpublish") return runStatusAction("unpublish", item.id);
    if (action === "archive" && confirm("归档后前台不会显示，但记录仍可恢复。确认归档吗？")) return runStatusAction("archive", item.id);
    if (action === "logout") {
      await api("/api/admin/logout", { method: "POST", body: "{}" }).catch(() => {});
      state.authenticated = false; state.slides = []; state.works = []; state.submissions = []; render();
    }
  }));
  bindPreviewEvents();
}

render();
loadContent();
