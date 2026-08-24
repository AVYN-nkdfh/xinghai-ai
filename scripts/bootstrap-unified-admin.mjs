import { ensureAdminSchema } from "../api/_lib/admin-schema.js";
import { createAdminUser, listAdminUsers } from "../api/_lib/admin-store.js";

const email = process.env.UNIFIED_ADMIN_BOOTSTRAP_EMAIL;
const password = process.env.UNIFIED_ADMIN_BOOTSTRAP_PASSWORD;
const displayName = process.env.UNIFIED_ADMIN_BOOTSTRAP_NAME;

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
if (!email || !password || !displayName) {
  throw new Error("UNIFIED_ADMIN_BOOTSTRAP_EMAIL, UNIFIED_ADMIN_BOOTSTRAP_PASSWORD and UNIFIED_ADMIN_BOOTSTRAP_NAME are required");
}

await ensureAdminSchema();
const existingUsers = await listAdminUsers();
if (existingUsers.length) {
  throw new Error("统一后台已经有账号；为避免覆盖权限，初始化脚本已停止");
}

const user = await createAdminUser({
  email,
  displayName,
  password,
  roleKey: "super_admin",
  dataScope: "organization",
});

console.log(`统一后台超级管理员已创建：${user.email} (${user.id})`);
