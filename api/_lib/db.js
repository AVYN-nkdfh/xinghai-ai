import { neon } from "@neondatabase/serverless";

let sqlClient;
let schemaPromise;

export function db() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  if (!sqlClient) sqlClient = neon(process.env.DATABASE_URL);
  return sqlClient;
}

export async function ensureSchema() {
  if (schemaPromise) return schemaPromise;
  const sql = db();
  schemaPromise = (async () => {
    await sql.transaction([
      sql`CREATE TABLE IF NOT EXISTS booking_slots (
        booking_date date NOT NULL,
        slot_id text NOT NULL CHECK (slot_id IN ('morning', 'afternoon', 'evening')),
        is_open boolean NOT NULL DEFAULT true,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (booking_date, slot_id)
      )`,
      sql`CREATE TABLE IF NOT EXISTS booking_maintenance (
        booking_date date NOT NULL,
        slot_id text NOT NULL CHECK (slot_id IN ('morning', 'afternoon', 'evening')),
        machine_id smallint NOT NULL CHECK (machine_id BETWEEN 1 AND 6),
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (booking_date, slot_id, machine_id)
      )`,
      sql`CREATE TABLE IF NOT EXISTS booking_machine_maintenance (
        machine_id smallint PRIMARY KEY CHECK (machine_id BETWEEN 1 AND 6),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`,
      sql`CREATE TABLE IF NOT EXISTS bookings (
        id uuid PRIMARY KEY,
        booking_code text NOT NULL UNIQUE,
        booking_date date NOT NULL,
        slot_id text NOT NULL CHECK (slot_id IN ('morning', 'afternoon', 'evening')),
        machine_id smallint NOT NULL CHECK (machine_id BETWEEN 1 AND 6),
        student_name text NOT NULL,
        grade text NOT NULL,
        parent_phone text NOT NULL,
        status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
        created_at timestamptz NOT NULL DEFAULT now(),
        cancelled_at timestamptz
      )`,
      sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_group_id uuid`,
      sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_group_code text`,
      sql`CREATE UNIQUE INDEX IF NOT EXISTS bookings_active_machine_unique
        ON bookings (booking_date, slot_id, machine_id) WHERE status = 'active'`,
      sql`CREATE INDEX IF NOT EXISTS bookings_date_slot_index ON bookings (booking_date, slot_id)`,
      sql`CREATE INDEX IF NOT EXISTS bookings_group_index ON bookings (booking_group_id)`,
      sql`CREATE TABLE IF NOT EXISTS booking_audit (
        id bigserial PRIMARY KEY,
        action text NOT NULL,
        details jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
    ], { isolationMode: "Serializable" });
  })().catch((error) => {
    schemaPromise = null;
    throw error;
  });
  return schemaPromise;
}

export async function readDay(date, includeDetails = false) {
  await ensureSchema();
  const sql = db();
  const [slotRows, maintenanceRows, longMaintenanceRows, bookingRows] = await sql.transaction([
    sql`SELECT slot_id, is_open FROM booking_slots WHERE booking_date = ${date}`,
    sql`SELECT slot_id, machine_id FROM booking_maintenance WHERE booking_date = ${date}`,
    sql`SELECT machine_id FROM booking_machine_maintenance ORDER BY machine_id`,
    includeDetails
      ? sql`SELECT id, booking_code, booking_group_id, booking_group_code, slot_id, machine_id, student_name, grade, parent_phone, created_at
          FROM bookings WHERE booking_date = ${date} AND status = 'active' ORDER BY slot_id, machine_id`
      : sql`SELECT slot_id, machine_id FROM bookings WHERE booking_date = ${date} AND status = 'active'`,
  ], { isolationMode: "RepeatableRead", readOnly: true });
  return { slotRows, maintenanceRows, longMaintenanceRows, bookingRows };
}
