# 登录页布局调整 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将微信小程序登录页改为单屏固定布局，并调整 logo 与中英文品牌文案的层级顺序。

**Architecture:** 保留现有登录页 WXML 结构和 JavaScript 行为，仅调整品牌区文案顺序与登录页 WXSS 的视口约束、垂直布局和字号间距。使用现有设计令牌与资源，不影响其他页面。

**Tech Stack:** 微信小程序 WXML、WXSS、JavaScript、Node.js test runner。

---

### Task 1: 调整登录页品牌层级与单屏布局

**Files:**
- Modify: `miniprogram/pages/login/index.wxml`
- Modify: `miniprogram/pages/login/index.wxss`

- [x] **Step 1: 更新品牌文案顺序**

在 `.login-brand` 内保留 logo 与现有英文宣传语，将品牌中文名置于英文名之前：

```xml
<view class="login-brand">
  <image class="login-brand__logo" src="/assets/brand/logo.png" mode="aspectFit" />
  <view class="login-brand__name-zh">饭有谱</view>
  <view class="login-brand__name">MealPilot</view>
  <view class="login-brand__subtitle">Plan less. Eat better.</view>
</view>
```

- [x] **Step 2: 固定页面视口并重新分配垂直空间**

更新登录页根容器与 shell：使用 `height: 100vh`、安全区内边距和 `overflow: hidden`，让登录页不产生页面级上下滚动；使用 `justify-content: space-between` 保留顶部品牌、中央登录卡片和底部协议说明。

- [x] **Step 3: 交换品牌字号与间距**

让中文名保持主标题层级（约 `48rpx`），英文名降为副标题层级（约 `28rpx`），并调整两者与 logo、宣传语之间的间距，使 logo 位于内容顶部中央且登录卡片仍在首屏。

- [x] **Step 4: 检查 WXML/WXSS 静态约束**

运行：`git diff --check -- miniprogram/pages/login/index.wxml miniprogram/pages/login/index.wxss`

预期：命令退出码为 `0`，无空白或换行错误。

### Task 2: 验证登录页回归

**Files:**
- Test: `tests/miniprogram/login-page.test.js`

- [x] **Step 1: 运行登录页测试**

运行：`node --test tests/miniprogram/login-page.test.js`

预期：登录页注册、品牌文案、资源、登录事件与共享认证入口测试全部通过。

- [x] **Step 2: 检查改动范围**

运行：`git status --short; git diff --stat`

预期：本次新增或修改只包含登录页实现与本计划/设计文档；不覆盖用户原有的其他未提交改动。

- [x] **Step 3: 做最终需求核对**

逐项确认：页面根容器隐藏溢出；logo 居中且位于品牌文字前；“饭有谱”字号大于“MealPilot”；登录按钮事件、资料弹窗和 JavaScript 未被改动。
