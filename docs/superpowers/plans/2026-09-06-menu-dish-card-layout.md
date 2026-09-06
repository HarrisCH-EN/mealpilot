# 菜单页菜品卡片信息结构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变菜单业务逻辑、API 或 Schema 的前提下，统一早餐/午餐/晚餐菜品卡片为菜名、简介、时长和 3 星难度信息层级。

**Architecture:** 将 3 星难度数组 helper 放入 `miniprogram/utils/ui.js`，菜谱总览和菜单页共同调用；菜单页继续由 `enrichMenus` 将 recipe 数据合并到菜单 item，再由同一份 WXML/CSS 渲染三个餐次。缺失字段只影响对应展示节点，不改变现有请求和事件处理。

**Tech Stack:** 微信小程序 WXML/WXSS/JavaScript、现有 PNG 星星资源、Node.js 测试脚本。

---

### Task 1: 抽取并复用 3 星难度 helper

**Files:**
- Modify: `miniprogram/utils/ui.js`
- Modify: `miniprogram/pages/recipes/index.js`
- Test: `miniprogram/test/ui-v1.test.js`

- [ ] **Step 1: Extend the utility contract with a shared star mapper**

在 `ui.js` 增加：

```js
function difficultyStars(value) {
  const numericValue = Number(value)
  const level = Number.isFinite(numericValue) ? Math.max(0, Math.min(3, numericValue)) : 0
  return [0, 1, 2].map((index) => index < level)
}
```

并在 `module.exports` 导出 `difficultyStars`。

- [ ] **Step 2: Replace the recipes page local implementation**

从 `recipes/index.js` 的 `require('../../utils/ui')` 解构出 `difficultyStars`，删除本文件内同名函数，保留 `difficultyText` 和现有三颗星 WXML 结构不变。

- [ ] **Step 3: Add focused helper assertions**

在 `miniprogram/test/ui-v1.test.js` 追加对以下输入的断言：

```js
assert.deepStrictEqual(difficultyStars(1), [true, false, false])
assert.deepStrictEqual(difficultyStars(2), [true, true, false])
assert.deepStrictEqual(difficultyStars(3), [true, true, true])
assert.deepStrictEqual(difficultyStars('bad'), [false, false, false])
```

- [ ] **Step 4: Run the focused test**

Run: `node --test miniprogram/test/ui-v1.test.js`

Expected: PASS, including the existing UI utility assertions.

### Task 2: Enrich menu items with shared star data and safe display flags

**Files:**
- Modify: `miniprogram/pages/menu/index.js`

- [ ] **Step 1: Import the shared helper**

Extend the existing utility import to include `difficultyStars` while retaining `difficultyLabel` for unrelated existing code only if still referenced elsewhere in the file.

- [ ] **Step 2: Add normalized recipe metadata in `enrichMenus`**

For each menu item, preserve the existing fields and add:

```js
const rawDifficulty = Number(recipe.difficulty)
const hasDifficulty = Number.isInteger(rawDifficulty) && rawDifficulty >= 1 && rawDifficulty <= 3

return {
  ...item,
  coverUrl: recipe.coverUrl || '',
  description: String(recipe.description || '').trim(),
  cookMinutes: Number(recipe.cookMinutes) > 0 ? Number(recipe.cookMinutes) : 0,
  difficultyStars: hasDifficulty ? difficultyStars(rawDifficulty) : [],
  hasDifficulty
}
```

Do not add fallback category text to the display model and do not alter the API request, menu normalization, or recipe lookup behavior.

- [ ] **Step 3: Verify the mapping statically**

Run: `rg -n "difficultyText|difficultyStars|cookMinutes|description|category" miniprogram/pages/menu/index.js`

Expected: `difficultyStars`, `cookMinutes`, and `description` are used for menu card data; no new API or schema field appears.

### Task 3: Update the shared menu-card WXML structure

**Files:**
- Modify: `miniprogram/pages/menu/index.wxml`

- [ ] **Step 1: Keep the existing meal loop and handlers**

Leave the `mealCards` loop, `card.items` loop, image fallback, `openRecipe`, `handleImageError`, and `remove` bindings in place.

- [ ] **Step 2: Replace only the card information subtree**

Use this structure inside each `menu-dish`:

```xml
<view class="menu-dish__copy" data-recipe-id="{{item.recipeId}}" bindtap="openRecipe">
  <view class="menu-dish__title">{{item.title}}</view>
  <view wx:if="{{item.description}}" class="menu-dish__description">{{item.description}}</view>
  <view wx:if="{{item.cookMinutes || item.hasDifficulty}}" class="menu-dish__meta">
    <text wx:if="{{item.cookMinutes}}" class="menu-dish__time">{{item.cookMinutes}}分钟</text>
    <view wx:if="{{item.hasDifficulty}}" class="menu-dish__stars" aria-label="难度 {{item.difficulty}} 星">
      <image wx:for="{{item.difficultyStars}}" wx:for-item="starActive" wx:for-index="starIndex" wx:key="starIndex" class="menu-dish__star" src="{{starActive ? '/assets/icons/recipes/star-active.png' : '/assets/icons/recipes/star-inactive.png'}}" mode="aspectFit" />
    </view>
  </view>
</view>
```

