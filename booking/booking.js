const SLOTS = [
  { id: "morning", name: "上午", time: "10:00–13:00" },
  { id: "afternoon", name: "下午", time: "14:00–17:00" },
  { id: "evening", name: "晚间", time: "18:00–21:00" },
];
const MACHINES = [1, 2, 3, 4, 5, 6];
const WEEK = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const el = (id) => document.getElementById(id);
const LOCAL_PREVIEW = ["127.0.0.1", "localhost"].includes(location.hostname) && location.port === "8877";
const PREVIEW_MIXED_STATE = LOCAL_PREVIEW && new URLSearchParams(location.search).get("scenario") === "mixed";
const GET_TIMEOUT_MS = 7000;
const GET_RETRY_DELAY_MS = 350;
const previewState = {
  authenticated: false,
  bookings: PREVIEW_MIXED_STATE ? [{
    id: crypto.randomUUID(),
    groupId: crypto.randomUUID(),
    bookingCode: "XH-PREVIEW-MIXED",
    date: isoDate(new Date()),
    slotId: "afternoon",
    machineId: 1,
    student: "示例学生",
    grade: "其他",
    phone: "19900000000",
  }] : [],
  maintenance: [],
  longMaintenance: [],
  closed: [],
};

let parentDateIndex = 0;
let parentSlotIds = PREVIEW_MIXED_STATE ? ["morning", "afternoon"] : ["morning"];
let selectedMachine = null;
let adminDateIndex = 0;
let adminSlotId = "morning";
let adminMachine = null;
let adminAuthenticated = false;
let toastTimer;

function isoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function emptyDay(date) {
  return {
    date,
    loaded: false,
    loading: false,
    error: "",
    slots: Object.fromEntries(SLOTS.map((slot) => [slot.id, { open: true, maintenance: [] }])),
    bookings: [],
    longTermMaintenance: [],
  };
}

const appState = {
  dates: Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + index);
    return emptyDay(isoDate(date));
  }),
};

