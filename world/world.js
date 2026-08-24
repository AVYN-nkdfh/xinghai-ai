(function () {
  "use strict";

  const data = window.TODO_WORLD_DATA;
  if (!data) return;

  const directoryView = document.getElementById("directoryView");
  const detailView = document.getElementById("detailView");
  const catalog = document.getElementById("catalog");
  const catalogPanel = document.getElementById("catalogPanel");
  const industryStreet = document.querySelector(".industry-street");
  const catalogGrid = document.getElementById("catalogGrid");
  const emptyState = document.getElementById("emptyState");
  const loadMoreButton = document.getElementById("loadMore");
  const industryFilters = document.getElementById("industryFilters");
  const resultCount = document.getElementById("resultCount");
  const modeSummary = document.getElementById("modeSummary");
  const searchInput = document.getElementById("catalogSearch");
  const clearSearchButton = document.getElementById("clearSearch");
  const resetFiltersButton = document.getElementById("resetFilters");
  const sortSelect = document.getElementById("sortSelect");
  const careerTab = document.getElementById("careerTab");
  const businessTab = document.getElementById("businessTab");
  const menuToggle = document.getElementById("menuToggle");
  const navLinks = document.getElementById("siteNavLinks");
  const pageSize = 12;

  let mode = "employee";
  let type = "career";
  let industry = "all";
  let query = "";
  let sort = "default";
  let visibleCount = pageSize;
  let lastFocusedElement = null;

  const industryImageMap = Object.fromEntries(
    data.industries.map((item) => [item.id, `/world/assets/industries/${item.id}.webp`])
  );
  industryImageMap["internet-software"] = "/world/assets/industries/internet-software.webp";

  const modeLabels = {
    employee: "加入团队的职业",
    owner: "自己经营的生意",
    independent: "可以独立开展的职业",
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatSalary(range) {
    return `¥${range[0]}K – ¥${range[1]}K+`;
  }

  function formatStartup(range) {
    return `¥${range[0]}万 – ¥${range[1]}万`;
  }

  function moneyValue(item) {
    return item.type === "career" ? item.salary[1] : item.startup[1];
  }

  function independentCareer(item) {
    return item.modes.some((itemMode) => ["自由职业", "自营", "独立开发"].includes(itemMode));
  }

  function activeCollection() {
    const collection = type === "career" ? data.careers : data.businesses;
    return collection
      .filter((item) => mode !== "independent" || type !== "career" || independentCareer(item))
      .filter((item) => industry === "all" || item.industryId === industry)
      .filter((item) => {
        const haystack = [item.title, item.summary, item.industry, item.fit, ...(item.skills || [])].join(" ").toLowerCase();
        return haystack.includes(query.trim().toLowerCase());
      })
      .sort((a, b) => {
        if (sort === "money-desc") return moneyValue(b) - moneyValue(a);
        if (sort === "money-asc") return moneyValue(a) - moneyValue(b);
        return 0;
      });
  }

  function renderModeCards() {
    document.querySelectorAll("[data-mode]").forEach((button) => {
      const active = button.dataset.mode === mode;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    modeSummary.textContent = `现在查看：${modeLabels[mode]}`;
  }

  function renderTabs() {
    [careerTab, businessTab].forEach((tab) => {
      const active = tab.dataset.type === type;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    catalogPanel.setAttribute("aria-labelledby", type === "career" ? "careerTab" : "businessTab");
  }

  function renderIndustryFilters() {
    industryFilters.innerHTML = [
      { id: "all", name: "全部行业" },
      ...data.industries,
    ].map((item) => `
      <button type="button" class="${item.id === industry ? "is-active" : ""}" data-filter-industry="${escapeHtml(item.id)}">
        ${escapeHtml(item.name)}
      </button>
    `).join("");
  }

  function itemMeta(item) {
    if (item.type === "career") {
      return [formatSalary(item.salary), ...item.modes.slice(0, 2)];
    }
    return [formatStartup(item.startup), item.revenue];
  }

  function renderCatalog() {
    const items = activeCollection();
    const visibleItems = items.slice(0, visibleCount);

    catalogGrid.innerHTML = visibleItems.map((item) => `
      <button class="catalog-item" type="button" data-item-type="${item.type}" data-item-id="${escapeHtml(item.id)}">
        <span class="item-title">
          <span>${escapeHtml(item.industry)}</span>
          <strong>${escapeHtml(item.title)}</strong>
        </span>
        <span class="item-body">
          <p>${escapeHtml(item.summary)}</p>
          <span class="item-meta">${itemMeta(item).map((meta) => `<span>${escapeHtml(meta)}</span>`).join("")}</span>
        </span>
      </button>
    `).join("");

    resultCount.textContent = `找到 ${items.length} 个结果`;
    emptyState.hidden = items.length !== 0;
    loadMoreButton.hidden = items.length <= visibleCount;
    clearSearchButton.hidden = query.length === 0;
  }

  function renderAll() {
    renderModeCards();
    renderTabs();
    renderIndustryFilters();
    renderCatalog();
  }

  function setType(nextType, shouldScroll) {
    type = nextType;
    mode = type === "business" ? "owner" : "employee";
    industry = "all";
    visibleCount = pageSize;
    renderAll();
    if (shouldScroll) catalog.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function setMode(nextMode, shouldScroll) {
    mode = nextMode;
    type = nextMode === "owner" ? "business" : "career";
    industry = "all";
    visibleCount = pageSize;
    renderAll();
    if (shouldScroll) industryStreet.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function setIndustry(nextIndustry, shouldScroll) {
    industry = nextIndustry;
    visibleCount = pageSize;
    renderIndustryFilters();
    renderCatalog();
    if (shouldScroll) catalog.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function findItem(itemType, id) {
    return (itemType === "career" ? data.careers : data.businesses).find((item) => item.id === id);
  }

  function tasksFor(item) {
    if (item.id === "frontend-developer") {
      return [
        "把设计稿实现为网页或应用界面",
        "编写 HTML、CSS、JavaScript 等代码",
        "与产品、设计、后端一起解决问题",
        "不断优化性能与体验，让产品更好用",
      ];
    }
    if (item.type === "business") {
      return [
        `了解${item.customer}真正需要什么`,
        `设计产品或服务，并把“${item.revenue}”讲清楚`,
        `安排${item.costs}，保证按约定交付`,
        `记录收入、成本和反馈，解决“${item.difficulty}”`,
      ];
    }
    return [
      `理解今天要解决的${item.industry}问题`,
      `使用${item.skills.slice(0, 2).join("、")}完成核心工作`,
      "与同伴或服务对象确认结果",
      "检查质量、记录反馈并继续改进",
    ];
  }

  function entrySteps(item) {
    if (item.id === "frontend-developer") {
      return [
        "掌握基础：HTML、CSS、JavaScript",
        "做项目：完成 2–3 个作品，放到作品集",
        "实习或初级岗位：在真实团队中成长",
        "持续提升：学习框架与工程化，解决更复杂的问题",
      ];
    }
    if (item.type === "business") {
      return [
        `先访谈几位${item.customer}，验证是不是有真需求`,
        `用最低成本做一个可以体验的版本`,
        `完成第一笔真实交易，记录${item.costs}`,
        `反复改进交付，认真处理${item.difficulty}`,
      ];
    }
    return [
      `先理解这个职业：${item.entry}`,
      `练好${item.skills.join("、")}，做一件能展示的作品`,
      "找一次真实体验、访谈或实习，看看自己是否喜欢",
      "带着反馈继续学习，逐步承担更完整的任务",
    ];
  }

  function detailFacts(item) {
    return item.type === "career" ? [
      ["参考月收入（税前）", formatSalary(item.salary)],
      ["常见入行方式", item.entry],
      ["常见工作方式", item.modes.join(" / ")],
      ["可能适合你，如果", item.fit],
    ] : [
      ["常见起步投入", formatStartup(item.startup)],
      ["主要顾客", item.customer],
      ["常见赚钱方式", item.revenue],
      ["可能适合你，如果", item.fit],
    ];
  }

  function detailImage(item) {
    if (item.id === "frontend-developer") return "/world/assets/atlas-v1/career-software-workplace.webp";
    return industryImageMap[item.industryId] || "/world/assets/atlas-v1/hero-neighborhood.webp";
  }

  function tryImage(item) {
    return item.id === "frontend-developer"
      ? "/world/assets/atlas-v1/try-webpage-card.webp"
      : detailImage(item);
  }

  function relatedItems(item) {
    const collection = item.type === "career" ? data.careers : data.businesses;
    return collection.filter((candidate) => candidate.industryId === item.industryId && candidate.id !== item.id).slice(0, 5);
  }

  function detailMarkup(item) {
    const career = item.type === "career";
    const facts = detailFacts(item);
    const related = relatedItems(item);
    const tryTitle = item.id === "frontend-developer"
      ? "用 60 分钟做一个有按钮和卡片的网页"
      : item.tryIt;
    const tryDescription = career
      ? "先做一个小作品，感受这个职业真正需要的观察、工具与耐心。"
      : "用一个低成本的小实验，先验证顾客和交付，不急着投入很多钱。";

    return `
      <div class="detail-topbar">
        <button id="backToCatalog" type="button">返回上一页</button>
        <button id="shareDetail" type="button">分享</button>
      </div>
      <div class="detail-shell">
        <header class="detail-header">
          <p class="detail-industry">${escapeHtml(item.industry)} · ${career ? "职业" : "生意"}</p>
          <h1>${escapeHtml(item.title)}</h1>
          <p class="detail-summary">${escapeHtml(item.summary)}</p>
        </header>

        <img class="detail-image" src="${detailImage(item)}" alt="${escapeHtml(item.industry)}的真实工作场景">

        <div class="detail-grid">
          <div class="detail-main">
            <section class="detail-section">
              <h2>${career ? "他们今天在做什么" : "这门生意每天在做什么"}</h2>
              <ul>${tasksFor(item).map((task) => `<li>${escapeHtml(task)}</li>`).join("")}</ul>
            </section>
            <section class="detail-section">
              <h2>${career ? "收入参考" : "投入与收入"}</h2>
              <p class="income-value">${career ? formatSalary(item.salary) : formatStartup(item.startup)}</p>
              <p class="detail-note">${career ? "受城市、经验与能力影响，差异较大。" : `常见赚钱方式：${escapeHtml(item.revenue)}。实际投入受城市与规模影响很大。`}</p>
            </section>
            <section class="detail-section">
              <h2>${career ? "如何进入这个职业" : "如何开始这门生意"}</h2>
              <ol>${entrySteps(item).map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>
            </section>
            <section class="try-card">
              <div>
                <p class="section-kicker">先试一次 · 约 60 分钟</p>
                <h2>${escapeHtml(tryTitle)}</h2>
                <p>${escapeHtml(tryDescription)}</p>
                <span class="try-action">开始实践</span>
              </div>
              <img src="${tryImage(item)}" alt="一个可以动手完成的小作品示意">
            </section>
          </div>

          <aside class="facts-panel" aria-label="快速了解">
            ${facts.map(([label, value]) => `
              <div class="fact-row">
                <span>${escapeHtml(label)}</span>
                <strong>${escapeHtml(value)}</strong>
              </div>
            `).join("")}
            <div class="related-block">
              <h2>${career ? "相近岗位" : "相近生意"}</h2>
              <div class="related-list">
                ${related.map((candidate) => `<button type="button" data-related-type="${candidate.type}" data-related-id="${escapeHtml(candidate.id)}">${escapeHtml(candidate.title)}</button>`).join("")}
              </div>
            </div>
          </aside>
        </div>
      </div>
    `;
  }

  function openDetail(itemType, id, options = {}) {
    const item = findItem(itemType, id);
    if (!item) return;

    if (!options.fromHistory) {
      lastFocusedElement = document.activeElement;
      const url = new URL(window.location.href);
      url.searchParams.set("type", itemType);
      url.searchParams.set("id", id);
      history.pushState({ itemType, id }, "", url);
    }

    detailView.innerHTML = detailMarkup(item);
    detailView.hidden = false;
    directoryView.setAttribute("aria-hidden", "true");
    document.body.classList.add("detail-open");
    detailView.scrollTop = 0;
    document.title = `${item.title}｜职业地图｜图度AI未来学校`;
    document.getElementById("backToCatalog").focus();
  }

  function closeDetail(options = {}) {
    if (detailView.hidden) return;
    if (!options.fromHistory) {
      const url = new URL(window.location.href);
      url.searchParams.delete("type");
      url.searchParams.delete("id");
      history.pushState({}, "", url);
    }
    detailView.hidden = true;
    detailView.innerHTML = "";
    directoryView.removeAttribute("aria-hidden");
    document.body.classList.remove("detail-open");
    document.title = "职业地图｜图度AI未来学校";
    if (lastFocusedElement instanceof HTMLElement) lastFocusedElement.focus();
  }

  function syncDetailFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const itemType = params.get("type");
    const id = params.get("id");
    if (itemType && id && findItem(itemType, id)) {
      openDetail(itemType, id, { fromHistory: true });
    } else {
      closeDetail({ fromHistory: true });
    }
  }

  async function shareCurrentDetail() {
    const shareButton = document.getElementById("shareDetail");
    const payload = { title: document.title, text: "看看职业地图里的这个方向", url: window.location.href };
    try {
      if (navigator.share) {
        await navigator.share(payload);
      } else {
        await navigator.clipboard.writeText(window.location.href);
        shareButton.textContent = "链接已复制";
      }
    } catch (error) {
      if (error && error.name !== "AbortError") shareButton.textContent = "请复制地址栏链接";
    }
  }

  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => setMode(button.dataset.mode, true));
  });

  document.querySelectorAll("[data-industry]").forEach((button) => {
    button.addEventListener("click", () => setIndustry(button.dataset.industry, true));
  });

  document.getElementById("showAllIndustries").addEventListener("click", () => setIndustry("all", true));
  document.getElementById("restartExploration").addEventListener("click", () => {
    document.querySelector(".world-hero").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  [careerTab, businessTab].forEach((tab) => {
    tab.addEventListener("click", () => setType(tab.dataset.type, false));
    tab.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      const next = tab === careerTab ? businessTab : careerTab;
      setType(next.dataset.type, false);
      next.focus();
    });
  });

  industryFilters.addEventListener("click", (event) => {
    const button = event.target.closest("[data-filter-industry]");
    if (button) setIndustry(button.dataset.filterIndustry, false);
  });

  searchInput.addEventListener("input", () => {
    query = searchInput.value;
    visibleCount = pageSize;
    renderCatalog();
  });

  clearSearchButton.addEventListener("click", () => {
    query = "";
    searchInput.value = "";
    visibleCount = pageSize;
    renderCatalog();
    searchInput.focus();
  });

  sortSelect.addEventListener("change", () => {
    sort = sortSelect.value;
    visibleCount = pageSize;
    renderCatalog();
  });

  resetFiltersButton.addEventListener("click", () => {
    industry = "all";
    query = "";
    sort = "default";
    visibleCount = pageSize;
    searchInput.value = "";
    sortSelect.value = "default";
    renderAll();
  });

  loadMoreButton.addEventListener("click", () => {
    visibleCount += pageSize;
    renderCatalog();
    const items = catalogGrid.querySelectorAll(".catalog-item");
    items[Math.max(0, visibleCount - pageSize)]?.focus();
  });

  catalogGrid.addEventListener("click", (event) => {
    const item = event.target.closest("[data-item-id]");
    if (item) openDetail(item.dataset.itemType, item.dataset.itemId);
  });

  detailView.addEventListener("click", (event) => {
    if (event.target.closest("#backToCatalog")) {
      history.back();
      return;
    }
    if (event.target.closest("#shareDetail")) {
      shareCurrentDetail();
      return;
    }
    const related = event.target.closest("[data-related-id]");
    if (related) openDetail(related.dataset.relatedType, related.dataset.relatedId);
  });

  menuToggle.addEventListener("click", () => {
    const open = !navLinks.classList.contains("is-open");
    navLinks.classList.toggle("is-open", open);
    menuToggle.setAttribute("aria-expanded", String(open));
  });

  navLinks.addEventListener("click", () => {
    navLinks.classList.remove("is-open");
    menuToggle.setAttribute("aria-expanded", "false");
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !detailView.hidden) history.back();
  });

  window.addEventListener("popstate", syncDetailFromUrl);

  document.getElementById("careerTotal").textContent = data.careers.length;
  document.getElementById("businessTotal").textContent = data.businesses.length;
  document.getElementById("sourceLinks").innerHTML = data.sources.map((source) => (
    `<a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.label)}</a>`
  )).join(" · ");

  renderAll();
  syncDetailFromUrl();
})();
