# Release Audit Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the local codebase and its release gates in line with the latest product design, close the audit's runtime reliability gaps, and make database migrations safe to run against the configured database.

**Architecture:** Keep the existing page and API boundaries. Add stale-data clearing at page load boundaries, route upload requests through the existing authentication recovery path, make the server migration entry point apply the ordered SQL history with schema-aware skips, and tighten production configuration validation without inventing a production URL.

**Tech Stack:** WeChat Mini Program JavaScript/WXML/WXSS, Node.js `node:test`, Express, MySQL 8, `mysql2`, PowerShell verification commands.

**Spec:** `docs/reports/2026-09-16-release-audit.md` plus the current recommendation-sheet design in `miniprogram/pages/recommend`.

## Global Constraints

- Preserve existing uncommitted user changes and do not reset or delete unrelated files.
- Do not delete business rows, legacy tag archives, or orphan uploads in this implementation.
- Keep local development pointed at `http://127.0.0.1:3000/api` with development login enabled.
- Production configuration must fail closed when the API URL is a placeholder or development login is enabled.
- Latest UI behavior, not obsolete copy assertions, is the test contract.

---

### Task 1: Add regression tests for stale-data and upload-session failures

**Files:**
- Modify: `miniprogram/test/phase-2g-polish.test.js`
- Modify: `miniprogram/test/wechat-auth.test.js`

**Interfaces:**
- Tests consume the current menu/recipe page load source and the shared authentication harness.
- Tests produce executable regression coverage for clearing stale collections and retrying uploads after a 401.

- [ ] **Step 1: Write the failing stale-data assertions**

Assert that menu load clears `menus`/`mealCards`/`totalItems` before the request and recipe load clears `recipes` before the request.

- [ ] **Step 2: Write the failing upload 401 behavior test**

Extend the existing auth harness with `wx.uploadFile` responses and assert that an expired upload causes one formal re-authentication, retries once with the new token, and resolves the uploaded payload.

- [ ] **Step 3: Run the focused tests and confirm the expected failures**

Run:

```powershell
node --test miniprogram/test/phase-2g-polish.test.js miniprogram/test/wechat-auth.test.js
```

Expected: the new stale-data and upload retry assertions fail against the current implementation.

---

### Task 2: Fix page stale-data handling and upload authentication recovery

**Files:**
- Modify: `miniprogram/pages/menu/index.js`
- Modify: `miniprogram/pages/recipes/index.js`
- Modify: `miniprogram/utils/api.js`

**Interfaces:**
- `menu.load()` clears current menu presentation state before `/menus` begins.
- `recipes.load()` clears current recipe cards before `/recipes` begins.
- `uploadFile()` and `uploadAvatar()` use one authenticated upload helper that reauthenticates once for HTTP 401 and then redirects through the existing login gate if recovery fails.

- [ ] **Step 1: Clear menu state at the start of every reload**

Set `loading: true`, clear `error`, replace `menus` with empty normalized meals, rebuild empty `mealCards`, and set `totalItems` to `0` before the first request.

- [ ] **Step 2: Clear recipe state at the start of every reload**

Set `loading: true`, clear `error`, and replace `recipes` with `[]` before requesting the new list.

- [ ] **Step 3: Implement one authenticated upload helper**

Use a shared helper for both upload endpoints. Parse the response once, preserve successful payloads, retry exactly once through `reauthenticate()` on status `401`, and call `redirectToLogin()` after failed recovery.

- [ ] **Step 4: Run the focused tests and confirm they pass**

Run the Task 1 command and require zero failures.

---

### Task 3: Update frontend test contracts to the latest design

**Files:**
- Modify: `miniprogram/test/tag-t4.test.js`
- Modify: `miniprogram/test/ui-v1.test.js`

**Interfaces:**
- Tests assert the current “默认标签不可修改或删除” copy and the actual editorial recommendation home/sheet structure.
- Tests no longer require removed copy such as “每格 5 分钟” or “这些选择只影响本次推荐”.

