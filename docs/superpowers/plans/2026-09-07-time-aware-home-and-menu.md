# 首页问候与今日菜单时段默认 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 使用设备本地时间显示首页问候语，并在菜单页首次查看或返回今天时默认激活对应的早餐、午餐或晚餐。

**Architecture:** `utils/ui.js` 提供不依赖小程序运行时的时间映射纯函数。推荐页在初始 data 计算展示文案；菜单页通过非响应式的一次性标记，只在首次加载和“回到今天”时采用时间餐次，外部 `focus` 上下文和用户手动选择保持更高优先级。

**Tech Stack:** 微信小程序 JavaScript/WXML、Node.js 内置测试运行器。

---

### Task 1: 为共享时间映射添加失败的单元测试

**Files:**
- Modify: `E:/Database_Design/miniprogram/test/ui-v1.test.js:7-20`
- Test: `E:/Database_Design/miniprogram/test/ui-v1.test.js`

- [ ] **Step 1: 从 UI 工具导入新函数并添加边界断言**

```js
const { getGreeting, getCurrentMealType } = require('../utils/ui')

test('time helpers map local hour to the approved greeting and meal windows', () => {
  assert.equal(getGreeting(4), '晚上好，')
  assert.equal(getGreeting(5), '早上好，')
  assert.equal(getGreeting(8), '早上好，')
  assert.equal(getGreeting(9), '上午好，')
  assert.equal(getGreeting(11), '上午好，')
  assert.equal(getGreeting(12), '下午好，')
  assert.equal(getGreeting(17), '下午好，')
  assert.equal(getGreeting(18), '晚上好，')
  assert.equal(getCurrentMealType(4), 'dinner')
  assert.equal(getCurrentMealType(5), 'breakfast')
  assert.equal(getCurrentMealType(10), 'breakfast')
  assert.equal(getCurrentMealType(11), 'lunch')
  assert.equal(getCurrentMealType(16), 'lunch')
  assert.equal(getCurrentMealType(17), 'dinner')
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test miniprogram/test/ui-v1.test.js --test-name-pattern="time helpers map"`

Expected: FAIL，原因是 `getGreeting` 与 `getCurrentMealType` 尚未导出。

### Task 2: 实现页面无关的本地时间映射

**Files:**
- Modify: `E:/Database_Design/miniprogram/utils/ui.js:1-150`
- Test: `E:/Database_Design/miniprogram/test/ui-v1.test.js`

- [ ] **Step 1: 在 `difficultyStars` 前定义两个纯函数**

```js
function normalizeHour(hour) {
  const value = Number(hour)
  return Number.isInteger(value) && value >= 0 && value <= 23 ? value : new Date().getHours()
}

function getGreeting(hour) {
  const value = normalizeHour(hour)
  if (value >= 5 && value <= 8) return '早上好，'
  if (value >= 9 && value <= 11) return '上午好，'
  if (value >= 12 && value <= 17) return '下午好，'
  return '晚上好，'
}

function getCurrentMealType(hour) {
  const value = normalizeHour(hour)
  if (value >= 5 && value <= 10) return 'breakfast'
  if (value >= 11 && value <= 16) return 'lunch'
  return 'dinner'
}
```

- [ ] **Step 2: 在 `module.exports` 中导出它们**

```js
  getCurrentMealType,
  getGreeting,
```

- [ ] **Step 3: 运行新测试确认通过**

Run: `node --test miniprogram/test/ui-v1.test.js --test-name-pattern="time helpers map"`

Expected: PASS。

### Task 3: 让推荐页绑定实时问候语

**Files:**
- Modify: `E:/Database_Design/miniprogram/pages/recommend/index.js:1-105`
- Modify: `E:/Database_Design/miniprogram/pages/recommend/index.wxml:8-14`
- Test: `E:/Database_Design/miniprogram/test/ui-v1.test.js`

- [ ] **Step 1: 导入函数并在 data 中计算问候语**

将 `getGreeting` 加入现有 UI 工具导入，并在 `dateCaption` 后添加：

```js
    greeting: getGreeting(new Date().getHours()),
```

- [ ] **Step 2: 用绑定替换固定文字**

```xml
<view class="recommend-greeting">{{greeting}}</view>
```

- [ ] **Step 3: 添加静态绑定检查**

```js
assert.match(recommendTemplate, /class="recommend-greeting">\{\{greeting\}\}/)
assert.match(recommendScript, /greeting:\s*getGreeting\(new Date\(\)\.getHours\(\)\)/)
```

