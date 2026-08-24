# Production launch preflight and navigation order log

- Date: 2026-08-24 (Asia/Shanghai)
- Project: `xinghai-booking-production`
- Vercel binding: `xinghai-deploy`
- Requested change: move the Works Center tab to the end of the primary navigation.
- Launch decision: **NO-GO**. No deployment, alias promotion, or production-domain change was performed.

## Navigation change completed

All primary desktop and mobile route navigation now uses this order:

1. Home (`/`)
2. AI Learning (`/learning`)
3. AI Creation (`/create`)
4. Works Center (`/works`)

Changed source entry files:

- `index.html`
- `learning.html`
- `create.html`
- `works.html`
- `privacy.html`

The matching product-link groups in the `index.html`, `learning.html`, and `create.html` footers were also reordered so Works Center is the last product link. Content CTAs and the homepage two-direction learning/creation interaction were not changed.

## Navigation verification

- Nine source navigation surfaces passed exact href-order checks.
- The same nine surfaces passed again in `dist/site-public` after the full build.
- The built preview served on port 8081 returned HTTP 200 with the expected page titles for `/`, `/learning`, `/create`, `/works`, and `/privacy`.
- Full local build passed:
  - 509 initial public files;
  - 506 runtime dependencies;
  - 3 rendered release files;
  - 3 validated MP4 files, 13.98 MiB;
  - `/admin` and `/content-admin` preserved;
  - 515 final manifest files, all paths unique;
  - 12 deployable Vercel Functions.
- Browser screenshot/interaction acceptance was not recorded because the browser URL safety policy rejected the localhost session. The source and built DOM order were verified programmatically; this must not be described as visual acceptance.

## Why production was not deployed

### 1. Production build is intentionally gated

The five public entry files still contain 13 unresolved `data-launch-required` markers across six evidence classes:

- `authorized-student-work-release`: 4
- `guardian-media-release`: 3
- `production-project-route-preservation`: 3
- `operator-contact-filing`: 1
- `production-lead-environment`: 1
- `production-lead-retention`: 1

`scripts/build-public.cjs` rejects a Production build while these markers remain. They cannot be removed merely to make deployment pass; each marker represents evidence that must exist and be read back first.

`npm run test:launch-gate` passed, but that test proves the fail-closed mechanism rejects an unresolved production release. It is not proof that the release gates are cleared.

### 2. Production environment is incomplete

A fresh masked-name-only Vercel Production environment read showed these required settings are absent:

- `TURNSTILE_SITE_KEY`
- `TURNSTILE_SECRET_KEY`
- `LEADS_RETENTION_DELETE_ENABLED`

The retention handler requires `LEADS_RETENTION_DELETE_ENABLED=true` explicitly in Production. The current local public build has no production Turnstile site key, so directly uploading the local `dist` would leave the parent phone form unable to complete its verification flow.

No secret values were printed or written to this log.

### 3. Required external evidence is still missing

- No traceable repository evidence was found for the child and guardian public-display authorization covering the seven works and three student media clips.
- The current tests are mock/unit tests; there is no recorded controlled chain of a desensitized lead being written to the restricted Feishu Base, read back, deleted, and then independently read back as absent.
- There is no recorded real retention dry-run/delete readback proving the 90-day job against the Production table.
- The operating entity/contact/filing disclosure marker is unresolved.
- The current worktree contains a large set of uncommitted and untracked integration changes, so there is not yet a clean, traceable release point.

### 4. Formal-domain readback still shows the old release

Fresh `https://tudu.school` readback before any deployment:

- `/`: 200, old homepage title, body SHA-256 prefix `c7bc4d597665877f`
- `/works`: 200, legacy works page
- `/learning`: 404
- `/create`: 404
- `/privacy`: 404
- `/api/leads/create`: 404
- `/api/leads/retention`: 404

The latest Vercel Production deployment was six days old and `READY`; it is not the local 2026-08-24 candidate.

## Passing technical checks

- Navigation order: 9/9 source surfaces and 9/9 built surfaces.
- `npm run check:function-budget`: 12 active, 7 retained in source but excluded.
- `npm run check:leads`: 26 passed, 0 failed.
- `npm run test:admin`: RBAC and unified admin contract tests passed.
- `npm run test:launch-gate`: fail-closed mechanism test passed.
- `npm run build`: passed; 515 final public files.

These checks prove the local technical surfaces listed above. They do not replace authorization, filing, Production secrets, Feishu readback, or formal-domain acceptance.

## Minimum path to a safe production release

