import assert from "node:assert/strict";
import {
  ADMIN_V2_COOKIE,
  DATA_SCOPES,
  PERMISSIONS,
  SYSTEM_ROLES,
  assertCanGrant,
  assertCanGrantDataScope,
  assertPermission,
  assertPermissionScopeCompatibility,
  cookieMap,
  createAdminSessionCookie,
  hashPassword,
  hashSessionToken,
  modulesForPermissions,
  normalizeEmail,
  passwordMatches,
  resolveEffectivePermissions,
  validateDataScope,
  validatePassword,
} from "../api/_lib/admin-rbac.js";

function throwsStatus(fn, status) {
  assert.throws(fn, (error) => error?.status === status);
}

assert.equal(normalizeEmail("  Admin@Example.COM "), "admin@example.com");
throwsStatus(() => normalizeEmail("not-an-email"), 400);
assert.equal(validatePassword("a-long-password"), "a-long-password");
throwsStatus(() => validatePassword("too-short"), 400);
for (const scope of DATA_SCOPES) assert.equal(validateDataScope(scope), scope);
throwsStatus(() => validateDataScope("global"), 400);

const encodedPassword = await hashPassword("correct horse battery staple");
assert.match(encodedPassword, /^scrypt\$/);
assert.equal(await passwordMatches("correct horse battery staple", encodedPassword), true);
assert.equal(await passwordMatches("wrong password", encodedPassword), false);
assert.equal(await passwordMatches("anything", "not-a-password-hash"), false);

const permissionKeys = new Set(PERMISSIONS.map((permission) => permission.key));
assert.equal(permissionKeys.size, PERMISSIONS.length);
for (const role of SYSTEM_ROLES) {
  assert.ok(role.permissions.length > 0);
  assert.equal(role.permissions.every((permission) => permissionKeys.has(permission)), true);
}
assert.equal(SYSTEM_ROLES.find((role) => role.key === "super_admin").permissions.length, PERMISSIONS.length);

const effective = resolveEffectivePermissions(
  ["students.view", "content.view"],
  [
    { permissionKey: "content.view", allowed: false },
    { permissionKey: "booking.view", allowed: true },
    { permissionKey: "devices.view", allowed: true, expiresAt: "2020-01-01T00:00:00.000Z" },
  ],
  new Date("2026-08-11T00:00:00.000Z"),
);
assert.deepEqual(effective, ["booking.view", "students.view"]);
assert.deepEqual(modulesForPermissions(effective), ["students", "booking"]);

const actorSession = {
  user: {
    role: { rank: 70 },
    dataScope: "campus",
    campusId: "campus-shanghai",
    dataScopeRef: null,
  },
  permissions: ["students.view", "classes.view"],
};
assert.doesNotThrow(() => assertCanGrant(actorSession, ["students.view"]));
throwsStatus(() => assertCanGrant(actorSession, ["admin.users.manage"]), 403);
assert.equal(assertCanGrantDataScope(actorSession, "team", "campus-shanghai", "team-a"), "team");
throwsStatus(() => assertCanGrantDataScope(actorSession, "organization"), 403);
throwsStatus(() => assertCanGrantDataScope(actorSession, "campus", "campus-beijing"), 403);
throwsStatus(() => assertCanGrantDataScope(actorSession, "team", "campus-shanghai", null), 400);
assert.equal(assertPermissionScopeCompatibility(["students.view"], "campus"), "campus");
throwsStatus(() => assertPermissionScopeCompatibility(["admin.users.view"], "campus"), 400);
throwsStatus(() => assertPermission({ user: { dataScope: "campus" }, permissions: ["admin.users.view"] }, "admin.users.view"), 403);

const tokenHash = hashSessionToken("fixed-token");
assert.equal(tokenHash, hashSessionToken("fixed-token"));
assert.notEqual(tokenHash, hashSessionToken("other-token"));
assert.deepEqual(cookieMap({ headers: { cookie: "first=one; second=two" } }), { first: "one", second: "two" });
assert.match(createAdminSessionCookie("token", { headers: { host: "127.0.0.1:3000" } }), new RegExp(`^${ADMIN_V2_COOKIE}=token;`));
assert.doesNotMatch(createAdminSessionCookie("token", { headers: { host: "127.0.0.1:3000" } }), /; Secure/);
assert.match(createAdminSessionCookie("token", { headers: { host: "admin.example.com", "x-forwarded-proto": "https" } }), /; Secure/);

console.log("admin RBAC unit tests passed");
