# Vercel Functions 14 -> 12 change log

- Date: 2026-08-24 (Asia/Shanghai)
- Scope: `xinghai-booking-production`
- Goal: fit the Vercel Hobby limit without deleting rollback source or changing the public-site design.
- Deployment status: not deployed; no production domain or alias was changed in this operation.

## Decision

Keep all handler source files, but exclude these two legacy public read handlers from the Vercel upload:

- `api/content/hero.js`
- `api/content/works.js`

This changes the deployable direct `api/**/*.js` function count from 14 to exactly 12. The five existing `api/admin-v2/**` files were already excluded and therefore could not reduce the 14-function count further.

## Evidence and risk boundary

- The new public `index.html`, `works.html`, `learning.html`, `create.html`, and `privacy.html` do not call `/api/content/hero` or `/api/content/works`.
- The new works center ships its current seven work records as static page content.
- `/content-admin` uses `api/content/admin.js`, `api/content/works-admin.js`, and `api/content/upload.js`; it does not call the two excluded public read handlers.
- The legacy `works/works.js` does call `/api/content/works`, but that script is not part of the new public build and has static fallback data if the request fails.
- The available Vercel Hobby runtime-log window was only one hour. It contained one ambiguous successful GET to each candidate. Those requests could not be attributed to a real user, browser refresh, or automated check, so the logs are not proof of long-term disuse.
- Therefore `api/content/works.js` must be excluded only as part of the new static-site cutover. A cached legacy page or an unknown external caller can receive 404 after that cutover.

## Files changed

- `.vercelignore`
  - added exact exclusions for the two legacy read handlers;
  - source files remain present for rollback.
- `scripts/check-function-budget.mjs`
  - inventories direct JavaScript handlers under `api/` while excluding `_lib` directories;
  - requires all intended ignore rules;
  - requires all seven excluded rollback sources to remain present;
  - fails on an unexpected or missing active handler;
  - fails unless the active count is exactly 12.
- `scripts/finalize-protected-build.mjs`
  - uses the shared budget assertion instead of a hard-coded 14-handler source list;
  - verifies all 12 active handler sources and reports the deployable count.
- `package.json`
  - added `check:function-budget`;
  - added that check to `check:integration` before the full build.

## Expected deployable functions (12)

1. `api/admin/action.js`
2. `api/admin/login.js`
3. `api/admin/logout.js`
4. `api/admin/state.js`
5. `api/aesthetic.js`
6. `api/booking/availability.js`
7. `api/booking/create.js`
8. `api/content/admin.js`
9. `api/content/upload.js`
10. `api/content/works-admin.js`
11. `api/leads/create.js`
12. `api/leads/retention.js`

## Retained source excluded from deployment (7)

1. `api/admin-v2/audit.js`
2. `api/admin-v2/bootstrap.js`
3. `api/admin-v2/roles.js`
4. `api/admin-v2/session.js`
5. `api/admin-v2/users.js`
6. `api/content/hero.js`
7. `api/content/works.js`

## Verification record

- `node --check scripts/check-function-budget.mjs`: passed.
- `node --check scripts/finalize-protected-build.mjs`: passed.
- `npm run check:function-budget`: passed; `12 active; 7 retained in source but excluded`.
- `npm run check:leads`: passed; 26 passed, 0 failed.
- `npm run test:admin`: passed; admin RBAC and unified admin frontend/API contract tests passed.
- `npm run test:launch-gate`: passed; production launch-gate tests passed.
- `npm run build`: passed with exit code 0.
  - public build: 509 files, 108.50 MiB;
  - runtime dependencies copied: 506;
  - release files rendered: 3;
  - media validation: 3 MP4 files, 13.98 MiB;
  - protected-route finalization: `/admin` and `/content-admin` preserved;
  - final release manifest: 515 public files;
  - finalizer-confirmed deployable Functions: 12.

The full build took about 50 minutes because the local data volume had about 1.7 GiB free and many legacy source assets were iCloud dataless placeholders. The build continued making file-level progress, completed normally, and was not killed or bypassed. This is an environment/performance observation, not a function-budget failure.

Passing these checks proves the source inventory, contracts tested above, and local build result recorded here. It does not prove a production deployment or real business traffic behavior.

## Rollback

1. Remove `api/content/hero.js` and `api/content/works.js` from `.vercelignore`.
2. Restore both paths to the expected active-function set, or revert the budget-check/finalizer changes together.
3. Re-run `npm run check:function-budget` with the restored expected count and then run `npm run build`.
4. On a non-production preview, verify both legacy routes and the resulting 14-function inventory before any production promotion.

## Separate launch gates

This change only resolves the function-count limit. Turnstile production configuration, lead-retention readback, child-media authorization, and final production acceptance remain separate launch evidence and must not be inferred from this log.

## Remote-build correction and Preview proof

The first real Vercel build exposed a contradiction that local checks could not show: `.vercelignore` correctly removed all seven retained rollback handlers from the upload, but `assertFunctionBudget()` still required those ignored files to exist inside the remote build directory. The Preview therefore failed before deployment.

`scripts/check-function-budget.mjs` now keeps the stronger local rule while handling the upload boundary explicitly:

- locally, all seven rollback sources remain mandatory;
- on Vercel (`VERCEL=1`), all seven may be absent together because the exact ignore rules removed them;
- a partial absence still fails;
- the active-function inventory must still match the exact 12 paths.

Fresh remote proof:

- `dpl_FQiXuhmPXcSDYnhWSxJ1rEcFFxFV` built without per-deployment environment overrides;
- status `READY`;
- 12 functions deployed, with lead functions in `sin1`;
- final protected build reported 515 public files, 7 authorized works, and 3 authorized media assets.

This proves the 12-function packaging works on Vercel Preview. It is not a Production promotion.