Keep the delete button as the third sibling with its existing `data-id`, `catchtap="remove"`, and `aria-label`.

- [ ] **Step 3: Check the final DOM contract**

Run: `rg -n "简单|适中|进阶|difficultyText|{{item.category}}| 分钟|menu-dish__meta" miniprogram/pages/menu/index.wxml`

Expected: no text difficulty labels, category fallback, or spaced `分钟` remains in the menu card; one shared card structure serves all three meals.

### Task 4: Refine menu-card WXSS without changing the deck

**Files:**
- Modify: `miniprogram/pages/menu/index.wxss`

- [ ] **Step 1: Preserve the existing outer meal-deck rules**

Do not change `.meal-deck`, `.meal-note`, `.meal-note__dishes`, `.meal-note__dish-group`, calendar, indicator, or meal-switch rules.

- [ ] **Step 2: Update only menu-dish descendants**

Apply these concrete rules:

```css
.menu-dish { display: flex; width: 100%; min-width: 0; align-items: center; gap: 20rpx; }
.menu-dish__photo { width: 112rpx; height: 112rpx; flex: 0 0 112rpx; border-radius: 20rpx; }
.menu-dish__copy { min-width: 0; flex: 1; padding: 4rpx 0; }
.menu-dish__title { overflow: hidden; color: #1a1a1a; font-size: 30rpx; font-weight: 600; line-height: 1.25; text-overflow: ellipsis; white-space: nowrap; }
.menu-dish__description { overflow: hidden; margin-top: 7rpx; color: #888; font-size: 24rpx; line-height: 1.3; text-overflow: ellipsis; white-space: nowrap; }
.menu-dish__meta { display: flex; min-width: 0; align-items: center; gap: 16rpx; margin-top: 9rpx; color: #777; font-size: 24rpx; line-height: 1; }
.menu-dish__time { flex: 0 0 auto; white-space: nowrap; }
.menu-dish__stars { display: flex; align-items: center; gap: 2rpx; }
.menu-dish__star { display: block; width: 20rpx; height: 20rpx; flex: 0 0 20rpx; }
.menu-dish__remove { width: 72rpx; max-width: 72rpx; height: 72rpx; min-width: 72rpx; min-height: 72rpx; flex: 0 0 72rpx; color: #bbb; }
.menu-dish__remove image { width: 32rpx; height: 32rpx; opacity: .72; }
```

Keep `aspectFill` in WXML and retain existing pointer-event rules for the inactive neighboring cards.

- [ ] **Step 3: Check layout-sensitive declarations**

Run: `rg -n "menu-dish__title|menu-dish__description|menu-dish__meta|menu-dish__stars|menu-dish__remove|aspectFill" miniprogram/pages/menu/index.wxss miniprogram/pages/menu/index.wxml`

Expected: title/description are one-line ellipsized, information copy has `min-width: 0`, delete heat target is at least 72rpx, and image mode remains `aspectFill`.

### Task 5: Regression verification and scope audit

**Files:**
- Verify: `miniprogram/pages/menu/index.js`
- Verify: `miniprogram/pages/menu/index.wxml`
- Verify: `miniprogram/pages/menu/index.wxss`
- Verify: `miniprogram/utils/ui.js`
- Verify: `miniprogram/pages/recipes/index.js`

- [ ] **Step 1: Run all available JavaScript tests**

Run: `npm test --if-present` from `E:\Database_Design\server` and `node --test miniprogram/test/ui-v1.test.js` from `E:\Database_Design`.

Expected: existing tests pass; if the server package has no `test` script, use its documented test command without changing production files.

- [ ] **Step 2: Verify no API/schema files changed**

Run: `git diff --name-only -- server database`.

Expected: no output caused by this change.

- [ ] **Step 3: Verify no prohibited menu labels remain**

Run: `rg -n "简单|适中|进阶|困难|暂无简介|制作时间|⏱|category" miniprogram/pages/menu/index.wxml miniprogram/pages/menu/index.js miniprogram/pages/menu/index.wxss`.

Expected: no prohibited menu-card display labels; unrelated confirmation copy or other pages are outside this query.

- [ ] **Step 4: Inspect final diff and preserve unrelated work**

Run: `git diff -- miniprogram/utils/ui.js miniprogram/pages/recipes/index.js miniprogram/pages/menu/index.js miniprogram/pages/menu/index.wxml miniprogram/pages/menu/index.wxss`.

Expected: diff is limited to the shared star helper, menu recipe metadata, card WXML, and card descendant WXSS; existing user changes in other files remain untouched.

- [ ] **Step 5: Commit the implementation**

```bash
git add miniprogram/utils/ui.js miniprogram/pages/recipes/index.js miniprogram/pages/menu/index.js miniprogram/pages/menu/index.wxml miniprogram/pages/menu/index.wxss miniprogram/test/ui-v1.test.js
git commit -m "feat: refine menu dish card metadata"
```
