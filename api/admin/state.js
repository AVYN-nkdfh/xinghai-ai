import { requireAdmin } from "../_lib/auth.js";
import { readDay } from "../_lib/db.js";
import { allowMethods, handleError, json } from "../_lib/http.js";
import { SLOT_IDS, validateDate } from "../_lib/validation.js";

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["GET"])) return;
  try {
    requireAdmin(req);
    const date = validateDate(req.query.date);
    const { slotRows, maintenanceRows, longMaintenanceRows, bookingRows } = await readDay(date, true);
    const slots = Object.fromEntries(SLOT_IDS.map((slotId) => [slotId, { open: true, maintenance: [] }]));
    slotRows.forEach((row) => { slots[row.slot_id].open = row.is_open; });
    maintenanceRows.forEach((row) => { slots[row.slot_id].maintenance.push(row.machine_id); });
    const bookings = bookingRows.map((row) => ({
      id: row.id,
      groupId: row.booking_group_id || row.id,
      code: row.booking_group_code || row.booking_code,
      slotId: row.slot_id,
      machineId: row.machine_id,
      student: row.student_name,
      grade: row.grade,
      phone: row.parent_phone,
      createdAt: row.created_at,
    }));
    json(res, 200, {
      date,
      slots,
      bookings,
      longTermMaintenance: longMaintenanceRows.map((row) => row.machine_id),
    });
  } catch (error) {
    handleError(res, error);
  }
}
