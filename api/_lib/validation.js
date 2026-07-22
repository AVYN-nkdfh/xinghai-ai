export const SLOT_IDS = ["morning", "afternoon", "evening"];

function dateInShanghai(offset = 0) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  const date = new Date(`${parts.year}-${parts.month}-${parts.day}T12:00:00+08:00`);
  date.setUTCDate(date.getUTCDate() + offset);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function validateDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) throw badRequest("日期格式不正确");
  const allowed = new Set(Array.from({ length: 7 }, (_, index) => dateInShanghai(index)));
  if (!allowed.has(value)) throw badRequest("只能预约未来 7 天内的时段");
  return value;
}

export function validateSlot(value) {
  if (!SLOT_IDS.includes(value)) throw badRequest("时段不正确");
  return value;
}

export function validateMachine(value) {
  const machineId = Number(value);
  if (!Number.isInteger(machineId) || machineId < 1 || machineId > 6) throw badRequest("机器编号不正确");
  return machineId;
}

export function validateText(value, label, maxLength = 30) {
  const text = String(value || "").trim();
  if (!text || text.length > maxLength) throw badRequest(`${label}不正确`);
  return text;
}

export function validatePhone(value) {
  const phone = String(value || "").trim();
  if (!/^1\d{10}$/.test(phone)) throw badRequest("手机号不正确");
  return phone;
}

export function badRequest(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}
