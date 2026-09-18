# CloudBase Storage Formal Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move MealPilot image persistence from container-local `/uploads` files to private CloudBase Storage while preserving legacy display compatibility and keeping stable `cloud://` file IDs in MySQL.

**Architecture:** `cloud-storage-service.js` is the only CloudBase SDK boundary and exposes upload, temporary URL, delete, and path construction operations with sanitized errors. Routes receive that service through `createApp` dependency injection; `media-url-service.js` resolves stored references for display without writing temporary URLs back to the database. Starter images use a verified title-to-existing-bundle mapping, and a dry-run-by-default migration script updates only strictly matched legacy starter rows.

**Tech Stack:** Node.js CommonJS, Express 5, `@cloudbase/node-sdk@3.18.3`, MySQL, Node test runner, WeChat Mini Program.

---

### Task 1: Establish CloudBase configuration and service contracts

**Files:**
- Modify: `server/src/config.js`, `server/src/server.js`, `server/src/app.js`, `server/.env.example`
- Replace: `server/src/services/cloud-storage-service.js`
- Create: `server/src/services/media-url-service.js`
- Test: `server/test/cloud-storage-service.test.js`, `server/test/runtime-config.test.js`

- [ ] **Step 1: Write failing tests** for required production variables, path construction, Buffer upload, URL batch de-dup/chunking, safe SDK errors, and legacy media resolution.
- [ ] **Step 2: Run the focused tests and confirm they fail because the new APIs/config do not exist.**
- [ ] **Step 3: Implement `createCloudStorageService({ envId, fileIdPrefix, sdk })` with lazy SDK init, `fileIdForPath`, `uploadBuffer`, `getTemporaryUrl`, `getTemporaryUrls`, and `deleteFile`; map all raw failures to `CLOUDBASE_STORAGE_*_FAILED` without raw details.
- [ ] **Step 4: Implement `createMediaUrlService` so only `cloud://` values call Storage, HTTPS and `/assets/recipes/`/`/uploads/` values pass through, and per-file URL failures degrade to an empty display URL.
- [ ] **Step 5: Make production config fail fast for `CLOUDBASE_ENV_ID`, `CLOUDBASE_STORAGE_FILE_ID_PREFIX`, and `CLOUDBASE_APIKEY`; keep API key out of returned config and error text. Remove probe config.
- [ ] **Step 6: Run focused tests and then `npm test`; keep the old suite green before route changes.

### Task 2: Remove probe/local persistence and wire dependency injection

**Files:**
- Modify: `server/src/app.js`, `server/src/server.js`, `server/src/routes/uploads.js`
- Delete/retire: `/api/health/storage`, `RECIPE_UPLOAD_ROOT`, `uploadRoot`, `readProbe`, `CLOUDBASE_STORAGE_PROBE_FILE_ID`, `express.static('/uploads')`
- Test: `server/test/cloud-storage-probe.test.js` replacement/removal and upload route tests

- [ ] **Step 1: Replace old upload tests with fake-Storage tests that assert CloudBase paths, `coverFileId`, `coverUrl`, no local file writes, and unchanged MIME/signature/5MB validation.**
- [ ] **Step 2: Run the focused upload tests and confirm failure against the old local-storage implementation.**
- [ ] **Step 3: Inject the runtime-created Storage/media services into routes; keep `/api/health` and remove the storage probe endpoint entirely.
- [ ] **Step 4: Make recipe-cover uploads use `families/<familyId>/recipes/<uuid>.<ext>` and avatar uploads use `users/<userId>/avatars/<uuid>.<ext>`; return stable file ID plus temporary display URL.
- [ ] **Step 5: Implement avatar ordering: read old value, upload, resolve new URL, update DB, best-effort delete new file on DB failure, and safe-warning-only handling for old-file deletion failure.
- [ ] **Step 6: Run the upload/avatar tests and `git diff --check`.

### Task 3: Enforce recipe stable-cover contract and resolve all server responses

**Files:**
- Modify: `server/src/routes/recipes.js`, `server/src/routes/auth-family.js`, `server/src/middleware/authenticate.js`, `server/src/routes/menus.js`, `server/src/routes/feedback.js`, recommendation loaders/services/routes, and any response helpers found by `rg`
- Test: new recipe contract and avatar response tests under `server/test/`

