# Unified Family Empty State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the recommendation, menu, and recipe no-family screens visually identical while preserving each page header and business behavior.

**Architecture:** Add one reusable `family-empty` visual contract to global WXSS and apply the same WXML structure to all three pages. Page-specific WXSS only controls placement; existing `goFamilySetup` handlers remain unchanged.

**Tech Stack:** WeChat Mini Program WXML/WXSS, Node.js built-in test runner.

**Spec:** `docs/superpowers/specs/2026-09-22-family-empty-state-design.md`

## Global Constraints

- Preserve the existing page title and subtitle on each Tab.
- Use `/assets/icons/settings/family.png`, title “还没加入家庭”, and button “创建或加入”.
- Keep each description to one short sentence and at most two rendered lines.
- Keep `goFamilySetup` and its Settings Tab destination unchanged.
- Do not change authenticated/family-present states, API calls, or TabBar configuration.

## Review Focus

- Narrow screens must keep the button and copy inside the card.
- All three pages must use the same structure and shared class names.
- Each page must preserve its own short description.
- The existing family setup tap handler must remain wired.
- Existing non-empty page UI must remain under its current condition.

---

### Task 1: Shared no-family card

**Files:**
- Create: `tests/miniprogram/family-empty-state.test.js`
- Modify: `miniprogram/app.wxss`
- Modify: `miniprogram/pages/recommend/index.wxml`
- Modify: `miniprogram/pages/recommend/index.wxss`
- Modify: `miniprogram/pages/menu/index.wxml`
- Modify: `miniprogram/pages/menu/index.wxss`
- Modify: `miniprogram/pages/recipes/index.wxml`
- Modify: `miniprogram/pages/recipes/index.wxss`

**Interfaces:**
- Consumes: existing `goFamilySetup()` handlers and `/assets/icons/settings/family.png`.
- Produces: shared `.family-empty`, `.family-empty__icon`, `.family-empty__title`, `.family-empty__copy`, and `.family-empty__action` styles.

- [ ] **Step 1: Write the failing test**

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..', '..', 'miniprogram')
const pages = ['recommend', 'menu', 'recipes']

test('no-family screens share one compact visual contract', () => {
  for (const page of pages) {
    const wxml = fs.readFileSync(path.join(root, 'pages', page, 'index.wxml'), 'utf8')
    assert.match(wxml, /class="family-empty"/)
    assert.match(wxml, /family-empty__icon/)
    assert.match(wxml, /还没加入家庭/)
    assert.match(wxml, /创建或加入/)
    assert.match(wxml, /bindtap="goFamilySetup"/)
  }
})
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/miniprogram/family-empty-state.test.js`

Expected: FAIL because the three pages currently use different empty-state class structures and copy.

- [ ] **Step 3: Implement the shared card**

Add the common card structure to each WXML:

```xml
<view class="family-empty">
  <view class="family-empty__icon"><image src="/assets/icons/settings/family.png" mode="aspectFit" /></view>
  <view class="family-empty__title">还没加入家庭</view>
  <view class="family-empty__copy">页面对应的一句短说明</view>
  <button class="family-empty__action" bindtap="goFamilySetup">创建或加入</button>
</view>
```

Add shared visual rules in `app.wxss`: white card, soft hairline, `32rpx` radius, `112rpx` pale-pink icon circle, compact centered copy, and a fixed-width brand-pink pill action. Add only margin placement overrides in each page WXSS.

- [ ] **Step 4: Verify GREEN and full regression**

Run: `node --test tests/miniprogram/family-empty-state.test.js`

Expected: PASS.

Run: `npm test --prefix tests/miniprogram`

Expected: all Mini Program tests pass.

Run: `git diff --check`

Expected: exit code 0.

- [ ] **Step 5: Commit**

```bash
git add miniprogram/app.wxss miniprogram/pages/recommend/index.wxml miniprogram/pages/recommend/index.wxss miniprogram/pages/menu/index.wxml miniprogram/pages/menu/index.wxss miniprogram/pages/recipes/index.wxml miniprogram/pages/recipes/index.wxss tests/miniprogram/family-empty-state.test.js
git commit -m "feat: unify no-family empty states"
```