1. Obtain and record the child/guardian media and work-display authorization evidence, plus operating-entity/contact/filing facts.
2. Add the three missing Production settings without exposing their values.
3. Create a controlled Preview and complete the desensitized lead write/read/delete readback and retention evidence.
4. Verify all seven legacy public work routes and record results.
5. Remove only the markers whose evidence is actually complete.
6. Create a traceable release point, run the Production build, deploy, wait for Vercel `READY`, and then verify the official-domain title/hash, core routes, assets, APIs, phone flow, and mobile/desktop navigation.

## Follow-up operator information

Later on 2026-08-24, the user supplied the legal entity name `杭州图度科技有限公司大连分公司`, the teaching address `辽宁省大连市沙河口区星海大观A座`, and explicitly confirmed that every current student asset has authorization from both the student and the guardian for public display. The privacy page was updated with the entity and teaching address. To reduce automated scraping, the page uses the website consultation entry as the information-rights request channel and does not expose a phone number or email address.

The confirmation was mapped to the seven current works and three current student media files in `release/publication-authorization-manifest.json`. The manifest contains no student or guardian identity or contact data. It records that the underlying personal authorization artifacts were not independently inspected or copied into the repository. A build-time check now fails if the works center or student media references drift from that manifest. The four work-authorization and three guardian-media markers were removed after this check passed.

The user also stated that there is currently no filing and considered it temporarily unnecessary. That statement was not published as a legal conclusion: current MIIT rules still require an applicability determination. The remaining operator marker is now limited to `operator-filing-applicability`.

Current unresolved launch markers after this follow-up: six total — three project-route preservation checks, one Production lead-environment check, one Production retention check, and one filing-applicability check.

## Consultation-consent UX follow-up

The homepage no longer keeps a second cross-border/third-party consent checkbox visible beside the contact form. The form now shows one ordinary privacy/contact checkbox. After the parent enters a valid phone number, checks that item, and selects `请老师联系我`, a compact independent confirmation dialog appears for the third-party hosting and security-verification services. `同意并继续` records the separate service consent and then loads Turnstile; cancelling or closing the dialog leaves the hidden consent state false and performs no submission.

This is deliberately not an automatic consent. The 2026-07 Cyberspace Administration of China policy Q&A says personal-information export consent must be specific, separate from other processing, and not obtained through bundled authorization; it lists popup confirmation as an available method. The detailed Vercel and Cloudflare facts remain accessible in the privacy page under the collapsed `咨询提交使用的技术服务` section. The homepage no longer displays `境外处理说明` or a visible `境外处理` label.

Implementation and local acceptance:

- `index.html`: one visible privacy checkbox plus a responsive modal/bottom-sheet confirmation.
- `assets/lead-form.js`: service consent defaults false, changes to true only after the explicit confirmation, and remains required before Turnstile and payload creation.
- `services/leads-api/api/_lib/lead-domain.js`: server-side independent-consent and version checks remain fail-closed; only user-facing error wording was softened.
- Full `npm run check:integration` passed: 26/26 lead tests, admin tests, launch-gate test, 12-function budget, 7-work/3-media authorization check, and the 515-file protected build.
- Browser acceptance passed at 1280×900 and 390×844: one visible checkbox, enabled submit after contact consent, confirmation visible on click, hidden service consent still false before confirmation, cancel leaves it false, confirmation closes the dialog and reaches the local no-send success state, and no console warning/error was recorded.
- The port 8081 preview serves the new build. No Production deployment or real phone submission was performed.

## Plain-language consent and real Feishu lead-loop acceptance

Later on 2026-08-24, the parent-facing confirmation dialog was simplified again after user review. Its visible content is now:

- title: `确认提交`;
- copy: the phone is used only for this course consultation, a responsible teacher will contact the parent, it is not made public or used for other purposes;
- secondary action: `返回修改`;
- primary action: `同意并提交`;
- one optional link to `查看隐私说明`.

The dialog no longer exposes `Vercel`, `Cloudflare`, `境外处理`, or `第三方技术服务` as funnel copy. The detailed factual disclosure remains on the privacy page. Desktop acceptance passed at 1280×720 and mobile acceptance passed at an actual 390×844 viewport. Both states showed one dialog, both actions, no technical vendor terminology, and no layout overflow in the dialog.

### Preview deployment defects found and fixed

The first three Preview attempts failed before any lead write:

1. `dpl_5LDGdDTcUUyv2jafCsmqfadLTTGs`: malformed historical `LEADS_ALLOWED_ORIGINS` value;
2. `dpl_5wfR3739dnCJcY4MZZXQj1igMNxE`: `LEADS_PRIVACY_VERSION` and the separate-consent version did not match;
3. `dpl_55dEybHEpzpXjNRk7Lmeo8fwCTr6`: the 12-function reduction excluded seven rollback handlers from the Vercel upload while the remote build still required those ignored files to exist.

