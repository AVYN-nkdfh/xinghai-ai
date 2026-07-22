import { requireAdmin } from "../_lib/auth.js";
import { db, ensureSchema } from "../_lib/db.js";
import { allowMethods, assertSameOrigin, bodyOf, handleError, json } from "../_lib/http.js";
import { badRequest, validateDate, validateMachine, validateSlot } from "../_lib/validation.js";

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["POST"])) return;
  try {
    assertSameOrigin(req);
    requireAdmin(req);
    const body = bodyOf(req);
    await ensureSchema();
    const sql = db();

    if (body.action === "setSlotOpen") {
      const date = validateDate(body.date);
      const slotId = validateSlot(body.slotId);
      const open = Boolean(body.open);
      await sql.transaction([
        sql`INSERT INTO booking_slots (booking_date, slot_id, is_open, updated_at)
            VALUES (${date}, ${slotId}, ${open}, now())
            ON CONFLICT (booking_date, slot_id) DO UPDATE SET is_open = EXCLUDED.is_open, updated_at = now()`,
        sql`INSERT INTO booking_audit (action, details) VALUES ('set_slot_open', ${JSON.stringify({ date, slotId, open })}::jsonb)`,
      ]);
      return json(res, 200, { ok: true });
    }

    if (body.action === "setMaintenance") {
      const date = validateDate(body.date);
      const slotId = validateSlot(body.slotId);
      const machineId = validateMachine(body.machineId);
      const enabled = Boolean(body.enabled);
      if (enabled) {
        const inserted = await sql`INSERT INTO booking_maintenance (booking_date, slot_id, machine_id)
          SELECT ${date}, ${slotId}, ${machineId}
          WHERE NOT EXISTS (
            SELECT 1 FROM bookings WHERE booking_date = ${date} AND slot_id = ${slotId} AND machine_id = ${machineId} AND status = 'active'
          )
          ON CONFLICT DO NOTHING RETURNING machine_id`;
        if (!inserted.length) {
          const already = await sql`SELECT 1 FROM booking_maintenance WHERE booking_date = ${date} AND slot_id = ${slotId} AND machine_id = ${machineId}`;
          if (!already.length) throw badRequest("这台机器已有预约，不能设为维护", 409);
        }
      } else {
        await sql`DELETE FROM booking_maintenance WHERE booking_date = ${date} AND slot_id = ${slotId} AND machine_id = ${machineId}`;
      }
      await sql`INSERT INTO booking_audit (action, details) VALUES ('set_maintenance', ${JSON.stringify({ date, slotId, machineId, enabled })}::jsonb)`;
      return json(res, 200, { ok: true });
    }

    if (body.action === "cancelBooking") {
      const bookingId = String(body.bookingId || "");
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(bookingId)) throw badRequest("预约编号不正确");
      const updated = await sql`UPDATE bookings SET status = 'cancelled', cancelled_at = now() WHERE id = ${bookingId}::uuid AND status = 'active' RETURNING id`;
      if (!updated.length) throw badRequest("预约不存在或已经取消", 404);
      await sql`INSERT INTO booking_audit (action, details) VALUES ('cancel_booking', ${JSON.stringify({ bookingId })}::jsonb)`;
      return json(res, 200, { ok: true });
    }

    throw badRequest("操作类型不正确");
  } catch (error) {
    handleError(res, error);
  }
}
