import { requireAdmin } from "../_lib/auth.js";
import { db, ensureSchema } from "../_lib/db.js";
import { allowMethods, assertSameOrigin, bodyOf, handleError, json } from "../_lib/http.js";
import { badRequest, validateDate, validateMachine, validateSlot, validateSlots } from "../_lib/validation.js";

function validateUuid(value, label = "预约编号") {
  const id = String(value || "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw badRequest(`${label}不正确`);
  }
  return id;
}

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
      const slotIds = validateSlots(body.slotIds || body.slotId);
      const machineId = validateMachine(body.machineId);
      const enabled = Boolean(body.enabled);
      if (enabled) {
        const requested = slotIds.map((slotId) => ({ slot_id: slotId }));
        const [, , result] = await sql.transaction([
          sql`SELECT pg_advisory_xact_lock(hashtext(${"booking-machine:" + machineId}))`,
          sql`SELECT pg_advisory_xact_lock(hashtext(${"booking-day:" + date + ":" + machineId}))`,
          sql`WITH requested AS (
              SELECT slot_id
              FROM jsonb_to_recordset(${JSON.stringify(requested)}::jsonb) AS row(slot_id text)
            ), conflicts AS (
              SELECT requested.slot_id
              FROM requested
              WHERE EXISTS (
                SELECT 1 FROM bookings
                WHERE booking_date = ${date}
                  AND slot_id = requested.slot_id
                  AND machine_id = ${machineId}
                  AND status = 'active'
              )
            ), inserted AS (
              INSERT INTO booking_maintenance (booking_date, slot_id, machine_id)
              SELECT ${date}, requested.slot_id, ${machineId}
              FROM requested
              WHERE NOT EXISTS (SELECT 1 FROM conflicts)
              ON CONFLICT DO NOTHING
              RETURNING slot_id
            )
            SELECT
              (SELECT count(*)::int FROM conflicts) AS conflict_count,
              (SELECT count(*)::int FROM inserted) AS inserted_count`,
        ], { isolationMode: "Serializable" });
        if (result[0]?.conflict_count > 0) throw badRequest("所选时段已有预约，不能设为维护", 409);
      } else {
        await sql.transaction([
          sql`SELECT pg_advisory_xact_lock(hashtext(${"booking-machine:" + machineId}))`,
          sql`SELECT pg_advisory_xact_lock(hashtext(${"booking-day:" + date + ":" + machineId}))`,
          sql`DELETE FROM booking_maintenance
              WHERE booking_date = ${date} AND slot_id = ANY(${slotIds}::text[]) AND machine_id = ${machineId}`,
        ], { isolationMode: "Serializable" });
      }
      await sql`INSERT INTO booking_audit (action, details) VALUES ('set_maintenance', ${JSON.stringify({ date, slotIds, machineId, enabled })}::jsonb)`;
      return json(res, 200, { ok: true });
    }

    if (body.action === "setLongTermMaintenance") {
      const machineId = validateMachine(body.machineId);
      const enabled = Boolean(body.enabled);
      if (enabled) {
        const [, result] = await sql.transaction([
          sql`SELECT pg_advisory_xact_lock(hashtext(${"booking-machine:" + machineId}))`,
          sql`WITH conflicts AS (
              SELECT id FROM bookings
              WHERE machine_id = ${machineId}
                AND status = 'active'
                AND booking_date >= (now() AT TIME ZONE 'Asia/Shanghai')::date
            ), upserted AS (
              INSERT INTO booking_machine_maintenance (machine_id, updated_at)
              SELECT ${machineId}, now()
              WHERE NOT EXISTS (SELECT 1 FROM conflicts)
              ON CONFLICT (machine_id) DO UPDATE SET updated_at = now()
              RETURNING machine_id
            )
            SELECT
              (SELECT count(*)::int FROM conflicts) AS conflict_count,
              (SELECT count(*)::int FROM upserted) AS updated_count`,
        ], { isolationMode: "Serializable" });
        if (result[0]?.conflict_count > 0) {
          throw badRequest("这台机器还有未来预约，请先取消或调整预约", 409);
        }
      } else {
        await sql.transaction([
          sql`SELECT pg_advisory_xact_lock(hashtext(${"booking-machine:" + machineId}))`,
          sql`DELETE FROM booking_machine_maintenance WHERE machine_id = ${machineId}`,
        ], { isolationMode: "Serializable" });
      }
      await sql`INSERT INTO booking_audit (action, details) VALUES ('set_long_term_maintenance', ${JSON.stringify({ machineId, enabled })}::jsonb)`;
      return json(res, 200, { ok: true });
    }

    if (body.action === "cancelBooking") {
      const bookingGroupId = validateUuid(body.bookingGroupId || body.bookingId);
      const updated = await sql`UPDATE bookings
        SET status = 'cancelled', cancelled_at = now()
        WHERE COALESCE(booking_group_id, id) = ${bookingGroupId}::uuid AND status = 'active'
        RETURNING id`;
      if (!updated.length) throw badRequest("预约不存在或已经取消", 404);
      await sql`INSERT INTO booking_audit (action, details) VALUES ('cancel_booking_group', ${JSON.stringify({ bookingGroupId, count: updated.length })}::jsonb)`;
      return json(res, 200, { ok: true, cancelled: updated.length });
    }

    throw badRequest("操作类型不正确");
  } catch (error) {
    handleError(res, error);
  }
}
