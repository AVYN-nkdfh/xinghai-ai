import { randomBytes, randomUUID } from "node:crypto";
import { db, ensureSchema } from "../_lib/db.js";
import { allowMethods, assertSameOrigin, bodyOf, handleError, json } from "../_lib/http.js";
import { badRequest, validateDate, validateMachine, validatePhone, validateSlots, validateText } from "../_lib/validation.js";

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["POST"])) return;
  try {
    assertSameOrigin(req);
    const body = bodyOf(req);
    const date = validateDate(body.date);
    const slotIds = validateSlots(body.slotIds || body.slotId);
    const machineId = validateMachine(body.machineId);
    const student = validateText(body.student, "学生姓名");
    const grade = validateText(body.grade, "年级");
    const phone = validatePhone(body.phone);
    const groupId = randomUUID();
    const slotToken = slotIds.map((slotId) => slotId[0].toUpperCase()).join("");
    const bookingCode = `XH-${date.replaceAll("-", "").slice(2)}-${slotToken}${machineId}-${randomBytes(3).toString("hex").toUpperCase()}`;
    const requested = slotIds.map((slotId) => ({
      id: randomUUID(),
      booking_code: slotIds.length === 1 ? bookingCode : `${bookingCode}-${slotId[0].toUpperCase()}`,
      slot_id: slotId,
    }));

    await ensureSchema();
    const sql = db();
    const [, inserted] = await sql.transaction([
      sql`SELECT
        pg_advisory_xact_lock(hashtext(${"booking-machine:" + machineId})),
        pg_advisory_xact_lock(hashtext(${"booking-day:" + date + ":" + machineId}))`,
      sql`WITH requested AS (
        SELECT id::uuid, booking_code, slot_id
        FROM jsonb_to_recordset(${JSON.stringify(requested)}::jsonb)
          AS row(id text, booking_code text, slot_id text)
      ), blocked AS (
        SELECT requested.slot_id
        FROM requested
        WHERE COALESCE((
          SELECT is_open FROM booking_slots
          WHERE booking_date = ${date} AND slot_id = requested.slot_id
        ), true) = false
          OR EXISTS (
            SELECT 1 FROM booking_maintenance
            WHERE booking_date = ${date} AND slot_id = requested.slot_id AND machine_id = ${machineId}
          )
          OR EXISTS (
            SELECT 1 FROM booking_machine_maintenance WHERE machine_id = ${machineId}
          )
          OR EXISTS (
            SELECT 1 FROM bookings
            WHERE booking_date = ${date} AND slot_id = requested.slot_id AND machine_id = ${machineId} AND status = 'active'
          )
      )
      INSERT INTO bookings (
        id, booking_code, booking_group_id, booking_group_code, booking_date, slot_id,
        machine_id, student_name, grade, parent_phone
      )
      SELECT requested.id, requested.booking_code, ${groupId}::uuid, ${bookingCode}, ${date}, requested.slot_id,
        ${machineId}, ${student}, ${grade}, ${phone}
      FROM requested
      WHERE NOT EXISTS (SELECT 1 FROM blocked)
      ON CONFLICT (booking_date, slot_id, machine_id) WHERE status = 'active' DO NOTHING
      RETURNING slot_id`,
    ], { isolationMode: "Serializable" });

    if (inserted.length !== slotIds.length) throw badRequest("所选时段中有机位刚被预约或暂不可用，请重新选择", 409);
    json(res, 201, { bookingCode, slotIds });
  } catch (error) {
    handleError(res, error);
  }
}
