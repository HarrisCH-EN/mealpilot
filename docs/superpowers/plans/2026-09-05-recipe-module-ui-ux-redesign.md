# Recipe Module UI/UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the native WeChat Mini Program recipe catalog, recipe detail, and recipe editor with the approved Scheme B visual language while preserving the current API and database contracts.

**Architecture:** A new recipe-scoped WXSS theme is imported only by the three target pages. Pure helpers in `utils/ui.js` own step parsing/serialization and local favorite IDs; page scripts keep server data separate from transient editor and sheet state. Existing recipe and menu APIs remain unchanged.

**Tech Stack:** Native WXML, WXSS, CommonJS JavaScript, WeChat Mini Program storage and navigation APIs, Node.js built-in test runner.

---

### Task 1: Pure recipe UI state helpers

**Files:**
- Modify: `miniprogram/utils/ui.js`
- Modify: `miniprogram/test/ui-v1.test.js`

- [ ] Add failing tests asserting that blank step lines are removed, stable step keys are generated, edited steps serialize to newline `TEXT`, and favorite IDs are normalized without duplicates.
- [ ] Run `node --test miniprogram/test/ui-v1.test.js` and confirm the new helper tests fail because the exports do not exist.
- [ ] Add `parseRecipeSteps`, `serializeRecipeSteps`, `normalizeFavoriteRecipeIds`, and `toggleFavoriteRecipeId` to `utils/ui.js` and export them.
- [ ] Re-run `node --test miniprogram/test/ui-v1.test.js` and confirm all helper tests pass.

### Task 2: Recipe-scoped visual system and catalog

**Files:**
- Create: `miniprogram/styles/recipe-theme.wxss`
- Modify: `miniprogram/pages/recipes/index.wxml`
- Modify: `miniprogram/pages/recipes/index.wxss`
- Modify: `miniprogram/pages/recipes/index.js`
- Modify: `miniprogram/test/ui-v1.test.js`

- [ ] Add failing catalog contract tests for the scoped theme import, full-height flex layout, two independent vertical scroll views, two-column grid, 1:1 images, stable `wx:key`, local favorite binding, image fallback, and existing add-to-menu flow.
- [ ] Run the frontend test and confirm failures reference the missing theme/grid/favorite behavior.
- [ ] Create the scoped cloud-background tokens and rebuild the catalog markup and styles around a fixed header/search plus independently scrolling sidebar and grid.
- [ ] Load favorite IDs from `wx.getStorageSync`, toggle with `wx.setStorageSync`, and keep current search, category, navigation, fallback, and menu sheet requests unchanged.
- [ ] Re-run the frontend test and confirm the catalog contracts pass.

### Task 3: Ceramic plate recipe detail

**Files:**
- Modify: `miniprogram/pages/recipe-detail/index.json`
- Modify: `miniprogram/pages/recipe-detail/index.wxml`
- Modify: `miniprogram/pages/recipe-detail/index.wxss`
- Modify: `miniprogram/pages/recipe-detail/index.js`
- Modify: `miniprogram/test/ui-v1.test.js`

- [ ] Add failing tests for custom navigation safe-area state, three-layer plate markup, centered title, three metadata cells, ingredient and step cards, favorite persistence, more-menu edit/delete, bottom safe-area CTA, and current API calls.
- [ ] Run the frontend test and confirm the new detail assertions fail.
- [ ] Compute custom navigation dimensions from `wx.getWindowInfo` and `wx.getMenuButtonBoundingClientRect`, map recipe data into presentation fields, and implement favorite and action-sheet handlers.
- [ ] Implement the ceramic plate, cards, fixed CTA, image fallback, load/error states, delete confirmation, edit navigation, and existing add-to-menu sheet.
- [ ] Re-run the frontend test and confirm the detail contracts pass.

### Task 4: Modular recipe editor

**Files:**
- Modify: `miniprogram/pages/recipe-form/index.json`
- Modify: `miniprogram/pages/recipe-form/index.wxml`
- Modify: `miniprogram/pages/recipe-form/index.wxss`
- Modify: `miniprogram/pages/recipe-form/index.js`
- Modify: `miniprogram/test/ui-v1.test.js`

- [ ] Add failing tests for a single real cover preview with no fake upload control, custom header save, base information card, ingredient edit sheet, duplicate prevention, structured step blocks, stable keys, ordering controls, and API-compatible save serialization.
- [ ] Run the frontend test and confirm failures describe the missing modular editor behavior.
- [ ] Parse fetched `steps` with `parseRecipeSteps`; add handlers for step input/add/delete/move; serialize with `serializeRecipeSteps` in `save`.
- [ ] Add ingredient sheet state and handlers for add/edit/confirm/delete while retaining `serializeIngredients` and existing `/ingredients`, POST, and PUT requests.
- [ ] Rebuild editor WXML/WXSS with the scoped theme, single-cover capability note, modular cards, safe-area navigation, bottom sheet, and no duplicate bottom save button.
- [ ] Re-run the frontend test and confirm the editor contracts pass.

### Task 5: Regression, static validation, and visual QA

**Files:**
- Modify: `design-qa.md`

- [ ] Run `node --test miniprogram/test/*.test.js` and expect zero failures.
- [ ] Run `npm test` from `server` and expect zero failures.
- [ ] Parse every page JSON file and run the event-handler/static WXML checks through the frontend test suite.
- [ ] Confirm `git diff -- miniprogram/pages/menu` is empty relative to the pre-task snapshot and that neither `database/01_schema.sql` nor `server/src/routes/recipes.js` changed during this task.
- [ ] Compile in WeChat Developer Tools, inspect console output, and exercise catalog search/filter/favorite/detail/add-menu; detail favorite/more/add-menu; editor ingredient and step CRUD/save.
- [ ] Compare the three rendered target states against the provided Scheme B reference, record differences and final status in `design-qa.md`, and fix all P0/P1/P2 findings before handoff.
