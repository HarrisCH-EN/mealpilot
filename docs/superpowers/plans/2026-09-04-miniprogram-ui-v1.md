# 家宴计划微信小程序 UI v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将已确认的国泰式简约视觉语言和完整菜谱点餐流程落地到原生微信小程序。

**Architecture:** 以 `app.wxss` 提供全局设计 token 和基础组件类，各页面保留独立业务脚本与局部布局样式。新增纯函数工具承载日期、API 查询和表单序列化逻辑，新增详情与编辑页面承载菜谱完整流程；原生 TabBar 使用本地成对 PNG 图标。

**Tech Stack:** 原生微信小程序 WXML/WXSS/JavaScript、Node.js 内置测试运行器、Express 现有 API。

---

### Task 1: 建立可执行的 UI 契约测试

**Files:**
- Create: `miniprogram/test/ui-v1.test.js`
- Create: `miniprogram/utils/ui.js`

- [ ] **Step 1: Write the failing test**

```js
test('menu payload preserves selected date, meal and note', () => {
  assert.deepEqual(buildMenuItemPayload(7, '2026-09-05', 'lunch', '少盐'), {
    recipeId: 7, menuDate: '2026-09-05', mealType: 'lunch', note: '少盐'
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test miniprogram/test/ui-v1.test.js`
Expected: FAIL because `miniprogram/utils/ui.js` and the v1 interface contract do not exist.

- [ ] **Step 3: Implement pure UI helpers**

Implement local-date formatting, recipe query building, menu payload creation, difficulty labels, and ingredient form serialization in `utils/ui.js`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test miniprogram/test/ui-v1.test.js`
Expected: PASS.

### Task 2: 建立全局视觉系统与 Tab 图标

**Files:**
- Modify: `miniprogram/app.json`
- Modify: `miniprogram/app.wxss`
- Create: `miniprogram/assets/tab/*.png`
- Create: `scripts/generate-tab-icons.ps1`

- [ ] **Step 1: Extend the failing UI contract**

Assert that the global navigation title is empty, detail/form pages are registered, all four tabs have `iconPath` and `selectedIconPath`, and all icon files exist.

- [ ] **Step 2: Generate the icon pairs**

Create deterministic 81×81 PNG assets: outline icons for inactive state and filled `#0B6B65` icons for active state.

- [ ] **Step 3: Implement global tokens and primitives**

Define font stacks, color variables, spacing, cards, buttons, chips, forms, skeletons, empty/error panels, safe-area padding and bottom sheets. Set `navigationBarTitleText` to an empty string.

- [ ] **Step 4: Verify contract and icon dimensions**

Run: `node --test miniprogram/test/ui-v1.test.js`
Expected: PASS with every icon path resolving to a PNG.

### Task 3: 升级推荐与菜单页

**Files:**
- Modify: `miniprogram/pages/recommend/index.{js,wxml,wxss}`
- Modify: `miniprogram/pages/menu/index.{js,wxml,wxss}`

- [ ] **Step 1: Add failing source-contract assertions**

Assert that the recommendation page exposes generate/apply disabled states and retry affordance, while the menu page exposes date navigation, empty meal sections, manual add and delete confirmation.

- [ ] **Step 2: Implement recommendation state flow**

Keep existing API payloads; add local-date handling, stable mode labels, duplicate-submit guards, page-level error panel, success toast and re-generation.

- [ ] **Step 3: Implement menu state flow**

Normalize all three meal sections even when the API omits empty meals, preserve manual add through Tab navigation, and refresh after deletion.

- [ ] **Step 4: Run tests**

Run: `node --test miniprogram/test/ui-v1.test.js && npm test --prefix server`
Expected: all tests pass.

### Task 4: 构建双栏菜谱、详情和完整编辑表单

**Files:**
- Modify: `miniprogram/pages/recipes/index.{js,wxml,wxss}`
- Create: `miniprogram/pages/recipe-detail/index.{js,json,wxml,wxss}`
- Create: `miniprogram/pages/recipe-form/index.{js,json,wxml,wxss}`

- [ ] **Step 1: Add failing recipe-flow assertions**

Assert that cards navigate to detail, plus buttons open a date/meal sheet, confirmation posts `/menus/items`, detail loads `/recipes/:id`, and the form posts or puts the complete recipe object including `ingredients`.

- [ ] **Step 2: Implement the catalog and bottom sheet**

Render left categories and right cards, stop plus-button event bubbling, default the sheet to today/dinner, validate selections, disable while saving and close on success.

- [ ] **Step 3: Implement detail and form pages**

Show cover or abstract fallback, metadata, ingredients and steps; allow create/edit with ingredient rows sourced from `/ingredients` and serialize numeric fields before POST/PUT.

- [ ] **Step 4: Run tests**

Run: `node --test miniprogram/test/ui-v1.test.js && npm test --prefix server`
Expected: all tests pass.

### Task 5: 升级设置页并验证完整回归

**Files:**
- Modify: `miniprogram/pages/settings/index.{js,wxml,wxss}`

- [ ] **Step 1: Add failing settings assertions**

Assert that the page loads `/auth/me`, loads `/families/current` when joined, displays members, preserves create/join/copy/insights actions, and marks unsupported preferences as upcoming.

- [ ] **Step 2: Implement the settings UI**

Build account, family, members, insight and upcoming-feature sections with explicit loading/error states and no fake save controls.

- [ ] **Step 3: Run automated verification**

Run: `node --test miniprogram/test/ui-v1.test.js && npm test --prefix server`
Expected: all tests pass with no warnings.

- [ ] **Step 4: Run manual WeChat acceptance**

In WeChat DevTools verify: login → generate recommendation → apply → menu view/delete → recipe search/detail/add/edit/delete → family actions → insights. Confirm empty titles, outline/filled Tab icons, safe-area layout and no dead buttons.