- [ ] **Step 4: 运行推荐相关测试**

Run: `node --test miniprogram/test/ui-v1.test.js miniprogram/test/recommend-preferences.test.js`

Expected: PASS，`generate`、`togglePreferences` 和推荐 API 断言不变。

### Task 4: 仅在指定时机为今日菜单应用时间默认餐次

**Files:**
- Modify: `E:/Database_Design/miniprogram/pages/menu/index.js:1-185, 238-345`
- Modify: `E:/Database_Design/miniprogram/test/ui-v1.test.js`

- [ ] **Step 1: 导入共享餐次函数并定义餐次索引工具**

```js
const { difficultyStars, getCurrentMealType, normalizeMeals, toLocalISODate } = require('../../utils/ui')
const MEAL_TYPES = ['breakfast', 'lunch', 'dinner']
const mealIndexForType = (mealType) => Math.max(0, MEAL_TYPES.indexOf(mealType))
```

- [ ] **Step 2: 只在首次加载和回到今天时设置一次性标记**

在 `onLoad` 的第一行添加：

```js
this.shouldUseCurrentMealDefault = true
```

将 `returnToday` 改为：

```js
returnToday() {
  this.shouldUseCurrentMealDefault = true
  this.setSelectedDate(this.data.today, { scrollMode: 'center' })
}
```

在 `selectDate` 与 `selectCalendarDate` 的调用前添加 `this.shouldUseCurrentMealDefault = false`，并保留现有 `preferMealWithItems: true` 参数。

- [ ] **Step 3: 保证外部 focus 优先且仅使用一次**

将 `onShow` 中的索引计算替换为：

```js
const activeMealIndex = MEAL_TYPES.indexOf(context.mealType)
this.pendingFocusedMealIndex = activeMealIndex >= 0 ? activeMealIndex : null
this.shouldUseCurrentMealDefault = false
```

保留当前 `setData` 与 `setSelectedDate(context.menuDate, { scrollMode: 'reveal' })`。这样在随后的 `load()` 中仍可读取相同的 focus 索引。

- [ ] **Step 4: 在 `load()` 中按照优先级选择激活餐次**

将 `activeMealIndex` 计算替换为：

```js
const focusedMealIndex = this.pendingFocusedMealIndex
const useTimeDefault = this.shouldUseCurrentMealDefault && this.data.date === this.data.today
const activeMealIndex = Number.isInteger(focusedMealIndex)
  ? focusedMealIndex
  : useTimeDefault
    ? mealIndexForType(getCurrentMealType(new Date().getHours()))
    : this.preferMealWithItemsOnLoad
      ? getPreferredMealIndex(menus, this.data.activeMealIndex)
      : this.data.activeMealIndex
this.pendingFocusedMealIndex = null
this.shouldUseCurrentMealDefault = false
this.preferMealWithItemsOnLoad = false
```

- [ ] **Step 5: 添加优先级静态回归检查**

```js
assert.match(menuScript, /pendingFocusedMealIndex/)
assert.match(menuScript, /shouldUseCurrentMealDefault/)
assert.match(menuScript, /this\.data\.date === this\.data\.today/)
assert.match(menuScript, /getCurrentMealType\(new Date\(\)\.getHours\(\)\)/)
assert.match(menuScript, /returnToday\(\)[\s\S]*shouldUseCurrentMealDefault = true/)
```

- [ ] **Step 6: 运行菜单和全量前端测试**

Run: `node --test miniprogram/test/ui-v1.test.js miniprogram/test/recommend-preferences.test.js`

Expected: PASS，菜单滑动、`focus`、日期选择与菜品优先断言保持通过。

### Task 5: 完整回归与边界审计

**Files:**
- Test: `E:/Database_Design/miniprogram/test/ui-v1.test.js`
- Test: `E:/Database_Design/miniprogram/test/recommend-preferences.test.js`
- Test: `E:/Database_Design/server/test/recommendation.test.js`

- [ ] **Step 1: 执行所有可执行前端与推荐服务测试**

Run: `node --test miniprogram/test/*.test.js; node --test server/test/recommendation.test.js`

Expected: 全部 PASS。

- [ ] **Step 2: 审计不变量**

Run: `git diff -- miniprogram/utils/api.js miniprogram/app.json server/src database`

Expected: 无输出；只允许 `utils/ui.js`、推荐页、菜单页和测试出现此次变更。
