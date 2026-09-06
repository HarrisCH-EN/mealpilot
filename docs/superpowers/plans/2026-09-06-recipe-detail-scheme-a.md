# Recipe Detail Scheme A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将菜品详情页收敛为方案 A 的纯白、克制布局，并把编辑移到底部操作栏、把分享加入更多菜单且标记为待开发。

**Architecture:** 保留现有 recipe-detail 页面、API、数据结构和页面跳转。仅调整详情页 WXML/WXSS/JS 与详情页测试；顶部安全区继续由胶囊 bounding rect 驱动，底部固定栏继续使用 safe-area inset。新增 edit/share PNG 资产并把生成来源登记到现有图标生成器。

**Tech Stack:** 微信小程序 WXML/WXSS/JavaScript、Node.js `node:test`、Chrome headless PNG icon generator。

---

### Task 1: Add failing contracts for Scheme A actions and icon assets

**Files:**
- Modify: `miniprogram/test/ui-v1.test.js`
- Test: `miniprogram/pages/recipe-detail/index.wxml`
- Test: `miniprogram/pages/recipe-detail/index.js`
- Test: `miniprogram/assets/icons/recipes/edit.png`
- Test: `miniprogram/assets/icons/recipes/share.png`

- [x] **Step 1: Write the failing test**

  Extend the recipe-detail tests to require:

  ```js
  assert.match(template, /detail-footer__edit[^>]*bindtap="edit"/)
  assert.match(template, /assets\/icons\/recipes\/edit\.png/)
  assert.doesNotMatch(script, /itemList:\s*\['编辑菜谱'/)
  assert.match(script, /itemList:\s*\['分享菜品（待开发）',\s*'删除菜品'\]/)
  assert.match(script, /shareRecipe\(\)/)
  assert.match(script, /分享功能待开发/)
  assert.ok(fs.existsSync(path.join(root, '..', '..', 'assets', 'icons', 'recipes', 'share.png')))
  ```

- [x] **Step 2: Run the focused test and verify it fails for the missing Scheme A contract**

  Run:

  ```powershell
  node --test --test-name-pattern "recipe detail scheme A actions" miniprogram/test/ui-v1.test.js
  ```

  Expected: FAIL because the current footer has no edit action, the more menu still contains edit, and the share handler/assets do not exist.

### Task 2: Implement action ownership without changing business APIs

**Files:**
- Modify: `miniprogram/pages/recipe-detail/index.js`
- Modify: `miniprogram/pages/recipe-detail/index.wxml`
- Modify: `miniprogram/pages/recipe-detail/index.wxss`

- [x] **Step 1: Update the WXML action ownership**

  Add a secondary footer button bound to the existing `edit()` method and keep the primary button bound to `openAdd()`:

  ```xml
  <view wx:if="{{recipe}}" class="detail-footer">
    <button class="detail-footer__button detail-footer__edit" bindtap="edit">
      <image class="detail-footer__icon" src="/assets/icons/recipes/edit.png" mode="aspectFit" />编辑菜品
    </button>
    <button class="detail-footer__button detail-footer__add" bindtap="openAdd">
      <image class="detail-footer__icon" src="/assets/icons/recipes/add-white.png" mode="aspectFit" />加入菜单
    </button>
  </view>
  ```

  Keep the existing navigation favorite/more PNG images and all existing content bindings.

- [x] **Step 2: Replace the more-menu mapping and add a waiting-state share handler**

  Change `openMore()` to:

  ```js
  openMore() {
    wx.showActionSheet({
      itemList: ['分享菜品（待开发）', '删除菜品'],
      success: ({ tapIndex }) => {
        if (tapIndex === 0) this.shareRecipe()
        if (tapIndex === 1) this.removeRecipe()
      }
    })
  },

  shareRecipe() {
    wx.showToast({ title: '分享功能待开发', icon: 'none' })
  },
  ```

  Keep `edit()` as the footer target and preserve the existing delete request. Update only the confirmation copy to `删除菜品？` and `删除后无法恢复，确定删除这道菜吗？`.

