# 管理员刷新家庭邀请码 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为家庭管理员增加手动刷新邀请码功能，确保新码生成后旧码立即失效并同步更新家庭信息页。

**Architecture:** 复用现有邀请码生成、家庭管理员中间件和家庭成员加入接口。后端新增事务化换码接口，锁定家庭记录后生成与旧码不同且满足唯一约束的新码；小程序仅向管理员展示刷新按钮，确认后调用接口并更新本地显示。

**Tech Stack:** Node.js、Express、MySQL、Node test、微信小程序 WXML/WXSS/JavaScript。

**Spec:** 用户需求“加上管理员手动刷新邀请码功能，并让旧邀请码立即失效”。

## Global Constraints

- 只有 `owner` 和 `admin` 角色可以刷新邀请码。
- 新邀请码保持 6 位数字、大小写字母组合，并满足数据库唯一约束。
- 刷新成功后旧邀请码不能再加入家庭。
- 刷新失败不得改变数据库中的旧邀请码。
- 保留普通成员读取和复制当前邀请码的能力。

---

### Task 1: 后端刷新接口与回归测试

**Files:**
- Modify: `server/test/family-management-hardening.test.js`
- Modify: `server/src/routes/auth-family.js`

**Interfaces:**
- Produces `POST /families/current/invite-code/refresh` with response `{ ok: true, data: { inviteCode } }`.

- [x] **Step 1: Write the failing tests**

覆盖管理员成功刷新、旧码失效、普通成员被拒绝，以及生成碰撞后重试。

- [x] **Step 2: Run the focused tests and verify they fail**

Run: `node --test server/test/family-management-hardening.test.js`

Expected: refresh endpoint returns 404 before implementation.

- [x] **Step 3: Implement the minimal transactional endpoint**

在 `auth-family.js` 中使用 `familyAdmin`，事务内 `SELECT ... FOR UPDATE` 锁定当前家庭，生成不同于旧码的新码；遇到唯一键冲突重试，成功后提交并返回新码。

- [x] **Step 4: Run the focused tests and verify they pass**

Run: `node --test server/test/family-management-hardening.test.js`

Expected: all tests pass。

### Task 2: 家庭信息页接入刷新操作

**Files:**
- Modify: `miniprogram/pages/family-management/index.js`
- Modify: `miniprogram/pages/family-management/index.wxml`
- Modify: `miniprogram/pages/family-management/index.wxss`
- Modify: `miniprogram/test/family-management.test.js`

**Interfaces:**
- Adds page handler `refreshInviteCode()` that calls `POST /families/current/invite-code/refresh`.

- [x] **Step 1: Write the failing UI contract assertions**

断言页面存在管理员可见的刷新绑定、刷新接口路径和确认文案/无填充按钮样式。

- [x] **Step 2: Run the focused frontend test and verify it fails**

Run: `node --test miniprogram/test/family-management.test.js`

Expected: missing refresh handler/template/style assertions fail。

- [x] **Step 3: Implement the page interaction**

只在管理员视图显示刷新按钮；确认后调用接口，校验返回的 6 位邀请码，更新 `inviteCode` 并提示成功；请求期间禁用重复操作。

- [x] **Step 4: Run the focused frontend test and verify it passes**

Run: `node --test miniprogram/test/family-management.test.js`

Expected: all focused frontend tests pass。

### Task 3: 全量验证与差异检查

**Files:**
- Verify: `server/src/routes/auth-family.js`
- Verify: `miniprogram/pages/family-management/index.js`
- Verify: `miniprogram/pages/family-management/index.wxml`
- Verify: `miniprogram/pages/family-management/index.wxss`

- [x] **Step 1: Run backend direct tests**

Run: `npm test --prefix server`

- [x] **Step 2: Run all mini-program tests**

结果：家庭管理焦点测试通过；全量测试仍有 3 个既有的 T4/推荐页契约失败，未涉及本次改动文件。

Run: `npm test --prefix miniprogram`

- [x] **Step 3: Inspect the diff and confirm only scoped files changed**

Run: `git diff -- server/src/routes/auth-family.js server/test/family-management-hardening.test.js miniprogram/pages/family-management/index.js miniprogram/pages/family-management/index.wxml miniprogram/pages/family-management/index.wxss miniprogram/test/family-management.test.js`
