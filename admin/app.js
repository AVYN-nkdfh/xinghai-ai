const ICONS = {
  dashboard: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  content: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
  device: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
  audit: '<path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4"/><path d="M9 17h6M9 13h4M15 3h6v6M14 10l7-7"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1v.1H9.6V21a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.2 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1-.4h-.1V9.6h.1A1.7 1.7 0 0 0 4.15 8a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 8.5 3.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1v-.1h4V2a1.7 1.7 0 0 0 1.55 1.6 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.8 8a1.7 1.7 0 0 0 .6 1 1.7 1.7 0 0 0 1 .4h.1v4h-.1A1.7 1.7 0 0 0 19.4 15z"/>',
  logout: '<path d="M10 17l5-5-5-5M15 12H3"/><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  refresh: '<path d="M20 11a8 8 0 1 0 2 5M20 4v7h-7"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M15 6l3 3M14 7l3 3"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
};

const NAV_ITEMS = [
  { id: "overview", label: "工作台", icon: "dashboard", group: "总览", description: "身份、权限与模块接入状态" },
  { id: "students", label: "学员与教学", icon: "users", group: "业务运营", description: "学员、课堂与成长项目" },
  { id: "content", label: "内容与作品", icon: "content", group: "业务运营", description: "官网内容、作品审核与发布" },
  { id: "booking", label: "预约与场地", icon: "calendar", group: "业务运营", description: "预约、机位和维护" },
  { id: "devices", label: "设备与 Agent", icon: "device", group: "业务运营", description: "课堂 Mac、中央节点与队列" },
  { id: "users", label: "用户与权限", icon: "shield", group: "系统管理", description: "员工账号与个人权限" },
  { id: "roles", label: "角色管理", icon: "settings", group: "系统管理", description: "角色模板与动作权限" },
  { id: "audit", label: "操作日志", icon: "audit", group: "系统管理", description: "高风险操作审计" },
];

const MODULE_LABELS = Object.fromEntries(NAV_ITEMS.map((item) => [item.id, item.label]));
const SCOPE_LABELS = {
  organization: "全部组织",
  campus: "指定校区",
  team: "指定团队",
  own: "仅本人负责",
};
const CORE_MODULES = new Set(["overview", "users", "roles", "audit"]);

const state = {
  booting: true,
  bootstrap: null,
  authError: "",
  loginEmail: "",
  sidebarOpen: false,
  pageLoading: "",
  pageError: "",
  usersData: null,
  rolesData: null,
  auditData: null,
  selectedUserId: null,
  userDraft: null,
  userQuery: "",
  newUser: null,
  selectedRoleId: null,
  roleDraft: null,
  passwordUserId: null,
  mutationError: "",
  saving: false,
  toast: null,
};

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

const icon = (name) => `<svg class="icon" aria-hidden="true" viewBox="0 0 24 24">${ICONS[name] || ICONS.dashboard}</svg>`;
const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
})[character]);
const initials = (name) => [...String(name || "员")].slice(0, 1).join("").toUpperCase();

