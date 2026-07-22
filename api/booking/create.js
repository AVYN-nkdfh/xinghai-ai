import { randomBytes, randomUUID } from "node:crypto";
import { db, ensureSchema } from "../_lib/db.js";
import { allowMethods, assertSameOrigin, bodyOf, handleError, json } from "../_lib/http.js";
import { badRequest, validateDate, validateMachine, validatePhone, validateSlot, validateText } from "../_lib/validation.js";

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["POST"])) return;
  try {
    assertSameOrigin(req);
    const body = bodyOf(req);
    const date = validateDate(body.date);
    const slotId = validateSlot(body.slotId);
    const machineId = validateMachine(body.machineId);
    const student = validateText(body.student, "学生姓名");
    const grade = validateText(body.grade, "年级");
    const phone = validatePhone(body.phone);
    const bookingCode = `XH-${date.replaceAll("-", "").slice(2)}-${slotId[0].toUpperCase()}${machineId}-${randomBytes(3).toString("hex").toUpperCase()}`;

    await ensureSchema();
    const sql = db();
    const inserted = await sql`WITH allowed AS (
      SELECT 1
      WHERE COALESCE((SELECT is_open FROM booking_slots WHERE booking_date = ${date} AND slot_id = ${slotId}), true)
        AND NOT EXISTS (
          SELECT 1 FROM booking_maintenance
          WHERE booking_date = ${date} AND slot_id = ${slotId} AND machine_id = ${machineId}
        )
    )
    INSERT INTO bookings (id, booking_code, booking_date, slot_id, machine_id, student_name, grade, parent_phone)
    SELECT ${randomUUID()}::uuid, ${bookingCode}, ${date}, ${slotId}, ${machineId}, ${student}, ${grade}, ${phone}
    FROM allowed
    ON CONFLICT (booking_date, slot_id, machine_id) WHERE status = 'active' DO NOTHING
    RETURNING booking_code`;

    if (!inserted.length) throw badRequest("这台机器刚刚被预约或暂不可用，请重新选择", 409);
    json(res, 201, { bookingCode: inserted[0].booking_code });
  } catch (error) {
    handleError(res, error);
  }
}
