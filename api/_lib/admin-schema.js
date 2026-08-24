import { db } from "./db.js";
import { PERMISSIONS, SYSTEM_ROLES } from "./admin-rbac.js";

let adminSchemaPromise;

export async function ensureAdminSchema() {
  if (adminSchemaPromise) return adminSchemaPromise;
  const sql = db();
  adminSchemaPromise = (async () => {
    await sql.transaction([
      sql`CREATE TABLE IF NOT EXISTS admin_roles (
        id uuid PRIMARY KEY,
        role_key text NOT NULL UNIQUE,
        name text NOT NULL,
        description text NOT NULL DEFAULT '',
        rank smallint NOT NULL DEFAULT 10 CHECK (rank BETWEEN 0 AND 100),
        default_data_scope text NOT NULL DEFAULT 'own' CHECK (default_data_scope IN ('organization', 'campus', 'team', 'own')),
        is_system boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`,
      sql`ALTER TABLE admin_roles ADD COLUMN IF NOT EXISTS default_data_scope text NOT NULL DEFAULT 'own'`,
      sql`CREATE TABLE IF NOT EXISTS admin_permissions (
        permission_key text PRIMARY KEY,
        module_key text NOT NULL,
        action_key text NOT NULL,
        label text NOT NULL,
        is_sensitive boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
      sql`CREATE TABLE IF NOT EXISTS admin_role_permissions (
        role_id uuid NOT NULL REFERENCES admin_roles(id) ON DELETE CASCADE,
        permission_key text NOT NULL REFERENCES admin_permissions(permission_key) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (role_id, permission_key)
      )`,
      sql`CREATE TABLE IF NOT EXISTS admin_users (
        id uuid PRIMARY KEY,
        email text NOT NULL,
        display_name text NOT NULL,
        password_hash text NOT NULL,
        role_id uuid NOT NULL REFERENCES admin_roles(id),
        data_scope text NOT NULL DEFAULT 'own' CHECK (data_scope IN ('organization', 'campus', 'team', 'own')),
        data_scope_ref text,
        campus_id text,
        status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
        password_changed_at timestamptz NOT NULL DEFAULT now(),
        last_login_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`,
      sql`CREATE UNIQUE INDEX IF NOT EXISTS admin_users_email_unique ON admin_users (lower(email))`,
      sql`CREATE INDEX IF NOT EXISTS admin_users_role_status_index ON admin_users (role_id, status)`,
      sql`CREATE TABLE IF NOT EXISTS admin_user_permission_overrides (
        user_id uuid NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
        permission_key text NOT NULL REFERENCES admin_permissions(permission_key) ON DELETE CASCADE,
        allowed boolean NOT NULL,
        reason text,
        expires_at timestamptz,
        created_by uuid REFERENCES admin_users(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, permission_key)
      )`,
      sql`CREATE TABLE IF NOT EXISTS admin_sessions (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
        token_hash text NOT NULL UNIQUE,
        expires_at timestamptz NOT NULL,
        revoked_at timestamptz,
        last_seen_at timestamptz NOT NULL DEFAULT now(),
        ip_address text,
        user_agent text,
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
      sql`CREATE INDEX IF NOT EXISTS admin_sessions_user_expiry_index ON admin_sessions (user_id, expires_at DESC)`,
      sql`CREATE TABLE IF NOT EXISTS admin_audit_logs (
        id bigserial PRIMARY KEY,
        actor_user_id uuid REFERENCES admin_users(id),
        action text NOT NULL,
        module_key text NOT NULL,
        target_type text,
        target_id text,
        result text NOT NULL DEFAULT 'success' CHECK (result IN ('success', 'denied', 'failed')),
        details jsonb NOT NULL DEFAULT '{}'::jsonb,
        ip_address text,
        request_id text,
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
      sql`CREATE INDEX IF NOT EXISTS admin_audit_created_index ON admin_audit_logs (created_at DESC)`,
      sql`CREATE INDEX IF NOT EXISTS admin_audit_actor_index ON admin_audit_logs (actor_user_id, created_at DESC)`,
      sql`CREATE INDEX IF NOT EXISTS admin_audit_module_index ON admin_audit_logs (module_key, created_at DESC)`,
      sql`CREATE TABLE IF NOT EXISTS admin_login_attempts (
        attempt_key text PRIMARY KEY,
        failure_count integer NOT NULL DEFAULT 0,
        window_started_at timestamptz NOT NULL DEFAULT now(),
        blocked_until timestamptz,
        expires_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )`,
      sql`CREATE INDEX IF NOT EXISTS admin_login_attempts_expiry_index ON admin_login_attempts (expires_at)`,
    ], { isolationMode: "Serializable" });

    const roles = SYSTEM_ROLES.map((role) => ({
      id: role.id,
      role_key: role.key,
      name: role.name,
      description: role.description,
      rank: role.rank,
      default_data_scope: role.defaultScope,
    }));
    const permissions = PERMISSIONS.map((permission) => ({
      permission_key: permission.key,
      module_key: permission.module,
      action_key: permission.action,
      label: permission.label,
      is_sensitive: Boolean(permission.sensitive),
    }));
    await sql.transaction([
      sql`INSERT INTO admin_roles (id, role_key, name, description, rank, default_data_scope, is_system)
        SELECT id::uuid, role_key, name, description, rank, default_data_scope, true
        FROM jsonb_to_recordset(${JSON.stringify(roles)}::jsonb)
          AS item(id text, role_key text, name text, description text, rank smallint, default_data_scope text)
        ON CONFLICT (role_key) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          rank = EXCLUDED.rank,
          default_data_scope = EXCLUDED.default_data_scope,
          is_system = true,
          updated_at = now()`,
      sql`INSERT INTO admin_permissions (permission_key, module_key, action_key, label, is_sensitive)
        SELECT permission_key, module_key, action_key, label, is_sensitive
        FROM jsonb_to_recordset(${JSON.stringify(permissions)}::jsonb)
          AS item(permission_key text, module_key text, action_key text, label text, is_sensitive boolean)
        ON CONFLICT (permission_key) DO UPDATE SET
          module_key = EXCLUDED.module_key,
          action_key = EXCLUDED.action_key,
          label = EXCLUDED.label,
          is_sensitive = EXCLUDED.is_sensitive`,
    ]);

    const seededRoles = await sql`SELECT id, role_key FROM admin_roles WHERE is_system = true`;
    const roleIds = new Map(seededRoles.map((role) => [role.role_key, role.id]));
    const resolvedRolePermissions = SYSTEM_ROLES.flatMap((role) => role.permissions.map((permissionKey) => ({
      role_id: roleIds.get(role.key),
      permission_key: permissionKey,
    }))).filter((item) => item.role_id);
    await sql.transaction([
      sql`DELETE FROM admin_role_permissions WHERE role_id = ANY(${[...roleIds.values()]}::uuid[])`,
      sql`INSERT INTO admin_role_permissions (role_id, permission_key)
        SELECT role_id::uuid, permission_key
        FROM jsonb_to_recordset(${JSON.stringify(resolvedRolePermissions)}::jsonb)
          AS item(role_id text, permission_key text)
        ON CONFLICT DO NOTHING`,
    ]);
  })().catch((error) => {
    adminSchemaPromise = null;
    throw error;
  });
  return adminSchemaPromise;
}
