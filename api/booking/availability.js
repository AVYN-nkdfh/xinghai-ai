import { readDay } from "../_lib/db.js";
import { allowMethods, handleError, json } from "../_lib/http.js";
import { SLOT_IDS, validateDate } from "../_lib/validation.js";

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["GET"])) return;
  try {
    const date = validateDate(req.query.date);
    const { slotRows, maintenanceRows, bookingRows } = await readDay(date, false);
    const slots = Object.fromEntries(SLOT_IDS.map((slotId) => [slotId, { open: true, maintenance: [], booked: [] }]));
    slotRows.forEach((row) => { slots[row.slot_id].open = row.is_open; });
    maintenanceRows.forEach((row) => { slots[row.slot_id].maintenance.push(row.machine_id); });
    bookingRows.forEach((row) => { slots[row.slot_id].booked.push(row.machine_id); });
    json(res, 200, { date, slots });
  } catch (error) {
    handleError(res, error);
  }
}
