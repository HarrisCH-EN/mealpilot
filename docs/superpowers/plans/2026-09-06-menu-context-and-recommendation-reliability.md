# 菜单上下文与推荐可靠性 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让菜单日期和餐次在跨页操作中保持连续，并将推荐采纳改为可追溯、原子且可重复调用的操作。

**Architecture:** 小程序以小型 `menu-context` 模块在 Tab 跳转间传递一次性意图；详情页参数保留菜单来源。Express 将推荐批次写入既有关系表，并以一个事务应用批次，菜单项插入保持幂等且不覆盖人工备注。

**Tech Stack:** 原生微信小程序 JavaScript、Node.js `node:test`、Express 5、mysql2、MySQL 8。

---

### Task 1: 一次性菜单上下文

**Files:**
- Create: `miniprogram/utils/menu-context.js`
- Modify: `miniprogram/test/ui-v1.test.js`

- [ ] 写出会失败的测试：保存 `add` 意图后只能被同一 action 消费一次，消费后为空；`focus` 不能被菜谱页误消费。
- [ ] 运行 `node --test miniprogram/test/ui-v1.test.js`，确认测试因模块不存在而失败。
- [ ] 实现 `setMenuContext`、`consumeMenuContext` 和 `clearMenuContext`，使用 `getApp().globalData` 存放 `{ action, menuDate, mealType, menuItemId }`。
- [ ] 重跑测试并确认通过。

### Task 2: 从菜单携带日期和餐次

**Files:**
- Modify: `miniprogram/pages/menu/index.js`
- Modify: `miniprogram/pages/menu/index.wxml`
- Modify: `miniprogram/pages/recipes/index.js`
- Test: `miniprogram/test/ui-v1.test.js`

- [ ] 写会失败的静态与纯函数测试，断言空餐次按钮带 `data-meal-type`，菜单页保存所选日期/餐次，菜谱页在打开加菜面板时消费 `add` 意图。
- [ ] 运行目标测试，确认失败。
- [ ] 在顶部加菜使用活动餐次，在空卡加菜使用卡片餐次；菜谱页仅在 `openAdd` 读取意图，不再无条件重置到今天晚餐。
- [ ] 重跑测试并确认通过。

### Task 3: 详情页的已加入状态与菜单回跳

**Files:**
- Modify: `miniprogram/pages/menu/index.js`
- Modify: `miniprogram/pages/recipe-detail/index.js`
- Modify: `miniprogram/pages/recipe-detail/index.wxml`
- Test: `miniprogram/test/ui-v1.test.js`

- [ ] 写会失败的测试，断言菜单详情链接携带日期、餐次、菜单项 ID，详情模板能渲染已加入文案和查看菜单动作。
- [ ] 运行目标测试，确认失败。
- [ ] 解析详情参数；有菜单来源时改主操作为查看菜单，并用 `focus` 意图回到同一日期餐次；无来源时保留正常加入面板。
- [ ] 重跑测试并确认通过。

### Task 4: 防止重复加菜覆盖备注

**Files:**
- Modify: `server/src/routes/menus.js`
- Create: `server/test/menu-item-service.test.js`
- Modify: `miniprogram/pages/recipes/index.js`
- Modify: `miniprogram/pages/recipe-detail/index.js`

- [ ] 写会失败的数据库适配器测试，断言已有菜单项返回 `already-present` 且不执行 UPDATE，新菜返回 `created`。
- [ ] 运行 `npm test -- menu-item-service.test.js`，确认失败。
- [ ] 提取可注入数据库的 `addMenuItem` 服务；路由使用服务，页面按返回状态显示已存在而非新增成功。
- [ ] 运行服务测试和完整后端、小程序测试，确认通过。

### Task 5: 推荐批次持久化及原子采纳

**Files:**
- Create: `server/src/services/recommendation-run-service.js`
- Modify: `server/src/routes/menus.js`
- Create: `server/test/recommendation-run-service.test.js`
- Modify: `miniprogram/pages/recommend/index.js`

- [ ] 写会失败的服务测试：持久化生成结果创建 run 和 items；采纳在一个连接事务内创建菜单且只插入缺失项；任一 SQL 错误触发回滚。
- [ ] 运行 `npm test -- recommendation-run-service.test.js`，确认失败。
- [ ] 在生成接口写入批次并返回 `runId`；添加 `POST /recommendations/:id/apply`，前端以它取代逐道请求。
- [ ] 运行完整后端与小程序测试，确认通过。

### Task 6: 保留现有会话、诚实展示偏好

**Files:**
- Modify: `miniprogram/pages/recommend/index.js`
- Modify: `miniprogram/pages/recommend/index.wxml`
- Modify: `miniprogram/test/recommend-preferences.test.js`

- [ ] 写会失败的测试：有 token 时 `ensureLogin` 走会话验证而非 `devLogin`；偏好文案包含“暂不影响本次推荐”。
- [ ] 运行 `node --test miniprogram/test/recommend-preferences.test.js`，确认失败。
- [ ] 仅无 token 时演示登录；令牌存在时请求 `/auth/me`。将口味和限制说明为本机草稿，保留可编辑性但不作后端筛选承诺。
- [ ] 重跑全部测试并确认通过。
