# 推荐结果页视觉统一 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans (recommended) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让推荐结果态的菜品信息与菜单页共享菜名/简介/时长/3 星语言，并建立克制的结果页操作层级。

**Architecture:** 只改 `recommend/index.js` 的展示字段映射、`recommend/index.wxml` 的 result 分支和 `recommend/index.wxss` 的 result 作用域样式；共享 `miniprogram/utils/ui.js` 的 `difficultyStars`，不触碰推荐状态机、API、写入逻辑和其他页面。

**Tech Stack:** 微信小程序 WXML/WXSS/JavaScript、现有本地图标与 recipe 图片资源、Node.js tests。

---

### Task 1: Reuse menu metadata mapping in recommend result data

**Files:**
- Modify: `miniprogram/pages/recommend/index.js`
- Modify: `miniprogram/test/ui-v1.test.js`

- [ ] **Step 1: Import the shared star helper**

Add `difficultyStars` to the existing `../../utils/ui` import and remove `difficultyLabel` from that import if it has no remaining use in this file.

- [ ] **Step 2: Normalize result item display fields**

Within `withRecipeDetails`, preserve existing item fields and add:

```js
const rawDifficulty = Number(recipe.difficulty || item.difficulty)
const hasDifficulty = Number.isInteger(rawDifficulty) && rawDifficulty >= 1 && rawDifficulty <= 3
const cookMinutes = Number(recipe.cookMinutes || item.cookMinutes)

return {
  ...item,
  coverUrl: recipe.coverUrl || '',
  initial: String(item.title || '菜').slice(0, 1),
  description: String(recipe.description || item.description || '').trim(),
  cookMinutes: cookMinutes > 0 ? cookMinutes : 0,
  difficulty: hasDifficulty ? rawDifficulty : 0,
  difficultyStars: hasDifficulty ? difficultyStars(rawDifficulty) : [],
  hasDifficulty
}
```

Do not alter `attachRecipeDetails`, recommendation request payload, reason generation, or state transitions.

- [ ] **Step 3: Add static assertions for shared result metadata**

Extend the recommend UI assertions so the result script contains `difficultyStars`, `hasDifficulty`, and no longer contains `difficultyLabel` for result display; assert the result template uses `difficultyStars` and not `item.category`/`item.difficultyText`.

### Task 2: Replace only the result-state WXML subtree

**Files:**
- Modify: `miniprogram/pages/recommend/index.wxml`

- [ ] **Step 1: Keep result-state wrappers and transitions**

Keep `recommend-result`, `result-heading`, `result-content`, `resultMotion`, `regenerating`, `applying`, `recommendation.items`, and all existing state bindings.

- [ ] **Step 2: Make the entire result row clickable**

Use the existing recipe-detail navigation handler on the row:

```xml
<view wx:for="{{recommendation.items}}" wx:key="id" class="result-dish {{index === 0 ? 'result-dish--primary' : ''}}" data-id="{{item.id}}" bindtap="viewRecipeItem">
  <image wx:if="{{item.coverUrl}}" class="result-dish__thumb" src="{{item.coverUrl}}" mode="aspectFill" data-index="{{index}}" binderror="handleImageError" />
  <view wx:else class="result-dish__thumb result-dish__thumb--empty"><text>{{item.initial}}</text></view>
  <view class="result-dish__copy">
    <view class="result-dish__title-row"><text class="result-dish__name">{{item.title}}</text><text wx:if="{{index === 0}}" class="result-dish__role">主菜</text></view>
    <view wx:if="{{item.description}}" class="result-dish__description">{{item.description}}</view>
    <view wx:if="{{item.cookMinutes || item.hasDifficulty}}" class="result-dish__meta">
      <text wx:if="{{item.cookMinutes}}" class="result-dish__time">{{item.cookMinutes}}分钟</text>
      <view wx:if="{{item.hasDifficulty}}" class="result-dish__stars" aria-label="难度 {{item.difficulty}} 星"><image wx:for="{{item.difficultyStars}}" wx:for-item="starActive" wx:for-index="starIndex" wx:key="starIndex" class="result-dish__star {{starActive ? 'result-dish__star--active' : ''}}" src="{{starActive ? '/assets/icons/recipes/star-active.png' : '/assets/icons/recipes/star-inactive.png'}}" mode="aspectFit" /></view>
    </view>
  </view>
</view>
```