- [x] **Step 3: Style the two-button footer**

  Replace the single centered footer geometry with a two-column flex row using a 42/58 visual split, 10rpx gap, 46–50px-equivalent height, `env(safe-area-inset-bottom)`, and a light top divider. Use the existing theme pink only for `.detail-footer__add`; use white background, dark border and dark text for `.detail-footer__edit`. Keep `detail-content` bottom padding large enough for the fixed footer.

- [x] **Step 4: Run the focused test and verify it passes**

  Run the same command from Task 1. Expected: PASS for the new action contract.

### Task 3: Apply the visual Scheme A content layout

**Files:**
- Modify: `miniprogram/pages/recipe-detail/index.wxss`
- Modify: `miniprogram/pages/recipe-detail/index.wxml`
- Test: `miniprogram/test/ui-v1.test.js`

- [x] **Step 1: Add failing visual-structure assertions**

  Require the detail stylesheet/template to express:

  - white detail background and no gradient/recipe-glass-card use on detail content;
  - equal three-column metadata with divider treatment;
  - flat ingredient/step rows instead of large rounded cards;
  - centered two-line-safe title and centered ceramic hero;
  - fixed footer bottom safe-area padding.

- [x] **Step 2: Run the focused test and verify it fails against the current card-heavy rules**

  Run:

  ```powershell
  node --test --test-name-pattern "recipe detail scheme A layout" miniprogram/test/ui-v1.test.js
  ```

- [x] **Step 3: Implement the minimal CSS/WXML changes**

  Keep the existing three-layer plate markup and `aspectFill` image fallback. Reduce hero/detail vertical gaps to the approved spacing scale, remove large card backgrounds/radii/shadows from ingredients and steps, add subtle metadata dividers, preserve long-title clamping, and maintain a single content grid of approximately 24px side padding.

- [x] **Step 4: Run the layout contract and detail tests**

  Run:

  ```powershell
  node --test --test-name-pattern "recipe detail" miniprogram/test/ui-v1.test.js
  ```

  Expected: all recipe-detail tests pass.

### Task 4: Add reproducible PNG assets for edit/share

**Files:**
- Modify: `scripts/_icongen/render-icons.html`
- Modify: `scripts/_icongen/post-process.js`
- Create: `miniprogram/assets/icons/recipes/edit.png`
- Create: `miniprogram/assets/icons/recipes/share.png`

- [x] **Step 1: Add edit/share vector source to the existing renderer**

  Add simple monochrome 44px recipe icon shapes and two grid cells, then register `edit` and `share` in the post-process icon list under the `recipes` directory. The edit icon is rendered in the footer; the share asset is kept ready for the later real sharing/custom-sheet implementation because native `wx.showActionSheet` accepts text items only.

- [x] **Step 2: Regenerate the PNGs with the existing script**

  Run:

  ```powershell
  pwsh scripts/generate-ui-icons.ps1
  ```

  Expected: `miniprogram/assets/icons/recipes/edit.png` and `share.png` are created as transparent PNGs.

- [x] **Step 3: Verify the PNG assets and references**

  Run:

  ```powershell
  Test-Path miniprogram/assets/icons/recipes/edit.png
  Test-Path miniprogram/assets/icons/recipes/share.png
  rg -n "icons/recipes/(edit|share)\\.png" miniprogram/pages/recipe-detail
  ```

### Task 5: Verify the complete scoped change

**Files:**
- Test: `miniprogram/test/ui-v1.test.js`
- Verify: `miniprogram/pages/recipe-detail/*`

- [x] **Step 1: Run syntax checks**

  ```powershell
  node --check miniprogram/pages/recipe-detail/index.js
  node --check miniprogram/test/ui-v1.test.js
  ```

- [x] **Step 2: Run the complete UI test file and record unrelated baseline failures separately**

  ```powershell
  node --test miniprogram/test/ui-v1.test.js
  ```

  Confirm all recipe-detail tests pass; do not attribute existing recipe-catalog failures to this change.

- [x] **Step 3: Review the final scoped status**

  ```powershell
  git status --short -- miniprogram/pages/recipe-detail miniprogram/assets/icons/recipes scripts/_icongen miniprogram/test/ui-v1.test.js
  ```

  Confirm no backend, schema, API, or unrelated page files changed.
