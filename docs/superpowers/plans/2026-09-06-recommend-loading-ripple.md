# 推荐加载水波过渡 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为既有“帮我选”加载过程增加品牌粉色水波与淡出过渡，而不改变推荐行为。

**Architecture:** WXML 在已有 `screen === 'loading'` 分支中增加一个无事件、无数据的水波展示层；WXSS 用两个圆环与初始页 opacity 动画表现扩散和淡出。`generate` 仍负责原来的 loading、请求和结果切换，结果页继续复用既有入场动画。

**Tech Stack:** 微信小程序 WXML、WXSS、Node.js 内置测试运行器。

---

### Task 1: 为水波视觉建立失败的静态回归用例

**Files:**
- Modify: `E:/Database_Design/miniprogram/test/ui-v1.test.js`
- Test: `E:/Database_Design/miniprogram/test/ui-v1.test.js`

- [ ] **Step 1: 添加展示层、既有事件和 keyframe 断言**

在推荐首页测试中添加：

```js
assert.match(template, /wx:if="\{\{screen === 'loading'\}\}" class="recommend-loading-ripple"/)
assert.match(template, /recommend-loading-ripple__ring/)
assert.match(template, /decision-cta[^>]*bindtap="generate"/)
assert.match(css, /\.recommend-initial--loading\s*\{[^}]*animation:\s*recommend-home-fade/s)
assert.match(css, /@keyframes recommend-ripple-expand/)
assert.match(css, /@keyframes recommend-home-fade/)
```

- [ ] **Step 2: 运行目标测试确认失败**

Run: `node --test miniprogram/test/ui-v1.test.js --test-name-pattern="recommend home keeps"`

Expected: FAIL，原因是 `recommend-loading-ripple` 尚不存在。

### Task 2: 添加 loading 条件下的纯展示水波层

**Files:**
- Modify: `E:/Database_Design/miniprogram/pages/recommend/index.wxml:15-27`

- [ ] **Step 1: 在 loading 提示之后插入水波层**

```xml
<view wx:if="{{screen === 'loading'}}" class="recommend-loading-ripple" aria-hidden="true">
  <view class="recommend-loading-ripple__ring recommend-loading-ripple__ring--one"></view>
  <view class="recommend-loading-ripple__ring recommend-loading-ripple__ring--two"></view>
</view>
```

- [ ] **Step 2: 确认不改变原绑定或脚本**

Run: `rg -n 'bindtap="generate"|screen === .loading.|request\(' miniprogram/pages/recommend/index.wxml miniprogram/pages/recommend/index.js`

Expected: `generate` 和 `/recommendations` 均保持现状；没有编辑 `index.js`。

### Task 3: 实现水波扩散与首页淡出动画

**Files:**
- Modify: `E:/Database_Design/miniprogram/pages/recommend/index.wxss:1-70`

- [ ] **Step 1: 为 loading 首页添加淡出动画**

```css
.recommend-initial--loading { animation: recommend-home-fade 700ms ease-out both; }
@keyframes recommend-home-fade { from { opacity: 1; } to { opacity: .18; } }
```

- [ ] **Step 2: 添加固定但不拦截的两个扩散圆环**

```css
.recommend-loading-ripple { position: fixed; inset: 0; z-index: 20; overflow: hidden; pointer-events: none; }
.recommend-loading-ripple__ring { position: absolute; top: 50%; left: 50%; width: 256rpx; height: 256rpx; border: 2rpx solid rgba(255, 56, 92, .38); border-radius: 50%; transform: translate(-50%, -50%) scale(.8); animation: recommend-ripple-expand 700ms cubic-bezier(.2, .7, .25, 1) both; }
.recommend-loading-ripple__ring--two { animation-delay: 120ms; }
@keyframes recommend-ripple-expand { from { opacity: .72; transform: translate(-50%, -50%) scale(.8); } to { opacity: 0; transform: translate(-50%, -50%) scale(5); } }
```

- [ ] **Step 3: 运行前端推荐测试**

Run: `node --test miniprogram/test/ui-v1.test.js miniprogram/test/recommend-preferences.test.js`

Expected: PASS。

### Task 4: 完整验证与范围审计

**Files:**
- Test: `E:/Database_Design/miniprogram/test/ui-v1.test.js`
- Test: `E:/Database_Design/miniprogram/test/recommend-preferences.test.js`
- Test: `E:/Database_Design/server/test/recommendation.test.js`

- [ ] **Step 1: 执行全部小程序测试与服务端推荐测试**

Run: `node --test miniprogram/test/*.test.js; node --test server/test/recommendation.test.js`

Expected: 全部 PASS。

- [ ] **Step 2: 确认业务文件未被更改**

Run: `git diff -- miniprogram/pages/recommend/index.js miniprogram/utils/api.js miniprogram/app.json`

Expected: 本次无新增差异；只有 WXML、WXSS 和静态测试包含水波内容。