- [ ] **Step 3: Simplify secondary action labels**

Keep `bindtap="backToInitial"` and `bindtap="chooseManually"`, but replace their child images/text with native text glyphs `←` and `＋`, remove the visible “返回/自己选” labels, and keep `aria-label` values.

### Task 3: Style the result state as a quiet editorial answer page

**Files:**
- Modify: `miniprogram/pages/recommend/index.wxss`

- [ ] **Step 1: Preserve non-result styles**

Do not modify preference, initial, loading, or confirmed selectors. Replace only the result selectors from `.result-heading` through `.decision-manual`.

- [ ] **Step 2: Apply the result type and item scale**

Use these values:

```css
.result-title { font-size: 44rpx; font-weight: 700; }
.result-subtitle { margin-top: 14rpx; color: #777; font-size: 26rpx; }
.result-list { margin-top: 34rpx; border: 0; border-radius: 0; }
.result-dish { position: relative; min-height: 152rpx; gap: 20rpx; padding: 22rpx 0; border-bottom: 0; }
.result-dish::after { position: absolute; right: 0; bottom: 0; left: 132rpx; height: 1rpx; background: #f0f0f0; content: ''; }
.result-dish__thumb { width: 112rpx; height: 112rpx; flex: 0 0 112rpx; border-radius: 20rpx; }
.result-dish__name { font-size: 30rpx; font-weight: 600; color: #161616; }
.result-dish__role { color: var(--color-primary); font-size: 21rpx; }
.result-dish__description { margin-top: 7rpx; color: #777; font-size: 24rpx; }
.result-dish__meta { display: flex; gap: 16rpx; margin-top: 8rpx; color: #777; font-size: 24rpx; }
.result-dish__stars { display: flex; gap: 2rpx; }
.result-dish__star { width: 20rpx; height: 20rpx; }
.result-dish__star--active { filter: brightness(0) opacity(.87); }
```

- [ ] **Step 3: Apply summary and action hierarchy**

Keep the existing summary content but use a transparent layout with 28rpx summary, 24rpx reason, and an 8rpx pink dot. Style the main CTA row as an 84rpx pill with the confirm button about 58% width; make refresh text-only with a 72rpx minimum touch height; place secondary circular actions at opposite edges with 76rpx buttons, pink `#ff385c` back and dark `#1c1c1c` manual.

- [ ] **Step 4: Add narrow-screen overrides**

For `max-width: 350px`, reduce result row gap to 16rpx, image to 108rpx, divider left inset to 124rpx, and keep action buttons at 72rpx so title/description/meta remain one line.

### Task 4: Verify result-only behavior and scope

**Files:**
- Verify: `miniprogram/pages/recommend/index.js`
- Verify: `miniprogram/pages/recommend/index.wxml`
- Verify: `miniprogram/pages/recommend/index.wxss`
- Verify: `miniprogram/utils/ui.js`

- [ ] **Step 1: Run targeted MiniProgram tests**

Run: `node --test --test-name-pattern="recommend|difficulty stars|recipe images|every visible WXML event" miniprogram/test/ui-v1.test.js`

Expected: all selected tests pass.

- [ ] **Step 2: Run JavaScript syntax checks**

Run: `node --check miniprogram/pages/recommend/index.js; node --check miniprogram/utils/ui.js`.

Expected: exit code 0 with no syntax output.

- [ ] **Step 3: Audit prohibited result markup and untouched APIs**

Run: `rg -n "item\.category|item\.difficultyText|common/photo\.png|>返回<|>自己选<|/recommendations|/menus/items" miniprogram/pages/recommend/index.wxml miniprogram/pages/recommend/index.js`.

Expected: no category/difficulty text or camera fallback in result WXML; API strings remain only in existing JS request code.

- [ ] **Step 4: Confirm no server/database changes**

Run: `git diff --name-only -- server database`.

Expected: no output.