async function api(path, { method = "GET", body } = {}) {
  const response = await fetch(`/api/admin-v2/${path}`, {
    method,
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let payload = {};
  try { payload = await response.json(); } catch {}
  if (!response.ok) throw new ApiError(payload.error || "请求失败，请稍后再试", response.status);
  return payload;
}

function route() {
  return (location.hash || "#overview").replace(/^#/, "").split("?")[0] || "overview";
}

function go(target) {
  if (route() === "users/new" && target !== "users/new") state.newUser = null;
  state.sidebarOpen = false;
  if (route() === target) return routeChanged();
  location.hash = target;
}

function currentRoot() {
  return route().split("/")[0];
}

function can(permission) {
  return Boolean(state.bootstrap?.permissions?.includes(permission));
}

function canOpen(moduleId) {
  return Boolean(state.bootstrap?.modules?.includes(moduleId));
}

function formatTime(value) {
  if (!value) return "尚未登录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function status(text, kind = "") {
  return `<span class="status ${kind}">${escapeHtml(text)}</span>`;
}

function pageHeader(title, description, actions = "", eyebrow = "图度运营后台") {
  return `<header class="page-header"><div><p class="eyebrow">${escapeHtml(eyebrow)}</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></div>${actions ? `<div class="header-actions">${actions}</div>` : ""}</header>`;
}

function showToast(title, message) {
  state.toast = { title, message };
  render();
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    state.toast = null;
    render();
  }, 4200);
}

function handleSessionError(error) {
  if (error?.status !== 401) return false;
  state.bootstrap = null;
  state.usersData = null;
  state.rolesData = null;
  state.auditData = null;
  state.authError = "登录已过期，请重新登录";
  if (route() !== "login") location.hash = "login";
  render();
  return true;
}

async function loadBootstrap() {
  const data = await api("bootstrap");
  state.bootstrap = data;
  state.authError = "";
  return data;
}

async function boot() {
  try {
    await loadBootstrap();
  } catch (error) {
    if (error.status !== 401) state.authError = error.message;
  } finally {
    state.booting = false;
  }
  if (!state.bootstrap && route() !== "login") location.hash = "login";
  else if (state.bootstrap && route() === "login") location.hash = "overview";
  render();
  await ensureRouteData();
}

async function loadPage(key, force = false) {
  const cacheKey = `${key}Data`;
  if (!force && state[cacheKey]) return;
  state.pageLoading = key;
  state.pageError = "";
  render();
  try {
    state[cacheKey] = await api(key);
    if (key === "users" && !state.selectedUserId) state.selectedUserId = state.usersData.users[0]?.id || null;
    if (key === "roles" && !state.selectedRoleId) state.selectedRoleId = state.rolesData.roles[0]?.id || null;
  } catch (error) {
    if (!handleSessionError(error)) state.pageError = error.message;
  } finally {
    state.pageLoading = "";
    render();
  }
}

async function ensureRouteData(force = false) {
  if (!state.bootstrap) return;
  const root = currentRoot();
  if (["users", "roles", "audit"].includes(root) && canOpen(root)) await loadPage(root, force);
}

function renderLogin() {
  return `<main class="login-shell">
    <section class="login-aside">
      <div class="brand"><span class="brand-mark">${icon("shield")}</span><div class="brand-copy"><strong>图度运营后台</strong><span>TODO OPERATIONS</span></div></div>
      <div class="login-message"><p class="eyebrow">统一身份 · 分级权限</p><h1>一个入口，<br>按岗位做该做的事。</h1><p>预约、内容、作品、设备和权限逐步进入同一后台；每位员工只看到自己需要的板块和数据。</p></div>
      <div class="login-foot">正式后台 · 服务端权限校验 · 操作全程审计</div>
    </section>
    <section class="login-main">
      <form class="login-card" id="loginForm">
        <p class="eyebrow">欢迎回来</p><h2>登录运营后台</h2><p>使用管理员为你创建的员工账号登录。</p>
        <label class="field"><span>邮箱</span><input id="loginEmail" name="email" type="email" autocomplete="username" value="${escapeHtml(state.loginEmail)}" required /></label>
        <label class="field"><span>密码</span><input name="password" type="password" autocomplete="current-password" minlength="12" required /></label>
        ${state.authError ? `<div class="inline-error" role="alert">${escapeHtml(state.authError)}</div>` : ""}
        <button class="button primary full" type="submit" ${state.saving ? "disabled" : ""}>${state.saving ? "正在登录…" : `进入后台 ${icon("arrow")}`}</button>
        <small class="login-help">账号由平台超级管理员统一开通。连续失败 5 次将暂时限制登录。</small>
      </form>
    </section>
  </main>`;
}

function renderSidebar() {
  const groups = ["总览", "业务运营", "系统管理"].map((group) => {
    const items = NAV_ITEMS.filter((item) => item.group === group && canOpen(item.id));
    if (!items.length) return "";
    return `<div class="nav-group"><div class="nav-label">${group}</div>${items.map((item) => `<button class="nav-item ${currentRoot() === item.id ? "is-active" : ""}" type="button" data-route="${item.id}">${icon(item.icon)}<span>${item.label}</span>${CORE_MODULES.has(item.id) ? "" : '<small class="status-mini">迁移中</small>'}</button>`).join("")}</div>`;
  }).join("");
  const user = state.bootstrap.user;
  return `<aside class="sidebar"><div class="brand"><span class="brand-mark">${icon("shield")}</span><div class="brand-copy"><strong>图度运营后台</strong><span>TODO OPERATIONS</span></div></div><nav class="nav-scroll">${groups}</nav><div class="sidebar-profile"><div class="profile-card"><span class="avatar">${escapeHtml(initials(user.displayName))}</span><div><strong>${escapeHtml(user.displayName)}</strong><small>${escapeHtml(user.role.name)} · ${escapeHtml(SCOPE_LABELS[user.dataScope] || user.dataScope)}</small></div></div></div></aside>`;
}

function renderTopbar() {
  const item = NAV_ITEMS.find((entry) => entry.id === currentRoot()) || NAV_ITEMS[0];
  const user = state.bootstrap.user;
  return `<header class="topbar"><button class="mobile-menu" type="button" data-action="toggle-sidebar" aria-label="打开导航">${icon("menu")}</button><div class="breadcrumbs"><span>运营后台</span><span>/</span><strong>${escapeHtml(item.label)}</strong></div><div class="topbar-spacer"></div><div class="identity"><span class="avatar">${escapeHtml(initials(user.displayName))}</span><div class="identity-copy"><strong>${escapeHtml(user.displayName)}</strong><small>${escapeHtml(user.role.name)}</small></div></div><button class="icon-button" type="button" data-action="logout" aria-label="退出登录" title="退出登录">${icon("logout")}</button></header>`;
}

function renderOverview() {
  const user = state.bootstrap.user;
  const visibleModules = NAV_ITEMS.filter((item) => item.id !== "overview" && canOpen(item.id));
  const connected = visibleModules.filter((item) => CORE_MODULES.has(item.id)).length;
  const pending = visibleModules.length - connected;
  return `<div class="page">
    ${pageHeader(`${user.displayName}，欢迎回来`, `你当前以“${user.role.name}”身份访问 ${SCOPE_LABELS[user.dataScope] || user.dataScope} 的数据。`, `<button class="button" type="button" data-action="refresh-bootstrap">${icon("refresh")} 刷新权限</button>`)}
    <div class="notice">${icon("shield")}<div><strong>统一身份与服务端权限已经接通。</strong> 菜单来自当前账号的真实权限；直接访问无权限路由也会被拦截。</div></div>
    <section class="metrics">
      <article class="metric-card"><div class="metric-label"><span>当前角色</span>${status("已验证", "success")}</div><div class="metric-value">${escapeHtml(user.role.name)}</div><div class="metric-note">角色等级 ${escapeHtml(user.role.rank)}</div></article>
      <article class="metric-card"><div class="metric-label"><span>数据范围</span>${status("服务端执行", "blue")}</div><div class="metric-value">${escapeHtml(SCOPE_LABELS[user.dataScope] || user.dataScope)}</div><div class="metric-note">业务 API 接入后按此范围过滤</div></article>
      <article class="metric-card"><div class="metric-label"><span>已接入模块</span>${status("可使用", "success")}</div><div class="metric-value">${connected}</div><div class="metric-note">账号、角色、权限与审计</div></article>
      <article class="metric-card"><div class="metric-label"><span>待迁移模块</span>${status(pending ? "进行中" : "完成", pending ? "warning" : "success")}</div><div class="metric-value">${pending}</div><div class="metric-note">不使用示例业务数据冒充真实状态</div></article>
    </section>
    <section class="module-grid">${visibleModules.map((item) => {
      const ready = CORE_MODULES.has(item.id);
      return `<article class="module-card"><span class="module-icon ${ready ? "" : "pending"}">${icon(item.icon)}</span><h2>${escapeHtml(item.label)}</h2><p>${escapeHtml(item.description)}</p><footer><button class="button ghost small" type="button" data-route="${item.id}">${ready ? "进入模块" : "查看迁移状态"} ${icon("arrow")}</button>${status(ready ? "已接入" : "待迁移", ready ? "success" : "warning")}</footer></article>`;
    }).join("")}</section>
  </div>`;
}

function renderMigrationPage(moduleId) {
  const details = {
    students: ["学员与教学", "下一阶段接入学员主档、课堂记录、成长项目和作品版本，并在每次查询中执行数据范围。", "优先接入"],
    content: ["内容与作品", "现有内容服务继续独立运行；下一阶段把编辑、审核和发布操作迁入统一会话。", "待适配 API"],
    booking: ["预约与场地", "家长预约入口保持不变；管理操作将在统一权限适配完成后迁入这里。", "待适配 API"],
    devices: ["设备与 Agent", "课堂 Mac、中央 Mac、上传队列和异常归属将在设备 API 完成后显示真实状态。", "下一阶段接入"],
  }[moduleId];
  return `<div class="page">${pageHeader(details[0], details[1])}<div class="notice warning">${icon("settings")}<div><strong>${details[2]}。</strong> 当前正式后台不会显示原型里的示例人数、设备在线率或待办数量，避免把模拟数据当成现场状态。</div></div><section class="card empty">${icon("refresh")}<strong>统一身份已准备好，业务数据尚未迁移</strong><span>旧服务仍可独立运行；完成服务端权限适配后，此页面会直接读取真实数据。</span></section></div>`;
}

function effectivePermissions(user, roles) {
  const role = roles.find((item) => item.id === user.role.id || item.key === user.role.key);
  const values = new Set(role?.permissions || []);
  const now = Date.now();
  for (const override of user.permissionOverrides || []) {
    if (override.expiresAt && new Date(override.expiresAt).getTime() <= now) continue;
    override.allowed ? values.add(override.permissionKey) : values.delete(override.permissionKey);
  }
  return [...values].sort();
}

function makeUserDraft(user) {
  return {
    userId: user.id,
    roleKey: user.role.key,
    dataScope: user.dataScope,
    dataScopeRef: user.dataScopeRef || "",
    campusId: user.campusId || "",
    permissions: effectivePermissions(user, state.usersData.roles),
  };
}

function groupedPermissions(catalog) {
  return catalog.reduce((groups, permission) => {
    (groups[permission.module] ||= []).push(permission);
    return groups;
  }, {});
}

function renderPermissionGroups(catalog, selected, prefix, disabled = false) {
  const chosen = new Set(selected || []);
  return Object.entries(groupedPermissions(catalog)).map(([moduleId, permissions]) => `<section class="permission-group"><h3>${escapeHtml(MODULE_LABELS[moduleId] || moduleId)}</h3>${permissions.map((permission) => `<label class="permission-item"><input type="checkbox" data-${prefix}-permission="${escapeHtml(permission.key)}" ${chosen.has(permission.key) ? "checked" : ""} ${disabled ? "disabled" : ""}/><span><strong>${escapeHtml(permission.label)}</strong><small>${escapeHtml(permission.key)}</small></span>${permission.sensitive ? '<i class="sensitive">敏感操作</i>' : ""}</label>`).join("")}</section>`).join("");
}

function loadingCard(message = "正在读取真实数据…") {
  return `<section class="card empty"><div class="spinner"></div><strong>${escapeHtml(message)}</strong></section>`;
}

function errorCard(message, key) {
  return `<section class="card empty">${icon("refresh")}<strong>数据加载失败</strong><span>${escapeHtml(message)}</span><button class="button" type="button" data-retry="${key}">${icon("refresh")} 重试</button></section>`;
}

function renderUsers() {
  if (state.pageLoading === "users" && !state.usersData) return `<div class="page">${pageHeader("用户与权限", "读取真实员工账号和服务端权限。")}${loadingCard()}</div>`;
  if (state.pageError && !state.usersData) return `<div class="page">${pageHeader("用户与权限", "读取真实员工账号和服务端权限。")}${errorCard(state.pageError, "users")}</div>`;
  const data = state.usersData;
  if (!data) return `<div class="page">${loadingCard()}</div>`;
  const manageable = can("admin.users.manage");
  const query = state.userQuery.trim().toLowerCase();
  const visibleUsers = data.users.filter((user) => !query || `${user.displayName}${user.email}${user.role.name}${user.campusId || ""}`.toLowerCase().includes(query));
  let selected = data.users.find((user) => user.id === state.selectedUserId) || data.users[0];
  if (!selected) return `<div class="page">${pageHeader("用户与权限", "目前还没有员工账号。", manageable ? `<button class="button primary" data-route="users/new">${icon("plus")} 添加员工</button>` : "")}</div>`;
  if (!state.userDraft || state.userDraft.userId !== selected.id) state.userDraft = makeUserDraft(selected);
  const draft = state.userDraft;
  const roles = data.roles.filter((role) => role.rank <= state.bootstrap.user.role.rank);
  const conflict = draft.dataScope !== "organization" && draft.permissions.some((permission) => permission.startsWith("admin."));
  return `<div class="page">
    ${pageHeader("用户与权限", "配置员工账号、主角色、数据范围和动作权限。所有保存由服务端再次校验并写入审计。", `<button class="button" data-route="audit">${icon("audit")} 权限变更记录</button>${manageable ? `<button class="button primary" data-route="users/new">${icon("plus")} 添加员工</button>` : ""}`)}
    <div class="notice warning">${icon("shield")}<div><strong>最高权限保护已启用。</strong> 不能停用或降级最后一名超级管理员，也不能授予超过当前账号的权限。</div></div>
    <section class="users-layout">
      <article class="card"><div class="toolbar"><label class="search">${icon("search")}<input id="userSearch" value="${escapeHtml(state.userQuery)}" placeholder="搜索姓名、邮箱、角色或校区" /></label><button class="button small" data-retry="users">${icon("refresh")} 刷新</button></div><div class="table-wrap"><table><thead><tr><th>员工</th><th>角色</th><th>数据范围</th><th>最近登录</th><th>状态</th></tr></thead><tbody>${visibleUsers.map((user) => `<tr data-user-id="${user.id}" class="${user.id === selected.id ? "is-selected" : ""}"><td><div class="person"><span class="avatar">${escapeHtml(initials(user.displayName))}</span><div><strong>${escapeHtml(user.displayName)}</strong><small>${escapeHtml(user.email)}</small></div></div></td><td>${escapeHtml(user.role.name)}</td><td>${escapeHtml(SCOPE_LABELS[user.dataScope] || user.dataScope)}</td><td>${escapeHtml(formatTime(user.lastLoginAt))}</td><td>${status(user.status === "active" ? "正常" : "已停用", user.status === "active" ? "success" : "danger")}</td></tr>`).join("")}</tbody></table>${visibleUsers.length ? "" : '<div class="empty"><strong>没有匹配的员工</strong><span>换一个关键词再试。</span></div>'}</div></article>
      <article class="card editor"><div class="editor-head"><div class="editor-person"><span class="avatar">${escapeHtml(initials(selected.displayName))}</span><div><h2>${escapeHtml(selected.displayName)}</h2><p>${escapeHtml(selected.email)}</p></div></div>${status(selected.status === "active" ? "正常" : "已停用", selected.status === "active" ? "success" : "danger")}</div><div class="form-body">
        <div class="form-grid"><label class="field"><span>主角色</span><select id="userRole" ${manageable ? "" : "disabled"}>${roles.map((role) => `<option value="${role.key}" ${role.key === draft.roleKey ? "selected" : ""}>${escapeHtml(role.name)}</option>`).join("")}</select></label><label class="field"><span>数据范围</span><select id="userScope" ${manageable ? "" : "disabled"}>${Object.entries(SCOPE_LABELS).map(([value, label]) => `<option value="${value}" ${value === draft.dataScope ? "selected" : ""}>${label}</option>`).join("")}</select></label>${["campus", "team"].includes(draft.dataScope) ? `<label class="field"><span>校区标识</span><input id="userCampus" value="${escapeHtml(draft.campusId)}" placeholder="例如 dalian" ${manageable ? "" : "disabled"}/></label>` : ""}${draft.dataScope === "team" ? `<label class="field"><span>团队标识</span><input id="userScopeRef" value="${escapeHtml(draft.dataScopeRef)}" placeholder="例如 team-a" ${manageable ? "" : "disabled"}/></label>` : ""}</div>
        <div class="permission-heading"><strong>动作权限</strong><span>角色模板 + 个人覆盖</span></div><div class="permission-groups">${renderPermissionGroups(data.permissionCatalog, draft.permissions, "user", !manageable)}</div>
        ${conflict ? '<div class="inline-error">系统管理权限必须使用“全部组织”数据范围，请调整数据范围或移除系统管理权限。</div>' : ""}${state.mutationError ? `<div class="inline-error">${escapeHtml(state.mutationError)}</div>` : ""}
      </div><div class="editor-actions"><small>停用账号或重置密码会撤销该员工当前会话。</small><div class="action-row">${manageable ? `<button class="button small" data-action="reset-password" data-user="${selected.id}">${icon("key")} 重置密码</button><button class="button small ${selected.status === "active" ? "danger" : ""}" data-action="toggle-user-status" data-user="${selected.id}" data-status="${selected.status === "active" ? "disabled" : "active"}">${selected.status === "active" ? "停用账号" : "启用账号"}</button><button class="button primary small" data-action="save-user" ${conflict || state.saving ? "disabled" : ""}>${icon("check")} 保存权限</button>` : ""}</div></div></article>
    </section>
  </div>`;
}

function defaultNewUser() {
  const data = state.usersData;
  const role = data.roles.find((item) => item.key === "teacher") || data.roles.find((item) => item.rank <= state.bootstrap.user.role.rank);
  return {
    roleKey: role?.key || "",
    dataScope: role?.defaultDataScope || "own",
    campusId: "",
    dataScopeRef: "",
    displayName: "",
    email: "",
    password: "",
    permissions: [...(role?.permissions || [])],
  };
}

function renderNewUser() {
  if (!state.usersData) return `<div class="page">${loadingCard()}</div>`;
  if (!can("admin.users.manage")) return renderForbidden();
  if (!state.newUser) state.newUser = defaultNewUser();
  const draft = state.newUser;
  const roles = state.usersData.roles.filter((role) => role.rank <= state.bootstrap.user.role.rank);
  const conflict = draft.dataScope !== "organization" && draft.permissions.some((permission) => permission.startsWith("admin."));
  return `<div class="page">${pageHeader("添加员工", "创建员工账号，并在同一步确定角色、数据范围和动作权限。", `<button class="button" data-route="users">返回员工列表</button>`, "用户与权限")}
    <form class="card" id="createUserForm"><div class="form-body"><div class="form-grid"><label class="field"><span>员工姓名</span><input name="displayName" data-new-user-field="displayName" value="${escapeHtml(draft.displayName)}" maxlength="80" required /></label><label class="field"><span>登录邮箱</span><input name="email" data-new-user-field="email" value="${escapeHtml(draft.email)}" type="email" autocomplete="off" required /></label><label class="field"><span>初始密码</span><input name="password" data-new-user-field="password" value="${escapeHtml(draft.password)}" type="password" minlength="12" maxlength="200" autocomplete="new-password" required /><small class="field-help">至少 12 个字符，请通过安全方式交给员工。</small></label><label class="field"><span>主角色</span><select id="newUserRole">${roles.map((role) => `<option value="${role.key}" ${role.key === draft.roleKey ? "selected" : ""}>${escapeHtml(role.name)}</option>`).join("")}</select></label><label class="field"><span>数据范围</span><select id="newUserScope">${Object.entries(SCOPE_LABELS).map(([value, label]) => `<option value="${value}" ${value === draft.dataScope ? "selected" : ""}>${label}</option>`).join("")}</select></label>${["campus", "team"].includes(draft.dataScope) ? `<label class="field"><span>校区标识</span><input name="campusId" data-new-user-field="campusId" value="${escapeHtml(draft.campusId)}" placeholder="例如 dalian" required /></label>` : ""}${draft.dataScope === "team" ? `<label class="field"><span>团队标识</span><input name="dataScopeRef" data-new-user-field="dataScopeRef" value="${escapeHtml(draft.dataScopeRef)}" placeholder="例如 team-a" required /></label>` : ""}</div><div class="permission-heading"><strong>动作权限</strong><span>默认继承角色，可为此员工单独调整</span></div><div class="permission-groups">${renderPermissionGroups(state.usersData.permissionCatalog, draft.permissions, "new-user")}</div>${conflict ? '<div class="inline-error">系统管理权限必须使用“全部组织”数据范围。</div>' : ""}${state.mutationError ? `<div class="inline-error">${escapeHtml(state.mutationError)}</div>` : ""}</div><div class="editor-actions"><small>创建成功后，账号立即可以登录。</small><div class="action-row"><button class="button" type="button" data-route="users">取消</button><button class="button primary" type="submit" ${conflict || state.saving ? "disabled" : ""}>${state.saving ? "正在创建…" : `${icon("plus")} 创建员工`}</button></div></div></form>
  </div>`;
}

function makeRoleDraft(role) {
  return role ? { id: role.id, key: role.key, name: role.name, description: role.description, rank: role.rank, permissions: [...role.permissions], isSystem: role.isSystem } : { id: null, key: "custom_", name: "", description: "", rank: 20, permissions: ["overview.view"], isSystem: false };
}

function renderRoles() {
  if (state.pageLoading === "roles" && !state.rolesData) return `<div class="page">${pageHeader("角色管理", "读取真实角色与权限目录。")}${loadingCard()}</div>`;
  if (state.pageError && !state.rolesData) return `<div class="page">${pageHeader("角色管理", "读取真实角色与权限目录。")}${errorCard(state.pageError, "roles")}</div>`;
  const data = state.rolesData;
  if (!data) return `<div class="page">${loadingCard()}</div>`;
  const manageable = can("admin.roles.manage");
  let selected = state.selectedRoleId === "new" ? null : (data.roles.find((role) => role.id === state.selectedRoleId) || data.roles[0]);
  if (!state.roleDraft || (selected && state.roleDraft.id !== selected.id)) state.roleDraft = makeRoleDraft(selected);
  const draft = state.roleDraft || makeRoleDraft(null);
  return `<div class="page">${pageHeader("角色管理", "角色是动作权限模板；员工的数据范围和个人覆盖仍在用户页配置。", `${manageable ? `<button class="button primary" data-action="new-role">${icon("plus")} 新建自定义角色</button>` : ""}`)}<div class="notice">${icon("shield")}<div><strong>系统角色是固定安全模板。</strong> 如需特殊岗位，请新建自定义角色；不能直接修改系统角色。</div></div><section class="role-layout"><article class="card role-list">${data.roles.map((role) => `<button class="role-row ${draft.id === role.id ? "is-selected" : ""}" data-role-id="${role.id}"><span class="module-icon">${icon(role.isSystem ? "shield" : "settings")}</span><div><strong>${escapeHtml(role.name)}</strong><small>${escapeHtml(role.description || role.key)}</small></div>${status(role.isSystem ? "系统" : "自定义", role.isSystem ? "blue" : "success")}</button>`).join("")}</article><form class="card role-editor" id="roleForm"><div class="editor-head"><div><p class="eyebrow">${draft.id ? "角色详情" : "新建角色"}</p><h2>${escapeHtml(draft.name || "新的自定义角色")}</h2></div>${status(draft.isSystem ? "固定模板" : "可编辑", draft.isSystem ? "blue" : "success")}</div><div class="form-body"><div class="form-grid"><label class="field"><span>角色名称</span><input name="name" value="${escapeHtml(draft.name)}" maxlength="80" ${draft.isSystem ? "disabled" : "required"}/></label><label class="field"><span>角色标识</span><input name="key" value="${escapeHtml(draft.key)}" ${draft.id ? "disabled" : "required"}/><small class="field-help">自定义角色必须以 custom_ 开头。</small></label><label class="field"><span>角色等级</span><input name="rank" type="number" min="0" max="${escapeHtml(state.bootstrap.user.role.rank)}" value="${escapeHtml(draft.rank)}" ${draft.isSystem ? "disabled" : "required"}/></label><label class="field wide"><span>角色说明</span><textarea name="description" maxlength="240" ${draft.isSystem ? "disabled" : ""}>${escapeHtml(draft.description)}</textarea></label></div><div class="permission-heading"><strong>动作权限</strong><span>${draft.permissions.length} 项</span></div><div class="permission-groups">${renderPermissionGroups(data.permissionCatalog, draft.permissions, "role", draft.isSystem || !manageable)}</div>${state.mutationError ? `<div class="inline-error">${escapeHtml(state.mutationError)}</div>` : ""}</div>${draft.isSystem ? '<div class="read-only-note">系统角色由代码和数据库种子统一维护，避免不同环境发生权限漂移。如需为某位员工增减权限，请到“用户与权限”使用个人覆盖。</div>' : `<div class="editor-actions"><small>不能创建超过当前账号权限或等级的角色。</small><button class="button primary" type="submit" ${state.saving || !manageable ? "disabled" : ""}>${icon("check")} 保存角色</button></div>`}</form></section></div>`;
}

function auditDetail(details) {
  if (!details || !Object.keys(details).length) return "—";
  return Object.entries(details).map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : value}`).join(" · ");
}

function renderAudit() {
  if (state.pageLoading === "audit" && !state.auditData) return `<div class="page">${pageHeader("操作日志", "读取真实高风险操作记录。")}${loadingCard()}</div>`;
  if (state.pageError && !state.auditData) return `<div class="page">${pageHeader("操作日志", "读取真实高风险操作记录。")}${errorCard(state.pageError, "audit")}</div>`;
  const logs = state.auditData?.logs || [];
  return `<div class="page">${pageHeader("操作日志", "账号、权限、角色和登录操作由服务端记录，可按操作者和模块追溯。", `<button class="button" data-retry="audit">${icon("refresh")} 刷新日志</button>`)}<section class="card audit-list"><div class="audit-row audit-head"><span>时间</span><span>操作者</span><span>操作与对象</span><span>来源模块</span><span>结果</span></div>${logs.map((log) => `<div class="audit-row"><span>${escapeHtml(formatTime(log.createdAt))}</span><span class="person"><span class="avatar">${escapeHtml(initials(log.actor?.name || "系"))}</span><span><strong>${escapeHtml(log.actor?.name || "系统")}</strong><small>${escapeHtml(log.actor?.email || "自动记录")}</small></span></span><span class="audit-action"><strong>${escapeHtml(log.action)}</strong><small>${escapeHtml(auditDetail(log.details))}</small></span><span>${escapeHtml(MODULE_LABELS[log.module] || log.module)}</span><span>${status(log.result === "success" ? "成功" : log.result === "denied" ? "已拒绝" : "失败", log.result === "success" ? "success" : log.result === "denied" ? "warning" : "danger")}</span></div>`).join("")}${logs.length ? "" : '<div class="empty"><strong>还没有操作记录</strong><span>登录、账号和权限操作发生后会显示在这里。</span></div>'}</section></div>`;
}

function renderForbidden() {
  return `<div class="page"><div class="forbidden"><article class="card">${icon("lock")}<h1>你没有这个板块的权限</h1><p>当前账号无法访问“${escapeHtml(MODULE_LABELS[currentRoot()] || "该页面")}”。菜单隐藏和直接路由访问都会受到限制。</p><button class="button primary" data-route="overview">返回工作台</button></article></div></div>`;
}

function renderPage() {
  const current = route();
  const root = currentRoot();
  if (!canOpen(root)) return renderForbidden();
  if (current === "overview") return renderOverview();
  if (current === "users/new") return renderNewUser();
  if (current === "users") return renderUsers();
  if (current === "roles") return renderRoles();
  if (current === "audit") return renderAudit();
  if (["students", "content", "booking", "devices"].includes(root)) return renderMigrationPage(root);
  return renderOverview();
}

function renderPasswordModal() {
  if (!state.passwordUserId || !state.usersData) return "";
  const user = state.usersData.users.find((item) => item.id === state.passwordUserId);
  if (!user) return "";
  return `<div class="modal-layer"><form class="modal" id="resetPasswordForm"><div class="modal-head"><div><h2>重置 ${escapeHtml(user.displayName)} 的密码</h2><p>保存后，这名员工当前所有登录会话都会失效。</p></div><button class="icon-button" type="button" data-action="close-password">${icon("close")}</button></div><div class="modal-body"><label class="field"><span>新密码</span><input name="password" type="password" minlength="12" maxlength="200" autocomplete="new-password" required /><small class="field-help">至少 12 个字符。不要通过公开群聊发送密码。</small></label>${state.mutationError ? `<div class="inline-error">${escapeHtml(state.mutationError)}</div>` : ""}</div><div class="modal-actions"><button class="button" type="button" data-action="close-password">取消</button><button class="button primary" type="submit" ${state.saving ? "disabled" : ""}>${icon("key")} 确认重置</button></div></form></div>`;
}

function render() {
  const app = document.querySelector("#app");
  if (state.booting) {
    app.innerHTML = '<main class="loading-screen"><div><div class="spinner"></div><span>正在验证后台会话…</span></div></main>';
    return;
  }
  if (!state.bootstrap || route() === "login") {
    app.innerHTML = renderLogin();
    return;
  }
  app.innerHTML = `<div class="app-shell ${state.sidebarOpen ? "sidebar-open" : ""}">${renderSidebar()}<button class="sidebar-overlay" data-action="close-sidebar" aria-label="关闭导航"></button><main class="main">${renderTopbar()}${renderPage()}</main>${renderPasswordModal()}${state.toast ? `<div class="toast" role="status">${icon("check")}<div><strong>${escapeHtml(state.toast.title)}</strong><small>${escapeHtml(state.toast.message)}</small></div><button data-action="close-toast">${icon("close")}</button></div>` : ""}</div>`;
}

async function runMutation(work, success) {
  state.saving = true;
  state.mutationError = "";
  render();
  try {
    await work();
    await success();
  } catch (error) {
    if (!handleSessionError(error)) {
      state.mutationError = error.message;
      render();
    }
  } finally {
    state.saving = false;
    render();
  }
}

document.addEventListener("click", async (event) => {
  const routeTarget = event.target.closest("[data-route]");
  if (routeTarget) return go(routeTarget.dataset.route);
  const retry = event.target.closest("[data-retry]")?.dataset.retry;
  if (retry) return loadPage(retry, true);
  const userRow = event.target.closest("[data-user-id]");
  if (userRow) {
    state.selectedUserId = userRow.dataset.userId;
    state.userDraft = null;
    state.mutationError = "";
    return render();
  }
  const roleRow = event.target.closest("[data-role-id]");
  if (roleRow) {
    state.selectedRoleId = roleRow.dataset.roleId;
    state.roleDraft = null;
    state.mutationError = "";
    return render();
  }
  const actionElement = event.target.closest("[data-action]");
  const action = actionElement?.dataset.action;
  if (action === "toggle-sidebar") { state.sidebarOpen = !state.sidebarOpen; return render(); }
  if (action === "close-sidebar") { state.sidebarOpen = false; return render(); }
  if (action === "close-toast") { state.toast = null; return render(); }
  if (action === "close-password") { state.passwordUserId = null; state.mutationError = ""; return render(); }
  if (action === "refresh-bootstrap") {
    return runMutation(() => loadBootstrap(), async () => showToast("权限已刷新", "菜单和数据范围已按服务端最新配置更新。"));
  }
  if (action === "logout") {
    state.saving = true;
    render();
    try {
      await api("session", { method: "DELETE" });
      state.bootstrap = null;
      state.usersData = null;
      state.rolesData = null;
      state.auditData = null;
      state.authError = "";
      location.hash = "login";
    } catch (error) {
      state.mutationError = error.message;
      showToast("退出失败", error.message);
    } finally {
      state.saving = false;
      render();
    }
    return;
  }
  if (action === "save-user") {
    const draft = state.userDraft;
    return runMutation(() => api("users", { method: "POST", body: { action: "updateAccess", userId: draft.userId, roleKey: draft.roleKey, dataScope: draft.dataScope, dataScopeRef: draft.dataScopeRef || null, campusId: draft.campusId || null, permissions: draft.permissions } }), async () => {
      await loadPage("users", true);
      state.userDraft = null;
      showToast("权限已保存", "角色、数据范围和动作权限已写入数据库与审计日志。" );
    });
  }
  if (action === "toggle-user-status") {
    const targetStatus = actionElement.dataset.status;
    const user = state.usersData.users.find((item) => item.id === actionElement.dataset.user);
    if (!confirm(`${targetStatus === "disabled" ? "停用" : "启用"} ${user.displayName} 的账号？${targetStatus === "disabled" ? "当前会话会立即失效。" : ""}`)) return;
    return runMutation(() => api("users", { method: "POST", body: { action: "setStatus", userId: user.id, status: targetStatus } }), async () => {
      await loadPage("users", true);
      state.userDraft = null;
      showToast("账号状态已更新", `${user.displayName} 已${targetStatus === "disabled" ? "停用" : "启用"}。`);
    });
  }
  if (action === "reset-password") { state.passwordUserId = actionElement.dataset.user; state.mutationError = ""; return render(); }
  if (action === "new-role") { state.selectedRoleId = "new"; state.roleDraft = makeRoleDraft(null); state.mutationError = ""; return render(); }
});

document.addEventListener("change", (event) => {
  if (event.target.id === "userRole") {
    const role = state.usersData.roles.find((item) => item.key === event.target.value);
    state.userDraft.roleKey = role.key;
    state.userDraft.permissions = [...role.permissions];
    state.userDraft.dataScope = role.defaultDataScope || "own";
    state.userDraft.campusId = "";
    state.userDraft.dataScopeRef = "";
    state.mutationError = "";
    return render();
  }
  if (event.target.id === "userScope") { state.userDraft.dataScope = event.target.value; state.mutationError = ""; return render(); }
  if (event.target.matches("[data-user-permission]")) {
    const key = event.target.dataset.userPermission;
    const values = new Set(state.userDraft.permissions);
    event.target.checked ? values.add(key) : values.delete(key);
    state.userDraft.permissions = [...values].sort();
    return;
  }
  if (event.target.id === "newUserRole") {
    const role = state.usersData.roles.find((item) => item.key === event.target.value);
    state.newUser.roleKey = role.key;
    state.newUser.permissions = [...role.permissions];
    state.newUser.dataScope = role.defaultDataScope || "own";
    return render();
  }
  if (event.target.id === "newUserScope") { state.newUser.dataScope = event.target.value; return render(); }
  if (event.target.matches("[data-new-user-permission]")) {
    const key = event.target.dataset.newUserPermission;
    const values = new Set(state.newUser.permissions);
    event.target.checked ? values.add(key) : values.delete(key);
    state.newUser.permissions = [...values].sort();
    return;
  }
  if (event.target.matches("[data-role-permission]")) {
    const key = event.target.dataset.rolePermission;
    const values = new Set(state.roleDraft.permissions);
    event.target.checked ? values.add(key) : values.delete(key);
    state.roleDraft.permissions = [...values].sort();
  }
});

document.addEventListener("input", (event) => {
  if (event.target.id === "loginEmail") state.loginEmail = event.target.value;
  if (event.target.id === "userCampus") state.userDraft.campusId = event.target.value;
  if (event.target.id === "userScopeRef") state.userDraft.dataScopeRef = event.target.value;
  if (event.target.id === "userSearch") {
    state.userQuery = event.target.value;
    const position = event.target.selectionStart;
    render();
    const input = document.querySelector("#userSearch");
    input?.focus();
    input?.setSelectionRange(position, position);
  }
  if (event.target.matches("[data-new-user-field]") && state.newUser) {
    state.newUser[event.target.dataset.newUserField] = event.target.value;
  }
});

document.addEventListener("submit", async (event) => {
  if (event.target.id === "loginForm") {
    event.preventDefault();
    const form = new FormData(event.target);
    state.saving = true;
    state.authError = "";
    render();
    try {
      await api("session", { method: "POST", body: { email: form.get("email"), password: form.get("password") } });
      await loadBootstrap();
      location.hash = "overview";
    } catch (error) {
      state.authError = error.message;
    } finally {
      state.saving = false;
      render();
    }
    return;
  }
  if (event.target.id === "createUserForm") {
    event.preventDefault();
    const form = new FormData(event.target);
    const draft = state.newUser;
    return runMutation(() => api("users", { method: "POST", body: { action: "create", displayName: form.get("displayName"), email: form.get("email"), password: form.get("password"), roleKey: draft.roleKey, dataScope: draft.dataScope, campusId: form.get("campusId") || null, dataScopeRef: form.get("dataScopeRef") || null, permissions: draft.permissions } }), async () => {
      state.newUser = null;
      await loadPage("users", true);
      go("users");
      showToast("员工已创建", "账号、角色、数据范围和权限已写入数据库。" );
    });
    return;
  }
  if (event.target.id === "roleForm") {
    event.preventDefault();
    if (state.roleDraft.isSystem) return;
    const form = new FormData(event.target);
    const draft = state.roleDraft;
    const savedKey = form.get("key") || draft.key;
    return runMutation(() => api("roles", { method: "POST", body: { action: "save", roleId: draft.id, key: savedKey, name: form.get("name"), description: form.get("description"), rank: Number(form.get("rank")), permissions: draft.permissions } }), async () => {
      await loadPage("roles", true);
      state.selectedRoleId = state.rolesData.roles.find((role) => role.key === savedKey)?.id || state.rolesData.roles[0]?.id || null;
      state.roleDraft = null;
      showToast("角色已保存", "角色模板和动作权限已更新并写入审计。" );
    });
    return;
  }
  if (event.target.id === "resetPasswordForm") {
    event.preventDefault();
    const password = new FormData(event.target).get("password");
    const userId = state.passwordUserId;
    return runMutation(() => api("users", { method: "POST", body: { action: "resetPassword", userId, password } }), async () => {
      state.passwordUserId = null;
      await loadPage("users", true);
      showToast("密码已重置", "该员工原有登录会话已经全部撤销。" );
    });
  }
});

async function routeChanged() {
  if (!state.booting) {
    if (!state.bootstrap && route() !== "login") location.hash = "login";
    else if (state.bootstrap && route() === "login") location.hash = "overview";
    state.sidebarOpen = false;
    if (route() !== "users/new") state.newUser = null;
    state.mutationError = "";
    render();
    window.scrollTo(0, 0);
    await ensureRouteData();
  }
}

window.addEventListener("hashchange", routeChanged);
boot();