The function-budget assertion now requires all seven rollback sources locally, but permits all seven to be absent together only when `VERCEL=1` and the exact `.vercelignore` rules are present. A partial absence still fails. The Preview environment values for allowed origins and both privacy versions were updated to their current valid values. A subsequent Preview deployment with no per-deployment overrides passed, proving the persistent Preview configuration is self-consistent.

### Real synthetic lead acceptance

The acceptance used Cloudflare's official always-pass testing credentials on a short-lived Preview. Code support is fail-closed: `LEADS_TURNSTILE_TEST_MODE=true` is accepted only when `VERCEL_ENV=preview`; Production rejects that configuration. The test Preview was deleted immediately after acceptance.

No real parent data was used. The controlled request used a standard synthetic placeholder number and the same `/api/leads/create` handler, Origin checks, payload checks, independent-consent checks, field contract, Base gateway, and group-notification path as the website.

Evidence for `TD-L-20260824-6876472E`:

- the new internal Base had 0 records before submission;
- Preview `POST /api/leads/create` returned HTTP 201 and `status=received`;
- an independent `lark-cli` user read found exactly one Base record, `record_id=recvtdZFozbBCK`;
- the record showed source `首页`, preferred time `都可以`, both consent fields true, and notification status `已推送`;
- an independent group read found exactly one matching message, `message_id=om_x100b67f11173b0b8b033b28ee3d553e`, sent by Samantha;
- a direct message read confirmed the same lead code plus the expected consultation and phone-label content without exposing the phone value in the audit;
- the exact message was recalled and the exact Base record was deleted;
- post-delete Base search returned 0 matches, direct record read returned the record ID in `record_not_found`, and the table count returned to 0;
- post-delete group search returned 0 matches; direct message read returned `deleted=true` and no longer contained the lead code or body.

The short-lived test deployment `dpl_HxZY6EAPAXtrTjdMg76MDd2DXRPW` and the five failed or superseded Preview deployments created during this acceptance were removed. The retained normal Preview is:

- deployment: `dpl_FQiXuhmPXcSDYnhWSxJ1rEcFFxFV`;
- URL: `https://xinghai-deploy-hxombydyy-haowangggggg-3935s-projects.vercel.app`;
- status: `READY`;
- build: 515 public files, 12 deployable Functions, functions in `sin1`;
- same-origin preflight: HTTP 204 with the exact Preview origin;
- visible popup readback: the final plain-language copy above.

No Production deployment, alias change, or official-domain promotion was performed in this acceptance.

### Remaining operational risk

This test proves that the current Preview request reached the intended Base and reminder group and that the test artifacts were fully removed. It does not prove every future notification will always arrive. The create handler intentionally stores the Base record first; if the group message later fails, it preserves the record, marks `通知状态=推送失败`, and still returns a successful receipt to the parent. There is no durable automatic retry or separate alert for `待推送/推送失败` yet. The data is not lost, but an operator can miss the reminder unless that status is monitored or retried.

## 2026-08-25 r12 release-candidate closure

- Preview `dpl_37su6PJMQ964m8gsDbBaa8DdSamu` reached `READY`; its homepage loads `hero-motion-v4.js?v=20260824-responsive-input-r12`.
- `/`, `/learning`, `/create`, `/works`, `/about`, `/privacy`, `/booking`, `/aesthetic`, `/world`, all seven authorized work routes, and `/content-admin` returned 200 through authenticated Preview readback. The intentionally unpublished local Admin v2 route returned 404. The leads and retention Functions were present and returned their expected unauthenticated 403/401 responses.
- The three duplicate `production-project-route-preservation` markers were removed only after this route readback and the existing title/source-hash checks.
- Production now has an explicit sensitive `LEADS_RETENTION_DELETE_ENABLED=true`; Preview retains safe dry-run mode. After rotating `CRON_SECRET` to a generated 64-character value, the real Preview retention handler reached the restricted Feishu Base and returned `{ ok: true, mode: "dry_run", eligibleCount: 0, truncated: false }`. The Base had already been independently read back as empty after the controlled lead test. Together with the 27/27 retention/domain tests, this closes the retention configuration marker without manufacturing an expired parent record.
- `/admin` was removed from the deployment artifact because its Admin v2 Functions are intentionally excluded by the 12-Function budget. `/content-admin` remains the narrow protected production editor. This avoids publishing a knowingly broken hidden frontend.
- Two release blockers remain: `production-lead-environment` (a real Cloudflare Turnstile widget for `tudu.school`, not the Preview dummy key) and `operator-filing-applicability`.
- The filing marker remains because the 2024 amended MIIT rule defines a China-based organization using a domain to provide non-commercial internet information as an in-scope service. The owner's current choice to defer filing is recorded as an operating decision, not converted into a legal-compliance claim or silently used to bypass the build gate.
