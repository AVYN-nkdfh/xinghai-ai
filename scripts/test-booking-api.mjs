import assert from "node:assert/strict";
import login from "../api/admin/login.js";
import adminAction from "../api/admin/action.js";
import adminState from "../api/admin/state.js";
import availability from "../api/booking/availability.js";
import createBooking from "../api/booking/create.js";
import { db, ensureSchema } from "../api/_lib/db.js";

const SLOT_IDS = ["morning", "afternoon", "evening"];
const TEST_STUDENT = "接口回归测试";
const TEST_PHONE = "19900009999";

function shanghaiDate(offset = 0) {
  const date = new Date(Date.now() + offset * 86400000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

async function call(handler, { method = "GET", query = {}, body = {}, cookie = "" } = {}) {
  const headers = { host: "localhost", ...(cookie ? { cookie } : {}) };
  const responseHeaders = new Map();
  let rawBody = "";
  const req = { method, query, body, headers, socket: { remoteAddress: "127.0.0.1" } };
  const res = {
    statusCode: 200,
    setHeader(name, value) { responseHeaders.set(String(name).toLowerCase(), value); },
    end(value = "") { rawBody = String(value); },
  };
  await handler(req, res);
  return {
    status: res.statusCode,
    headers: responseHeaders,
    body: rawBody ? JSON.parse(rawBody) : {},
  };
}

function expectStatus(response, expected, label) {
  assert.equal(response.status, expected, `${label}: ${response.status} ${JSON.stringify(response.body)}`);
}

if (!process.env.ADMIN_PASSWORD || !process.env.DATABASE_URL || !process.env.SESSION_SECRET) {
  throw new Error("Missing ADMIN_PASSWORD, DATABASE_URL or SESSION_SECRET");
}

const loginResponse = await call(login, { method: "POST", body: { password: process.env.ADMIN_PASSWORD } });
expectStatus(loginResponse, 200, "admin login");
const cookie = String(loginResponse.headers.get("set-cookie")).split(";")[0];
const dates = Array.from({ length: 7 }, (_, index) => shanghaiDate(index));
const states = [];
for (const date of dates) {
  const response = await call(adminState, { query: { date }, cookie });
  expectStatus(response, 200, `admin state ${date}`);
  states.push(response.body);
}

const targetDate = dates.at(-1);
const candidate = [6, 5, 4, 3, 2, 1].find((machineId) => (
  states.every((state) => !state.longTermMaintenance.includes(machineId)
    && !state.bookings.some((booking) => booking.machineId === machineId))
  && SLOT_IDS.every((slotId) => states.at(-1).slots[slotId].open
    && !states.at(-1).slots[slotId].maintenance.includes(machineId))
));
assert.ok(candidate, "No free machine is available for a safe regression test");

let groupId = "";
let maintenanceEnabled = false;
let longTermEnabled = false;
try {
  const created = await call(createBooking, {
    method: "POST",
    body: {
      date: targetDate,
      slotIds: ["morning", "afternoon"],
      machineId: candidate,
      student: TEST_STUDENT,
      grade: "其他",
      phone: TEST_PHONE,
    },
  });
  expectStatus(created, 201, "multi-slot booking");
  assert.deepEqual(created.body.slotIds, ["morning", "afternoon"]);

  const bookedState = await call(adminState, { query: { date: targetDate }, cookie });
  expectStatus(bookedState, 200, "state after booking");
  const testBookings = bookedState.body.bookings.filter((booking) => booking.student === TEST_STUDENT && booking.phone === TEST_PHONE);
  assert.equal(testBookings.length, 2, "Both requested slots must be created");
  assert.equal(new Set(testBookings.map((booking) => booking.groupId)).size, 1, "Multi-slot booking must share one group");
  groupId = testBookings[0].groupId;

  const cancelled = await call(adminAction, { method: "POST", cookie, body: { action: "cancelBooking", bookingGroupId: groupId } });
  expectStatus(cancelled, 200, "group cancellation");
  assert.equal(cancelled.body.cancelled, 2, "Cancelling a group must release both slots");
  groupId = "";

  const maintained = await call(adminAction, {
    method: "POST",
    cookie,
    body: { action: "setMaintenance", date: targetDate, slotIds: SLOT_IDS, machineId: candidate, enabled: true },
  });
  expectStatus(maintained, 200, "all-day maintenance");
  maintenanceEnabled = true;
  const maintainedAvailability = await call(availability, { query: { date: targetDate } });
  expectStatus(maintainedAvailability, 200, "availability after all-day maintenance");
  assert.ok(SLOT_IDS.every((slotId) => maintainedAvailability.body.slots[slotId].maintenance.includes(candidate)), "All slots must be maintained");

  const restored = await call(adminAction, {
    method: "POST",
    cookie,
    body: { action: "setMaintenance", date: targetDate, slotIds: SLOT_IDS, machineId: candidate, enabled: false },
  });
  expectStatus(restored, 200, "restore all-day maintenance");
  maintenanceEnabled = false;

  const longTerm = await call(adminAction, {
    method: "POST",
    cookie,
    body: { action: "setLongTermMaintenance", machineId: candidate, enabled: true },
  });
  expectStatus(longTerm, 200, "long-term maintenance");
  longTermEnabled = true;
  const longAvailability = await call(availability, { query: { date: targetDate } });
  expectStatus(longAvailability, 200, "availability after long-term maintenance");
  assert.ok(longAvailability.body.longTermMaintenance.includes(candidate), "Long-term maintenance must be returned to clients");

  const endLongTerm = await call(adminAction, {
    method: "POST",
    cookie,
    body: { action: "setLongTermMaintenance", machineId: candidate, enabled: false },
  });
  expectStatus(endLongTerm, 200, "end long-term maintenance");
  longTermEnabled = false;

  console.log(JSON.stringify({ ok: true, targetDate, machineId: candidate, checks: ["multi-slot", "group-cancel", "all-day-maintenance", "long-term-maintenance"] }));
} finally {
  if (groupId) await call(adminAction, { method: "POST", cookie, body: { action: "cancelBooking", bookingGroupId: groupId } });
  if (maintenanceEnabled) await call(adminAction, { method: "POST", cookie, body: { action: "setMaintenance", date: targetDate, slotIds: SLOT_IDS, machineId: candidate, enabled: false } });
  if (longTermEnabled) await call(adminAction, { method: "POST", cookie, body: { action: "setLongTermMaintenance", machineId: candidate, enabled: false } });
  await ensureSchema();
  await db()`DELETE FROM bookings WHERE student_name = ${TEST_STUDENT} AND parent_phone = ${TEST_PHONE}`;
}
