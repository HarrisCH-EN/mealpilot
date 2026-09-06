# Mini Program UI Polish Round Two Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the native TabBar double-reservation and refine the four Tab pages without changing business behavior.

**Architecture:** Keep page data flow and event handlers untouched. Consolidate shared viewport, spacing, header, and search primitives in `app.wxss`, then tune only the four existing Tab page templates and styles around those primitives.

**Tech Stack:** WeChat Mini Program WXML/WXSS; Node built-in test runner for source-level UI regression checks.

---

### Task 1: Lock the TabBar viewport contract

**Files:**
- Modify: `miniprogram/test/ui-v1.test.js`
- Modify: `miniprogram/app.wxss`
- Modify: `miniprogram/pages/recipes/index.wxss`

- [ ] **Step 1: Write a failing regression test** requiring tab pages to use natural content height, a 48rpx content rhythm bottom inset, and no TabBar-sized padding or `100vh` recipe viewport.
- [ ] **Step 2: Run `node --test miniprogram/test/ui-v1.test.js`** and confirm it fails against the old `152rpx` / `128rpx` compensation.
- [ ] **Step 3: Implement the smallest CSS change**: replace the global Tab page compensation with regular content padding and remove the recipe page’s viewport lock; retain `env(safe-area-inset-bottom)` only for fixed sheets and the recipe-detail fixed footer.
- [ ] **Step 4: Run the UI test file** and confirm the viewport test passes.

### Task 2: Establish shared hierarchy and compact controls

**Files:**
- Modify: `miniprogram/test/ui-v1.test.js`
- Modify: `miniprogram/app.wxss`
- Modify: `miniprogram/pages/recommend/index.wxml`
- Modify: `miniprogram/pages/recommend/index.wxss`
- Modify: `miniprogram/pages/menu/index.wxml`
- Modify: `miniprogram/pages/menu/index.wxss`
- Modify: `miniprogram/pages/recipes/index.wxml`
- Modify: `miniprogram/pages/recipes/index.wxss`
- Modify: `miniprogram/pages/settings/index.wxml`
- Modify: `miniprogram/pages/settings/index.wxss`

- [ ] **Step 1: Write failing source-level checks** for one shared `page-header` per Tab page, an 80rpx recipe search surface, a 64rpx neutral recipe search trigger, and 128rpx recipe thumbnails.
- [ ] **Step 2: Run `node --test miniprogram/test/ui-v1.test.js`** and confirm these new checks fail.
- [ ] **Step 3: Implement WXML/WXSS refinements**: apply the shared header, tighten title/section rhythm, compact the recommendation hero controls and seasonal empty state, make menu empty meals one-line rows, strengthen the recipe rail/list relationship, and group settings as profile/list rows.
- [ ] **Step 4: Run the UI test file** and confirm all source-level checks pass.

### Task 3: Verify render-risk boundaries

**Files:**
- Verify: `miniprogram/app.wxss`
- Verify: `miniprogram/pages/{recommend,menu,recipes,settings}/index.{wxml,wxss}`
- Verify: `miniprogram/test/ui-v1.test.js`

- [ ] **Step 1: Run `node --test miniprogram/test/ui-v1.test.js`** for template event bindings and layout contract checks.
- [ ] **Step 2: Search the four Tab styles** for `100vh`, TabBar-sized `padding-bottom`, and full-height scroll locks using `rg -n "100vh|padding-bottom|safe-area|height: calc" miniprogram`.
- [ ] **Step 3: Inspect the final diff** with `git diff --check` and `git diff -- miniprogram/app.wxss miniprogram/pages/recommend miniprogram/pages/menu miniprogram/pages/recipes miniprogram/pages/settings miniprogram/test/ui-v1.test.js`.