- [ ] **Step 1: Replace the obsolete tag copy assertion**

Assert the current “默认” section and its read-only copy while retaining checks for custom rename/delete handlers and system-chip rendering.

- [ ] **Step 2: Replace obsolete recommendation copy assertions**

Assert the current `今天吃什么？`, `帮我选`, `context-summary`, `自定义这一餐`, ruler scroll/pointer, candidate controls, and canonical API flow.

- [ ] **Step 3: Run the complete Mini Program suite**

Run:

```powershell
node miniprogram/scripts/run-tests.js
```

Expected: all frontend tests pass.

---

### Task 4: Make the migration entry point apply ordered history safely

**Files:**
- Create: `server/src/scripts/migration-runner.js`
- Modify: `server/src/scripts/migrate-database.js`
- Modify: `server/test/schema.test.js`

**Interfaces:**
- `migration-runner.js` exports ordered migration metadata, SQL normalization that removes hard-coded `USE smart_meal`, and an async runner accepting a MySQL connection and database root.
- The runner creates `schema_migrations`, applies `04` through `10` in order, records applied/skipped migrations, skips legacy tag backfill/removal when the current `recipe_tags` table is already in V1 form, and uses a named MySQL advisory lock.
- The configured `MYSQL_DATABASE` is the only target database; migration files cannot silently redirect to `smart_meal`.

- [ ] **Step 1: Write migration-runner contract tests**

Test ordered file discovery, removal of hard-coded `USE smart_meal`, and schema-aware skip selection for a V1 `recipe_tags(recipe_id, tag_id)` table.

- [ ] **Step 2: Run the migration tests and confirm they fail**

Run:

```powershell
node --test server/test/schema.test.js
```

Expected: the new runner contract assertions fail because the runner does not exist.

- [ ] **Step 3: Implement the migration runner**

Create the history table, acquire/release the advisory lock, inspect `information_schema`, execute each normalized SQL file in order, and insert a history row only after successful execution or an explicit schema-aware skip.

- [ ] **Step 4: Route `migrate-database.js` through the runner**

Open the configured database with `multipleStatements: true`, call the runner, close the connection in `finally`, and retain the existing family-management preflight after the historical migrations.

- [ ] **Step 5: Run migration tests and the backend direct suite**

Run:

```powershell
node --test server/test/schema.test.js
cd server
npm test
```

---

### Task 5: Fail closed for production development login

**Files:**
- Modify: `server/src/config.js`
- Modify: `server/test/runtime-config.test.js`

**Interfaces:**
- `getConfig({ NODE_ENV: 'production', DEV_AUTH_ENABLED: 'true', JWT_SECRET: valid })` throws a configuration error.
- Development and test environments retain current behavior.

- [ ] **Step 1: Add the failing production guard test**

Assert that production with `DEV_AUTH_ENABLED=true` is rejected while production with it absent/false remains valid when a real JWT secret is supplied.

- [ ] **Step 2: Run the focused runtime config test and confirm failure**

Run:

```powershell
node --test server/test/runtime-config.test.js
```

- [ ] **Step 3: Add the fail-closed config guard**

Reject only production configurations that explicitly enable development login; do not change local development login behavior.

- [ ] **Step 4: Run the focused runtime config test again**

Require zero failures.

---

### Task 6: Final verification and audit refresh

**Files:**
- Modify: `docs/reports/2026-09-16-release-audit.md` only if the final test counts or conclusions are materially changed.

- [ ] **Step 1: Run Mini Program syntax and full tests**
- [ ] **Step 2: Run Backend Direct tests**
- [ ] **Step 3: Run Backend Integration tests against `smart_meal_test` without touching `smart_meal`**
- [ ] **Step 4: Run `npm audit --omit=dev --audit-level=moderate`**
- [ ] **Step 5: Run `git diff --check` and inspect the final diff**
- [ ] **Step 6: Report any remaining release-only blocker requiring the real HTTPS API URL or manual WeChat Developer Tools/device interaction**
