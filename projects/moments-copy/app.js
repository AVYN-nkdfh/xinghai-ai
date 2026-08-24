(() => {
  const STORAGE_KEY = "moments-copy-preview:favorites";
  const BATCH_SIZE = 4;

  const state = {
    category: "all",
    query: "",
    tab: "home",
    offset: 0,
    favoriteIds: loadFavorites(),
  };

  const els = {
    content: document.querySelector("#mini-content"),
    statusTime: document.querySelector("#status-time"),
    search: document.querySelector("#copy-search"),
    searchClear: document.querySelector("#search-clear"),
    categories: document.querySelector("#category-chips"),
    categoryAnchor: document.querySelector("#category-anchor"),
    list: document.querySelector("#copy-list"),
    listKicker: document.querySelector("#list-kicker"),
    listTitle: document.querySelector("#list-title"),
    shuffle: document.querySelector("#shuffle-button"),
    empty: document.querySelector("#empty-state"),
    emptyTitle: document.querySelector("#empty-title"),
    emptyCopy: document.querySelector("#empty-copy"),
    emptyReset: document.querySelector("#empty-reset"),
    tabs: [...document.querySelectorAll(".bottom-tab")],
    toast: document.querySelector("#toast"),
  };

  let toastTimer;

  function loadFavorites() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return new Set(saved.filter((id) => Number.isInteger(id)));
    } catch {
      return new Set();
    }
  }

  function saveFavorites() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...state.favoriteIds]));
    } catch {
      showToast("收藏已保留在本次浏览中");
    }
  }

  function updateClock() {
    const now = new Date();
    els.statusTime.textContent = new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(now);
  }

  function renderCategories() {
    els.categories.innerHTML = COPY_CATEGORIES.map((category) => {
      const active = state.category === category.id;
      return `
        <button
          type="button"
          class="category-chip${active ? " is-active" : ""}"
          data-category="${category.id}"
          aria-pressed="${active}"
          role="listitem"
        >${category.name}</button>
      `;
    }).join("");
  }

  function filteredItems() {
    const query = state.query.trim().toLocaleLowerCase("zh-CN");
    return COPY_ITEMS.filter((item) => {
      const inCategory = state.category === "all" || item.category === state.category;
      const inFavorites = state.tab !== "favorites" || state.favoriteIds.has(item.id);
      const haystack = [item.text, item.scene, item.tone, ...item.tags].join(" ").toLocaleLowerCase("zh-CN");
      const matchesQuery = !query || haystack.includes(query);
      return inCategory && inFavorites && matchesQuery;
    });
  }

  function batchItems(items) {
    if (items.length <= BATCH_SIZE) return items;
    const start = state.offset % items.length;
    return Array.from({ length: BATCH_SIZE }, (_, index) => items[(start + index) % items.length]);
  }

  function categoryName(id) {
    return COPY_CATEGORIES.find((category) => category.id === id)?.name || "全部";
  }

  function renderList() {
    const allMatches = filteredItems();
    const visible = batchItems(allMatches);
    const isFavorites = state.tab === "favorites";

    els.listKicker.textContent = isFavorites ? "只存在这台设备" : state.query ? "搜索结果" : "为你推荐";
    els.listTitle.textContent = isFavorites
      ? "我的收藏"
      : state.query
        ? `找到 ${allMatches.length} 条相关文案`
        : state.category === "all"
          ? "今天可以发这些"
          : `${categoryName(state.category)}文案`;

    els.shuffle.hidden = allMatches.length <= BATCH_SIZE || isFavorites;
    els.list.hidden = allMatches.length === 0;
    els.empty.hidden = allMatches.length !== 0;

    if (allMatches.length === 0) {
      if (isFavorites) {
        els.emptyTitle.textContent = "还没有收藏";
        els.emptyCopy.textContent = "看到喜欢的句子时，点一下收藏就会出现在这里。";
      } else {
        els.emptyTitle.textContent = "暂时没有找到";
        els.emptyCopy.textContent = "换个关键词，或者看看全部文案吧。";
      }
      els.list.innerHTML = "";
      return;
    }

    els.list.innerHTML = visible.map((item) => {
      const favorite = state.favoriteIds.has(item.id);
      return `
        <article class="copy-card" data-id="${item.id}">
          <div class="copy-card__meta">
            <span class="copy-card__category">${categoryName(item.category)} · ${item.scene}</span>
            <span class="copy-card__tone">${item.tone}</span>
          </div>
          <blockquote>${escapeHtml(item.text)}</blockquote>
          <div class="copy-card__actions">
            <button type="button" class="favorite-button${favorite ? " is-favorite" : ""}" data-action="favorite" aria-pressed="${favorite}">
              ${favorite ? "♥ 已收藏" : "♡ 收藏"}
            </button>
            <button type="button" class="copy-button" data-action="copy">复制文案</button>
          </div>
        </article>
      `;
    }).join("");
  }

  function renderTabs() {
    els.tabs.forEach((tab) => {
      const active = tab.dataset.tab === state.tab;
      tab.classList.toggle("is-active", active);
      if (active) tab.setAttribute("aria-current", "page");
      else tab.removeAttribute("aria-current");
      if (tab.dataset.tab === "favorites") {
        tab.querySelector("span").textContent = active ? "♥" : "♡";
      }
    });
  }

  function render() {
    renderCategories();
    renderTabs();
    renderList();
    els.searchClear.hidden = !state.query;
  }

  function escapeHtml(value) {
    const holder = document.createElement("div");
    holder.textContent = value;
    return holder.innerHTML;
  }

  function showToast(message, type = "success") {
    window.clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.classList.toggle("is-error", type === "error");
    els.toast.hidden = false;
    toastTimer = window.setTimeout(() => {
      els.toast.hidden = true;
    }, 1900);
  }

  async function copyText(text, button) {
    let copied = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        copied = true;
      }
    } catch {
      copied = false;
    }

    if (!copied) {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      try {
        copied = document.execCommand("copy");
      } catch {
        copied = false;
      }
      textarea.remove();
    }

    if (!copied) {
      showToast("复制失败，请长按文案手动复制", "error");
      return;
    }

    const oldLabel = button.textContent;
    button.textContent = "✓ 已复制";
    button.classList.add("is-copied");
    showToast("文案已复制");
    window.setTimeout(() => {
      button.textContent = oldLabel;
      button.classList.remove("is-copied");
    }, 1500);
  }

  function resetToAll() {
    state.category = "all";
    state.query = "";
    state.tab = "home";
    state.offset = 0;
    els.search.value = "";
    render();
    els.content.scrollTo({ top: 0, behavior: "smooth" });
  }

  els.categories.addEventListener("click", (event) => {
    const button = event.target.closest("[data-category]");
    if (!button) return;
    state.category = button.dataset.category;
    state.tab = "categories";
    state.offset = 0;
    render();
  });

  els.search.addEventListener("input", (event) => {
    state.query = event.target.value;
    state.offset = 0;
    render();
  });

  els.searchClear.addEventListener("click", () => {
    state.query = "";
    els.search.value = "";
    els.search.focus();
    render();
  });

  els.shuffle.addEventListener("click", () => {
    const count = filteredItems().length;
    if (count <= BATCH_SIZE) return;
    state.offset = (state.offset + BATCH_SIZE) % count;
    renderList();
    showToast("已经换了一批");
  });

  els.list.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    const card = event.target.closest(".copy-card");
    if (!button || !card) return;
    const id = Number(card.dataset.id);
    const item = COPY_ITEMS.find((entry) => entry.id === id);
    if (!item) return;

    if (button.dataset.action === "copy") {
      copyText(item.text, button);
      return;
    }

    if (state.favoriteIds.has(id)) {
      state.favoriteIds.delete(id);
      showToast("已取消收藏");
    } else {
      state.favoriteIds.add(id);
      showToast("已加入收藏");
    }
    saveFavorites();
    renderList();
  });

  els.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const nextTab = tab.dataset.tab;
      state.tab = nextTab;
      state.offset = 0;

      if (nextTab === "home") {
        state.category = "all";
        state.query = "";
        els.search.value = "";
        render();
        els.content.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      render();
      if (nextTab === "categories") {
        els.categoryAnchor.scrollIntoView({ behavior: "smooth", block: "start" });
      } else {
        document.querySelector(".copy-section").scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });

  els.emptyReset.addEventListener("click", resetToAll);

  updateClock();
  window.setInterval(updateClock, 30000);
  render();
})();