- [ ] **Step 1: Add failing tests for `coverFileId` precedence, GET `coverFileId`/`coverUrl`, edit-without-replacement preserving the stable ID, rejecting arbitrary HTTPS, rejecting another family’s file ID, and resolving avatars in auth/family-member responses.
- [ ] **Step 2: Run the tests and verify the expected contract failures.
- [ ] **Step 3: Replace route-local cover validation with a strict validator: accept empty, legacy `/assets/recipes/`/`/uploads/recipes/`, or the exact current-family prefix plus `families/<familyId>/recipes/`; reject arbitrary HTTPS and other-family IDs.
- [ ] **Step 4: Store `coverFileId` (fallback `coverUrl` only for legacy clients) in `cover_url`; never accept a temporary HTTPS URL as a stored reference.
- [ ] **Step 5: Resolve all recipe/menu/recommendation/feedback covers and user/family avatars via the shared resolver; expose stable IDs where edit workflows need them.
- [ ] **Step 6: Run focused tests and the full direct suite.

### Task 4: Update Starter Recipe mapping and seeding

**Files:**
- Create: `server/src/data/system-recipe-covers.js`
- Modify: `server/src/services/starter-recipe-service.js`, `server/src/data/starter-recipes.js` only if needed
- Test: `server/test/starter-storage-mapping.test.js`

- [ ] **Step 1: Add tests asserting 48 templates, exactly 47 mappings, only `红豆小米粥` missing, and every mapped filename exists under `miniprogram/assets/recipes/` (including `猪肉白菜包子` → `猪肉白菜包.jpg`).
- [ ] **Step 2: Run the mapping tests and confirm the new mapping module is missing.
- [ ] **Step 3: Build the mapping from the actual asset directory and template metadata; map existing legacy template paths by filename and explicit special cases, with cloud paths `system/recipes/<filename>`.
- [ ] **Step 4: Update `seedStarterRecipes(connection, ...)` to write `fileIdForPath(cloudPath)` for mapped covers and `''` for the missing title, without uploading system images.
- [ ] **Step 5: Run starter and mapping tests.

### Task 5: Add safe, idempotent recipe-cover data migration

**Files:**
- Create: `server/src/scripts/migrate-recipe-cover-storage.js`
- Modify: `server/package.json`
- Test: `server/test/recipe-cover-migration.test.js`

- [ ] **Step 1: Add failing tests for dry-run no-write, apply target writes, already-cloud skip, custom-cover skip, same-title non-template skip, missing-title preservation, and repeat apply idempotence.
- [ ] **Step 2: Run the tests and verify the migration matcher is absent.
- [ ] **Step 3: Extract a pure `classifyRecipeForStorageMigration(row, template, targetFileId)` helper that requires all starter fields to match and accepts only the template legacy cover, empty value, or exact target value.
- [ ] **Step 4: Implement the CLI with dry-run default and `--apply` gating; query rows, execute only classified updates, and print the required summary including `mappedSystemCovers: 47`, `missingSystemCovers: 1`, and `missingTitles: ['红豆小米粥']` for the expected dataset.
- [ ] **Step 5: Add `storage:migrate-recipe-covers` and run the migration tests without connecting to production.

### Task 6: Update Mini Program stable/display image state

**Files:**
- Modify: `miniprogram/utils/api.js`, `miniprogram/pages/recipe-form/index.js`, recipe list/detail/menu/recommend pages, account/family/restriction pages as needed
- Test: `miniprogram/test/recipe-cover.test.js`, relevant avatar/UI tests

- [ ] **Step 1: Add failing assertions that recipe form stores `coverFileId` separately, submits it, and keeps `coverUrl` display-only; preserve legacy URL fallback.
- [ ] **Step 2: Run the focused frontend tests and verify failure against current `coverPath`/`coverUrl` behavior.
- [ ] **Step 3: Make `uploadFile` consumers assign response `coverFileId` and `coverUrl`; GET/edit state uses stable ID for future PUT and display URL for `<image>`.
- [ ] **Step 4: Keep `resolveCoverUrl` as a legacy fallback only; do not initialize CloudBase SDK or expose server credentials in the Mini Program.
- [ ] **Step 5: Run Mini Program tests and the full backend direct suite.

### Task 7: Final verification and review

**Files:** all changed files

- [ ] **Step 1: Run `npm test` from `server/` and record test counts/failures.
- [ ] **Step 2: Run `npm run test:integration` only if its existing safety gate permits; otherwise report the gate and do not connect to production.
- [ ] **Step 3: Run `git diff --check` and searches for probe symbols, local persistence, raw secrets, all `cover_url`/`avatar_url` response points, and temporary URL writes.
- [ ] **Step 4: Inspect `git diff`, preserve unrelated `server/apikey.txt`, verify no package-lock drift, and report architecture, API contracts, mapping, migration commands, environment variables, security review, tests, and remaining manual deployment steps.
