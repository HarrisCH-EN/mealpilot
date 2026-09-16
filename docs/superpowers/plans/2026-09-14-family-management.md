# Family Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将设置页的“家庭信息”入口升级为真实家庭管理页，支持成员查看家庭信息、退出和重新加入家庭；支持管理员复制邀请码、移除成员以及授予/取消成员管理员身份；头像区域显示家庭权限“管理员/成员”。

**Architecture:** 继续使用现有 `families` 与 `family_members` 数据模型。创建家庭的用户保留 `owner` 角色并视为管理员；新增持久化的 `admin` 角色表示被授权的管理员。后端通过家庭管理员中间件保护成员管理接口，小程序新增家庭管理页面并复用现有认证、请求和白色/粉色视觉体系。

**Tech Stack:** Node.js, Express, MySQL schema/migrations, WeChat Mini Program WXML/WXSS/JavaScript, Node test runner.

---

## Task 1: Add failing backend coverage for family management

- [x] Add `server/test/family-management.test.js` with an in-memory database harness covering:
  - ordinary members can leave and their row becomes `left`;
  - owners cannot leave;
  - a user who left can join again and the existing row is reactivated as `member`;
  - owners and delegated admins can copy/use the invite management flow, while members receive 403;
  - admins can promote an active member to `admin`, demote them to `member`, and remove them;
  - owner rows cannot be demoted or removed, and an administrator cannot remove themself through the member-removal endpoint;
  - member management is scoped to the current family.
- [x] Run `node --test test/family-management.test.js` from `E:/Database_Design/server` and record the expected failures before adding production routes.

## Task 2: Extend the persisted role model and define migration coverage

- [x] Update `database/01_schema.sql` so `family_members.role` accepts `owner`, `admin`, and `member`, with `member` as the default.
- [x] Add `database/09_family-admin-role.sql` containing the one-time MySQL migration (after the existing `08_tag_system_v1.sql` upgrade):

  ```sql
  ALTER TABLE family_members
    MODIFY COLUMN role ENUM('owner', 'admin', 'member') NOT NULL DEFAULT 'member';
  ```

- [x] Extend `server/test/schema.test.js` to assert that the canonical schema and migration both contain the `admin` role.
- [x] Run `node --test test/schema.test.js` from `E:/Database_Design/server` and keep the new assertions failing until the schema files are updated.

## Task 3: Implement protected family-management APIs

- [x] Add `requireFamilyAdmin(database)` to `server/src/middleware/authenticate.js`; it must load the current active membership and allow only `owner` or `admin`, otherwise return HTTP 403 with a user-facing Chinese error.
- [x] Update `server/src/routes/auth-family.js` so joining a family reactivates an existing `left` membership row instead of violating the unique `(family_id, user_id)` key. Reactivated users must return as ordinary `member` unless later promoted again.
- [x] Add authenticated routes in `server/src/routes/auth-family.js`:
  - `POST /families/leave`: mark the current non-owner membership `left`; reject owners with HTTP 409.
  - `PATCH /families/current/members/:memberId/role`: administrator-only; accept only `admin` or `member`; never modify an owner row.
  - `DELETE /families/current/members/:memberId`: administrator-only; mark another active member `left`; never remove an owner or the requesting member.
- [x] Keep member management family-scoped and transaction-safe by locking the acting user/member rows before mutations and checking active status inside the transaction.
- [x] Run `node --test test/family-membership.test.js test/family-management.test.js test/schema.test.js` from `E:/Database_Design/server`.

## Task 4: Add failing mini-program coverage for the new page and permission copy

- [x] Add `miniprogram/test/family-management.test.js` asserting:
  - `pages/family-management/index` is registered in `miniprogram/app.json`;
  - settings navigates to the family page instead of showing the old family modal;
  - settings binds the avatar metadata to a role label, not the login mode;
  - the family page exposes family/member information, leave/join actions, invite-code copy, and administrator-only member actions.
- [x] Update the existing settings UI assertion in `miniprogram/test/ui-v1.test.js` to expect the role labels (`管理员`, `成员`, or `未加入家庭`) after the requested copy change.
- [x] Run `node --test test/family-management.test.js test/account-management.test.js test/ui-v1.test.js` from `E:/Database_Design/miniprogram` and confirm the new behavior tests fail before implementation.

## Task 5: Implement the family-management mini-program page and settings integration

- [x] Add `miniprogram/pages/family-management/index.js`, `index.wxml`, `index.wxss`, and `index.json`.
- [x] In the page logic, load `/families/current`, normalize member initials and role labels, show the invite code only as a copyable administrator action, and provide:
  - empty-state create/join actions using `/families` and `/families/join`;
  - leave confirmation using `/families/leave`;
  - administrator action sheet for promotion/demotion and removal;
  - owner protection messaging and current-user markers.
- [x] Register the page in `miniprogram/app.json`.
- [x] Change `miniprogram/pages/settings/index.js` so `showFamilyInfo` navigates to `/pages/family-management/index`, computes `userRoleLabel` and `canManageFamily`, and preserves those values through auth refresh/error states.
- [x] Change `miniprogram/pages/settings/index.wxml` so the profile metadata is `{{userRoleLabel}}`; make invite-code copying administrator-only while ordinary members see a contact-admin hint; map both `owner` and `admin` to “管理员” in member summaries.
- [x] Update account-management details to show the current family permission separately from the login type when membership data is available.
- [x] Match the current refined white/soft-pink settings page using existing icons and WeChat-safe layout APIs; do not add new image assets for these controls.

## Task 6: Verify the integrated behavior

- [x] Run targeted backend and mini-program tests, then run the full mini-program test suite from `E:/Database_Design/miniprogram` with `npm test`.
- [x] Run syntax checks for all changed JavaScript files and `git diff --check` from `E:/Database_Design`.
- [x] Review the final diff for owner protection, admin authorization, rejoin behavior, and the profile role label; report any pre-existing unrelated test failures separately instead of weakening the new coverage.

Verification note: the targeted family-management suites pass. The full backend suite currently reports 179/180 with the pre-existing `start-backend-script.test.js` CRLF assertion, and the full mini-program suite retains 3 unrelated UI assertion failures (one tag-copy assertion and two recommendation-copy assertions); none exercises this feature.

## Self-review checklist

- [x] No family-management mutation is available to a non-admin through the API, even if the UI is bypassed.
- [x] The creator remains an administrator and cannot accidentally orphan the family through “退出家庭”.
- [x] A left member can rejoin without creating a duplicate membership row.
- [x] Admin promotion/demotion and removal operate only on active members of the current family.
- [x] The settings profile never presents “本地开发身份” as the family permission.
- [x] New UI actions have loading guards, confirmation for destructive actions, and clear error feedback.