async function previewApi(path, options) {
  const url = new URL(path, location.origin);
  const body = options.body ? JSON.parse(options.body) : {};
  const slotsFor = (date) => Object.fromEntries(SLOTS.map((slot) => [slot.id, {
    open: !previewState.closed.includes(`${date}:${slot.id}`),
    maintenance: previewState.maintenance.filter((key) => key.startsWith(`${date}:${slot.id}:`)).map((key) => Number(key.split(":")[2])),
    booked: previewState.bookings.filter((booking) => booking.date === date && booking.slotId === slot.id).map((booking) => booking.machineId),
  }]));
  if (url.pathname.endsWith("/availability")) return { date: url.searchParams.get("date"), slots: slotsFor(url.searchParams.get("date")), longTermMaintenance: previewState.longMaintenance };
  if (url.pathname.endsWith("/create")) {
    const slotIds = body.slotIds || [body.slotId];
    const conflict = previewState.longMaintenance.includes(body.machineId) || slotIds.some((slotId) => (
      previewState.closed.includes(`${body.date}:${slotId}`)
      || previewState.maintenance.includes(`${body.date}:${slotId}:${body.machineId}`)
      || previewState.bookings.some((booking) => booking.date === body.date && booking.slotId === slotId && booking.machineId === body.machineId)
    ));
    if (conflict) { const error = new Error("所选时段中有机位刚被预约或暂不可用，请重新选择"); error.status = 409; throw error; }
    const groupId = crypto.randomUUID();
    const bookingCode = `XH-PREVIEW-${body.machineId}`;
    previewState.bookings.push(...slotIds.map((slotId) => ({ ...body, id: crypto.randomUUID(), groupId, bookingCode, slotId })));
    return { bookingCode, slotIds };
  }
  if (url.pathname.endsWith("/login")) { previewState.authenticated = true; return { ok: true }; }
  if (url.pathname.endsWith("/logout")) { previewState.authenticated = false; return { ok: true }; }
  if (url.pathname.endsWith("/state")) {
    if (!previewState.authenticated) { const error = new Error("请先登录管理后台"); error.status = 401; throw error; }
    const date = url.searchParams.get("date");
    return {
      date,
      slots: slotsFor(date),
      longTermMaintenance: previewState.longMaintenance,
      bookings: previewState.bookings.filter((booking) => booking.date === date).map((booking) => ({
        id: booking.id,
        groupId: booking.groupId || booking.id,
        code: booking.bookingCode,
        slotId: booking.slotId,
        machineId: booking.machineId,
        student: booking.student,
        grade: booking.grade,
        phone: booking.phone,
      })),
    };
  }
  if (url.pathname.endsWith("/action")) {
    if (body.action === "cancelBooking") previewState.bookings = previewState.bookings.filter((booking) => (booking.groupId || booking.id) !== (body.bookingGroupId || body.bookingId));
    if (body.action === "setMaintenance") {
      const slotIds = body.slotIds || [body.slotId];
      const keys = slotIds.map((slotId) => `${body.date}:${slotId}:${body.machineId}`);
      previewState.maintenance = body.enabled
        ? [...new Set([...previewState.maintenance, ...keys])]
        : previewState.maintenance.filter((item) => !keys.includes(item));
    }
    if (body.action === "setLongTermMaintenance") {
      previewState.longMaintenance = body.enabled
        ? [...new Set([...previewState.longMaintenance, body.machineId])]
        : previewState.longMaintenance.filter((machineId) => machineId !== body.machineId);
    }
    if (body.action === "setSlotOpen") {
      const key = `${body.date}:${body.slotId}`;
      previewState.closed = body.open ? previewState.closed.filter((item) => item !== key) : [...new Set([...previewState.closed, key])];
    }
    return { ok: true };
  }
  throw new Error("本地预览接口不存在");
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function request(path, options, retryCount = 0) {
  const method = String(options.method || "GET").toUpperCase();
  const canRetry = method === "GET";
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), GET_TIMEOUT_MS);
  try {
    const response = await fetch(path, {
      credentials: "same-origin",
      ...options,
      signal: controller.signal,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || "请求失败，请稍后再试");
      error.status = response.status;
      throw error;
    }
    return payload;
  } catch (error) {
    const normalized = error.name === "AbortError"
      ? Object.assign(new Error("网络较慢，请重新加载"), { code: "REQUEST_TIMEOUT" })
      : error;
    const retryable = canRetry && retryCount === 0
      && (!normalized.status || normalized.status === 429 || normalized.status >= 500);
    if (retryable) {
      await wait(GET_RETRY_DELAY_MS);
      return request(path, options, retryCount + 1);
    }
    throw normalized;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function api(path, options = {}) {
  if (LOCAL_PREVIEW) return previewApi(path, options);
  return request(path, options);
}

function normalizeDay(day, payload) {
  day.slots = Object.fromEntries(SLOTS.map((slot) => {
    const source = payload.slots?.[slot.id] || {};
    return [slot.id, { open: source.open !== false, maintenance: source.maintenance || [] }];
  }));
  day.bookings = payload.bookings || SLOTS.flatMap((slot) =>
    (payload.slots?.[slot.id]?.booked || []).map((machineId) => ({ slotId: slot.id, machineId })),
  );
  day.longTermMaintenance = payload.longTermMaintenance || [];
  day.loaded = true;
  day.loadedAt = Date.now();
  day.error = "";
}

async function loadParentDate(index, force = false, silent = false) {
  const day = appState.dates[index];
  if ((day.loaded && !force) || day.loading) return;
  day.loading = true;
  if (!silent || !day.loaded) {
    day.error = "";
    renderParent();
  }
  try {
    normalizeDay(day, await api(`/api/booking/availability?date=${encodeURIComponent(day.date)}`));
  } catch (error) {
    if (day.loaded && silent) showToast("刷新失败，当前仍显示上次数据");
    else day.error = error.message;
  } finally {
    day.loading = false;
    renderParent();
  }
}

async function loadAdminDate(index) {
  const day = appState.dates[index];
  day.loading = true;
  day.error = "";
  try {
    normalizeDay(day, await api(`/api/admin/state?date=${encodeURIComponent(day.date)}`));
    adminAuthenticated = true;
    day.loading = false;
    showAdminDashboard();
    renderAdmin();
  } catch (error) {
    if (error.status === 401) {
      adminAuthenticated = false;
      showAdminLogin();
      return;
    }
    day.error = error.message;
    day.loading = false;
    if (adminAuthenticated) renderAdmin();
  } finally {
    day.loading = false;
  }
}

function getDay(index) { return appState.dates[index]; }
function getSlot(slotId) { return SLOTS.find((slot) => slot.id === slotId); }
function getBooking(day, slotId, machineId) { return day.bookings.find((booking) => booking.slotId === slotId && booking.machineId === machineId); }
function isMaintenance(day, slotId, machineId) { return day.slots[slotId].maintenance.includes(machineId); }
function isLongMaintenance(day, machineId) { return day.longTermMaintenance.includes(machineId); }
function machineState(day, slotId, machineId) {
  if (!day.slots[slotId].open) return "closed";
  if (getBooking(day, slotId, machineId)) return "booked";
  if (isLongMaintenance(day, machineId)) return "long-maintenance";
  if (isMaintenance(day, slotId, machineId)) return "maintenance";
  return "available";
}
function availableCount(day, slotId) { return MACHINES.filter((machineId) => machineState(day, slotId, machineId) === "available").length; }
function selectedSlots() { return SLOTS.filter((slot) => parentSlotIds.includes(slot.id)); }
function selectedSlotsText() { return selectedSlots().map((slot) => `${slot.name} ${slot.time}`).join("、"); }
function parentMachineState(day, machineId) {
  const states = parentSlotIds.map((slotId) => machineState(day, slotId, machineId));
  if (states.length && states.every((state) => state === "available")) return "available";
  if (states.includes("long-maintenance")) return "long-maintenance";
  if (states.includes("booked")) return "booked";
  if (states.includes("maintenance")) return "maintenance";
  return "closed";
}
function machineStateText(state, short = false) {
  if (state === "available") return "可选";
  if (state === "booked") return short ? "已约" : "已预约";
  if (state === "maintenance") return short ? "维护" : "维护中";
  if (state === "long-maintenance") return "长期维护";
  return short ? "关闭" : "已关闭";
}
function parentMachineSlotDetails(day, machineId) {
  if (parentSlotIds.length <= 1) return [];
  return selectedSlots().map((slot) => ({
    name: slot.name,
    state: machineState(day, slot.id, machineId),
  }));
}
function formatDate(dateKey, withYear = false) {
  return new Intl.DateTimeFormat("zh-CN", withYear
    ? { year: "numeric", month: "long", day: "numeric", weekday: "short" }
    : { month: "numeric", day: "numeric", weekday: "short" })
    .format(new Date(`${dateKey}T12:00:00`));
}
function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function renderDateStrip(targetId, activeIndex, onSelect) {
  el(targetId).innerHTML = appState.dates.map((day, index) => {
    const date = new Date(`${day.date}T12:00:00`);
    return `<button class="date-button" type="button" data-date-index="${index}" aria-pressed="${index === activeIndex}"><span class="date-week">${index === 0 ? "今天" : WEEK[date.getDay()]}</span><span class="date-value">${date.getMonth() + 1}/${date.getDate()}</span></button>`;
  }).join("");
  el(targetId).querySelectorAll("[data-date-index]").forEach((button) => button.addEventListener("click", () => onSelect(Number(button.dataset.dateIndex))));
}

function renderTimeStrip(targetId, day, activeSlotIds, onSelect, multiple = false) {
  const selected = Array.isArray(activeSlotIds) ? activeSlotIds : [activeSlotIds];
  el(targetId).innerHTML = SLOTS.map((slot) => {
    const count = availableCount(day, slot.id);
    const open = day.slots[slot.id].open;
    const countText = day.loading || !day.loaded ? "加载中" : !open ? "已关闭" : count ? `${count} 台可选` : "已满";
    return `<button class="time-button ${!open ? "is-closed" : ""}" type="button" data-slot-id="${slot.id}" aria-pressed="${selected.includes(slot.id)}" ${multiple && !open ? "disabled" : ""}><span><span class="time-name">${slot.name}</span><span class="time-value">${slot.time}</span></span><span class="time-count ${!open ? "is-closed" : count ? "" : "is-full"}">${countText}</span></button>`;
  }).join("");
  el(targetId).querySelectorAll("[data-slot-id]").forEach((button) => button.addEventListener("click", () => onSelect(button.dataset.slotId)));
}

function machineMarkup(day, slotId, machineId, selected, admin = false, stateOverride = "", slotDetails = []) {
  const state = stateOverride || machineState(day, slotId, machineId);
  const booking = getBooking(day, slotId, machineId);
  const stateText = machineStateText(state);
  const rowClass = machineId <= 3 ? "top" : "bottom";
  const disabled = !admin && state !== "available";
  const detailMarkup = slotDetails.length > 1
    ? `<span class="machine-slot-states">${slotDetails.map((detail) => `<span class="machine-slot-state"><span class="machine-slot-label">${detail.name}</span><span class="machine-slot-value is-${detail.state}">${machineStateText(detail.state, true)}</span></span>`).join("")}</span>`
    : `<span class="machine-state">${stateText}</span>`;
  const person = admin && booking ? `<span class="machine-person">${escapeHtml(booking.student)}</span>` : detailMarkup;
  const detail = admin && booking ? ` ${booking.student}` : "";
  const slotDetailLabel = slotDetails.map((item) => `${item.name}${machineStateText(item.state, true)}`).join("，");
  return `<button class="machine is-${state} ${selected ? "is-selected" : ""} ${slotDetails.length > 1 ? "has-slot-details" : ""}" type="button" data-machine-id="${machineId}" aria-label="${machineId}号机 ${slotDetailLabel || stateText}${escapeHtml(detail)}" ${disabled ? "disabled" : ""}><span class="machine-visual ${rowClass}"><i class="screen"></i><i class="chair"></i></span><span class="machine-number">${machineId} 号机</span>${person}</button>`;
}

function renderSeatMap(targetId, day, slotId, selected, onSelect, admin = false, stateResolver = null, detailResolver = null) {
  const row = (ids, rowClass) => `<div class="machine-row row-${rowClass}">${ids.map((machineId) => machineMarkup(day, slotId, machineId, selected === machineId, admin, stateResolver?.(machineId), detailResolver?.(machineId))).join("")}</div>`;
  el(targetId).innerHTML = `${row([1, 2, 3], "top")}<div class="facing-axis"><span>两排面对面</span></div>${row([4, 5, 6], "bottom")}`;
  el(targetId).querySelectorAll("[data-machine-id]").forEach((button) => button.addEventListener("click", () => onSelect(Number(button.dataset.machineId))));
}

function renderParent() {
  const day = getDay(parentDateIndex);
  if (day.loaded) {
    const openSelectedSlots = parentSlotIds.filter((slotId) => day.slots[slotId].open);
    if (openSelectedSlots.length !== parentSlotIds.length) parentSlotIds = openSelectedSlots;
    if (!parentSlotIds.length) {
      const firstOpen = SLOTS.find((slot) => day.slots[slot.id].open);
      if (firstOpen) parentSlotIds = [firstOpen.id];
    }
  }
  renderDateStrip("parentDates", parentDateIndex, (index) => {
    parentDateIndex = index;
    selectedMachine = null;
    renderParent();
    loadParentDate(index);
  });
  renderTimeStrip("parentTimes", day, parentSlotIds, (slotId) => {
    if (parentSlotIds.includes(slotId)) {
      if (parentSlotIds.length === 1) {
        showToast("至少保留一个时段");
        return;
      }
      parentSlotIds = parentSlotIds.filter((id) => id !== slotId);
    } else {
      parentSlotIds = SLOTS.map((slot) => slot.id).filter((id) => [...parentSlotIds, slotId].includes(id));
    }
    if (selectedMachine && parentMachineState(day, selectedMachine) !== "available") selectedMachine = null;
    renderParent();
  }, true);
  el("selectAllParentSlots").onclick = () => {
    const openSlots = SLOTS.filter((slot) => day.slots[slot.id].open).map((slot) => slot.id);
    if (!openSlots.length) return;
    parentSlotIds = openSlots;
    if (selectedMachine && parentMachineState(day, selectedMachine) !== "available") selectedMachine = null;
    renderParent();
  };
  if (day.loading || !day.loaded) {
    el("parentSeatMap").innerHTML = '<div class="loading-note">正在读取机位…</div>';
    el("parentSide").innerHTML = '<div class="side-empty"><strong>请稍候</strong><p>正在同步最新预约数据</p></div>';
    el("parentClosed").hidden = true;
    return;
  }
  if (day.error) {
    el("parentSeatMap").innerHTML = `<div class="loading-note"><div>${escapeHtml(day.error)}<br><button class="button button-secondary" id="retryParent" type="button">重新加载</button></div></div>`;
    el("parentSide").innerHTML = '<div class="side-empty"><strong>暂时无法读取</strong><p>请检查网络后重试</p></div>';
    el("retryParent")?.addEventListener("click", () => loadParentDate(parentDateIndex, true));
    return;
  }
  const hasOpenSlot = parentSlotIds.length > 0;
  const primarySlotId = parentSlotIds[0] || "morning";
  if (selectedMachine && parentMachineState(day, selectedMachine) !== "available") selectedMachine = null;
  renderSeatMap("parentSeatMap", day, primarySlotId, selectedMachine, (machineId) => {
    selectedMachine = machineId;
    renderParent();
    if (window.innerWidth <= 760) el("parentSide").scrollIntoView({ behavior: "smooth", block: "start" });
  }, false, (machineId) => parentMachineState(day, machineId), (machineId) => parentMachineSlotDetails(day, machineId));
  el("parentSeatMap").closest(".map-panel").hidden = !hasOpenSlot;
  el("parentSide").hidden = !hasOpenSlot;
  el("parentClosed").hidden = hasOpenSlot;
  renderParentSide(day);
}

function renderParentSide(day) {
  const side = el("parentSide");
  const timeText = selectedSlotsText();
  if (!selectedMachine) {
    side.innerHTML = `<div class="side-empty"><strong>请选择机器</strong><p>${formatDate(day.date)} · ${timeText}</p></div>`;
    return;
  }
  side.innerHTML = `<div class="selection-title">已选择 ${parentSlotIds.length} 个时段</div><div class="selection-machine">${selectedMachine} 号机</div><div class="selection-meta">${formatDate(day.date)} · ${timeText}</div><form class="form" id="bookingForm" novalidate><div class="field" data-field="student"><label for="studentName">学生姓名</label><input id="studentName" name="student" autocomplete="name" maxlength="30" /><div class="field-error"></div></div><div class="field" data-field="grade"><label for="studentGrade">年级</label><select id="studentGrade" name="grade"><option value="">请选择</option><option>小学 3 年级</option><option>小学 4 年级</option><option>小学 5 年级</option><option>小学 6 年级</option><option>初中 1 年级</option><option>初中 2 年级</option><option>初中 3 年级</option><option>高中</option><option>其他</option></select><div class="field-error"></div></div><div class="field" data-field="phone"><label for="parentPhone">家长手机号</label><input id="parentPhone" name="phone" inputmode="numeric" autocomplete="tel" maxlength="11" /><div class="field-error"></div></div><button class="button button-primary" id="submitBooking" type="submit">确认预约 ${selectedMachine} 号机</button><div class="privacy">仅用于本次预约联系</div></form>`;
  el("bookingForm").addEventListener("submit", submitBooking);
}

function setError(name, message) {
  const field = document.querySelector(`[data-field="${name}"]`);
  field.classList.add("has-error");
  field.querySelector(".field-error").textContent = message;
}

async function submitBooking(event) {
  event.preventDefault();
  const form = event.currentTarget;
  form.querySelectorAll(".field").forEach((field) => field.classList.remove("has-error"));
  form.querySelectorAll(".field-error").forEach((field) => { field.textContent = ""; });
  const data = Object.fromEntries(new FormData(form).entries());
  let valid = true;
  if (!data.student.trim()) { setError("student", "请填写姓名"); valid = false; }
  if (!data.grade) { setError("grade", "请选择年级"); valid = false; }
  if (!/^1\d{10}$/.test(data.phone.trim())) { setError("phone", "请填写 11 位手机号"); valid = false; }
  if (!valid) return;
  const day = getDay(parentDateIndex);
  const machineId = selectedMachine;
  const slotIds = [...parentSlotIds];
  const timeText = selectedSlotsText();
  const submit = el("submitBooking");
  submit.disabled = true;
  submit.textContent = "正在预约…";
  try {
    const result = await api("/api/booking/create", {
      method: "POST",
      body: JSON.stringify({ date: day.date, slotIds, machineId, student: data.student.trim(), grade: data.grade, phone: data.phone.trim() }),
    });
    el("successCode").textContent = result.bookingCode;
    el("successSummary").innerHTML = `<div class="success-item"><span>日期</span><strong>${formatDate(day.date, true)}</strong></div><div class="success-item"><span>时间</span><strong>${timeText}</strong></div><div class="success-item"><span>机器</span><strong>${machineId} 号机</strong></div><div class="success-item"><span>学生</span><strong>${escapeHtml(data.student.trim())}</strong></div>`;
    el("successLayer").hidden = false;
    el("successDone").focus();
    selectedMachine = null;
    await loadParentDate(parentDateIndex, true, true);
  } catch (error) {
    showToast(error.message);
    if (error.status === 409) {
      selectedMachine = null;
      await loadParentDate(parentDateIndex, true, true);
    } else {
      submit.disabled = false;
      submit.textContent = `确认预约 ${machineId} 号机`;
    }
  }
}

function showAdminLogin(message = "") {
  el("adminLogin").hidden = false;
  el("adminDashboard").hidden = true;
  el("loginError").hidden = !message;
  el("loginError").textContent = message;
}

function showAdminDashboard() {
  el("adminLogin").hidden = true;
  el("adminDashboard").hidden = false;
}

function renderAdmin() {
  const day = getDay(adminDateIndex);
  const slot = getSlot(adminSlotId);
  renderDateStrip("adminDates", adminDateIndex, (index) => {
    adminDateIndex = index;
    adminMachine = null;
    loadAdminDate(index);
  });
  renderTimeStrip("adminTimes", day, adminSlotId, (slotId) => {
    adminSlotId = slotId;
    adminMachine = null;
    renderAdmin();
  });
  if (day.error) {
    el("adminSeatMap").innerHTML = `<div class="loading-note">${escapeHtml(day.error)}</div>`;
    return;
  }
  renderSeatMap("adminSeatMap", day, adminSlotId, adminMachine, (machineId) => { adminMachine = machineId; renderAdmin(); }, true);
  el("adminCurrentSlot").textContent = `${formatDate(day.date)} · ${slot.name} ${slot.time}`;
  const booked = MACHINES.filter((id) => machineState(day, adminSlotId, id) === "booked").length;
  const maintenance = MACHINES.filter((id) => ["maintenance", "long-maintenance"].includes(machineState(day, adminSlotId, id))).length;
  el("adminCounts").innerHTML = `<span class="status-count">可用<strong>${availableCount(day, adminSlotId)}</strong></span><span class="status-count">预约<strong>${booked}</strong></span><span class="status-count">维护<strong>${maintenance}</strong></span>`;
  el("slotSwitch").setAttribute("aria-pressed", String(day.slots[adminSlotId].open));
  renderAdminSide(day);
  renderRoster(day);
}

function renderAdminSide(day) {
  const side = el("adminSide");
  if (!adminMachine) { side.innerHTML = '<div class="side-empty"><strong>点击机器管理</strong><p>可维护当前时段、全天或长期停用</p></div>'; return; }
  const state = machineState(day, adminSlotId, adminMachine);
  const booking = getBooking(day, adminSlotId, adminMachine);
  const stateText = state === "available" ? "可用" : state === "booked" ? "已预约" : state === "maintenance" ? "当前时段维护" : state === "long-maintenance" ? "长期维护" : "时段已关闭";
  let detail = `<div class="admin-machine-copy"><span>当前状态</span><strong>${stateText}</strong></div>`;
  let action = "";
  if (booking) {
    const groupSlots = day.bookings.filter((row) => (row.groupId || row.id) === (booking.groupId || booking.id)).map((row) => getSlot(row.slotId)).filter(Boolean);
    detail += `<div class="admin-machine-copy"><span>学生</span><strong>${escapeHtml(booking.student)} · ${escapeHtml(booking.grade)}</strong><span>${escapeHtml(booking.phone)}</span><span>${groupSlots.map((slot) => `${slot.name} ${slot.time}`).join("、")}</span></div>`;
    action = `<button class="button button-danger" type="button" id="cancelBooking">取消整组预约并释放机器</button>`;
  } else if (state === "long-maintenance") {
    action = `<button class="button button-primary" type="button" id="restoreLongTerm">结束长期维护</button>`;
  } else {
    const currentMaintenance = isMaintenance(day, adminSlotId, adminMachine);
    const allDayMaintenance = SLOTS.every((slot) => isMaintenance(day, slot.id, adminMachine));
    action = `
      <button class="button ${currentMaintenance ? "button-primary" : "button-secondary"}" type="button" id="toggleCurrentMaintenance">${currentMaintenance ? "恢复当前时段" : "维护当前时段"}</button>
      <button class="button ${allDayMaintenance ? "button-primary" : "button-secondary"}" type="button" id="toggleDayMaintenance">${allDayMaintenance ? "恢复今天全部时段" : "维护今天全部时段"}</button>
      <button class="button button-secondary" type="button" id="setLongTermMaintenance">设为长期维护</button>`;
  }
  side.innerHTML = `<div class="selection-title">管理机器</div><div class="selection-machine">${adminMachine} 号机</div><div class="selection-meta">${formatDate(day.date)} · ${getSlot(adminSlotId).name}</div>${detail}<div class="admin-actions">${action}</div>`;
  el("cancelBooking")?.addEventListener("click", () => adminAction({ action: "cancelBooking", bookingGroupId: booking.groupId || booking.id }, "整组预约已取消，机器已释放"));
  el("restoreLongTerm")?.addEventListener("click", () => adminAction({ action: "setLongTermMaintenance", machineId: adminMachine, enabled: false }, "长期维护已结束"));
  el("toggleCurrentMaintenance")?.addEventListener("click", () => {
    const enabled = !isMaintenance(day, adminSlotId, adminMachine);
    adminAction({ action: "setMaintenance", date: day.date, slotIds: [adminSlotId], machineId: adminMachine, enabled }, enabled ? "当前时段已设为维护" : "当前时段已恢复");
  });
  el("toggleDayMaintenance")?.addEventListener("click", () => {
    const enabled = !SLOTS.every((slot) => isMaintenance(day, slot.id, adminMachine));
    adminAction({ action: "setMaintenance", date: day.date, slotIds: SLOTS.map((slot) => slot.id), machineId: adminMachine, enabled }, enabled ? "今天全部时段已设为维护" : "今天全部时段已恢复");
  });
  el("setLongTermMaintenance")?.addEventListener("click", () => adminAction({ action: "setLongTermMaintenance", machineId: adminMachine, enabled: true }, "机器已设为长期维护"));
}

function renderRoster(day) {
  const rows = day.bookings.filter((booking) => booking.slotId === adminSlotId).sort((a, b) => a.machineId - b.machineId);
  el("rosterList").innerHTML = rows.length ? `<div class="roster-list">${rows.map((booking) => {
    const groupCount = day.bookings.filter((row) => (row.groupId || row.id) === (booking.groupId || booking.id)).length;
    return `<div class="roster-row"><strong>${booking.machineId} 号机</strong><span>${escapeHtml(booking.student)} · ${escapeHtml(booking.grade)}${groupCount > 1 ? ` · 连约 ${groupCount} 段` : ""}</span><span>${escapeHtml(booking.phone)}</span></div>`;
  }).join("")}</div>` : '<div class="roster-empty">当前时段暂无预约</div>';
}

async function adminAction(payload, successMessage) {
  try {
    await api("/api/admin/action", { method: "POST", body: JSON.stringify(payload) });
    await loadAdminDate(adminDateIndex);
    showToast(successMessage);
  } catch (error) {
    if (error.status === 401) { showAdminLogin("登录已过期，请重新登录"); return; }
    showToast(error.message);
  }
}

async function switchView() {
  const isAdmin = location.hash === "#admin";
  el("parentView").hidden = isAdmin;
  el("adminView").hidden = !isAdmin;
  el("viewSwitch").textContent = isAdmin ? "返回家长端" : "管理后台";
  window.scrollTo({ top: 0, behavior: "auto" });
  if (isAdmin) await loadAdminDate(adminDateIndex);
  else {
    renderParent();
    await loadParentDate(parentDateIndex, !getDay(parentDateIndex).loaded, getDay(parentDateIndex).loaded);
  }
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  el("toast").textContent = message;
  el("toast").classList.add("is-visible");
  toastTimer = window.setTimeout(() => el("toast").classList.remove("is-visible"), 2600);
}

el("viewSwitch").addEventListener("click", () => { location.hash = location.hash === "#admin" ? "" : "admin"; });
window.addEventListener("hashchange", switchView);
el("adminLoginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = el("loginButton");
  button.disabled = true;
  button.textContent = "正在登录…";
  try {
    await api("/api/admin/login", { method: "POST", body: JSON.stringify({ password: el("adminPassword").value }) });
    el("adminPassword").value = "";
    adminAuthenticated = true;
    await loadAdminDate(adminDateIndex);
  } catch (error) {
    showAdminLogin(error.message);
  } finally {
    button.disabled = false;
    button.textContent = "登录";
  }
});
el("logoutAdmin").addEventListener("click", async () => {
  await api("/api/admin/logout", { method: "POST" }).catch(() => {});
  adminAuthenticated = false;
  showAdminLogin();
});
el("slotSwitch").addEventListener("click", () => {
  const day = getDay(adminDateIndex);
  const open = !day.slots[adminSlotId].open;
  adminAction({ action: "setSlotOpen", date: day.date, slotId: adminSlotId, open }, open ? "时段已开放" : "时段已关闭");
});
el("successDone").addEventListener("click", () => { el("successLayer").hidden = true; });
el("successLayer").addEventListener("click", (event) => { if (event.target === el("successLayer")) el("successLayer").hidden = true; });
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible" || location.hash === "#admin" || selectedMachine) return;
  loadParentDate(parentDateIndex, true, true);
});
window.setInterval(() => {
  if (document.visibilityState === "visible" && location.hash !== "#admin" && !selectedMachine) loadParentDate(parentDateIndex, true, true);
}, 30000);

switchView();
