# Recipe Form 方案 C 重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将微信小程序 `recipe-form` 重构为方案 C 的大图驱动菜谱编辑器，同时保留当前真实 API、单封面、食材编辑和步骤 TEXT 兼容能力。

**Architecture:** WXML/WXSS 只重建呈现层和交互层级；JS 继续以现有 `form`、`ingredientDraft`、`stepItems` 作为 view model，并新增 dirty-state 基线与未保存离开确认。保存 payload 不增加字段、不改服务端接口，封面只读展示。

**Tech Stack:** 微信小程序 WXML/WXSS/JavaScript、Node.js `node:test`、现有 miniprogram-automator 验证脚本。

---

### Task 1: 为方案 C 建立失败的页面契约

**Files:**
- Modify: `miniprogram/test/ui-v1.test.js`
- Test: `miniprogram/pages/recipe-form/index.wxml`
- Test: `miniprogram/pages/recipe-form/index.wxss`

- [x] **Step 1: 写入失败测试**：要求模板出现自定义导航、Hero、基础信息 2×2 metadata、食材/步骤 header、单封面 fallback、PNG 图标和 ingredient sheet；同时禁止 `<icon>`、`chooseImage`、开发说明、假更换图片入口和旧 `form-cover`/`editor-section__header` 结构。
- [x] **Step 2: 运行聚焦测试确认失败**：`node --test --test-name-pattern "recipe form scheme C" miniprogram/test/ui-v1.test.js`，失败原因应来自旧 WXML/WXSS 尚未满足契约。

### Task 2: 重建 recipe-form WXML/WXSS

**Files:**
- Modify: `miniprogram/pages/recipe-form/index.wxml`
- Modify: `miniprogram/pages/recipe-form/index.wxss`

- [x] **Step 1: 重建模板**：导航保留 `navStyle` 与现有保存事件；Hero 只根据真实 `coverUrl` 渲染 `aspectFill` 图片或清晰空状态；基础信息使用菜名 input、介绍 textarea 和 2×2 metadata；食材行只显示拖拽 PNG、名称/备注、用量和弱删除 PNG；步骤行保留序号、上下移/删除 PNG 和 textarea；Sheet 改为紧凑编辑布局。
- [x] **Step 2: 重写样式**：删除旧的粉色大面积背景、重复说明、重阴影和长删除底；建立 `--page-padding:32rpx`、Hero 4:3、统一圆角、纯白背景、卡片浅灰白、标题/正文/label 字体层级与 safe-area 底部空间。
- [x] **Step 3: 运行契约测试**：同一聚焦命令应通过，且模板中所有可见图标均为 `/assets/icons/...png`。

### Task 3: 增加 dirty-state 与交互兼容

**Files:**
- Modify: `miniprogram/pages/recipe-form/index.js`
- Modify: `miniprogram/test/ui-v1.test.js`

- [x] **Step 1: 写入失败测试**：要求初始化后记录可比较的 form/steps 基线；字段、食材、步骤变化后 `isDirty` 为 true；返回时对 dirty 表单调用 `wx.showModal`，取消继续编辑，确认后返回；保存成功更新导航行为但不改变 payload 字段。
- [x] **Step 2: 运行测试确认失败**：`node --test --test-name-pattern "recipe form dirty state" miniprogram/test/ui-v1.test.js`。
- [x] **Step 3: 实现最小逻辑**：用稳定 JSON snapshot 比较 `form` 与 `stepItems`；加载新建/编辑数据后设置基线；在 `updateField`、picker、食材确认/删除、步骤编辑/新增/删除/排序后刷新 dirty 状态；`back()` 仅在 dirty 时弹出“修改尚未保存，确定退出吗？”，不改变保存 payload。
- [x] **Step 4: 运行聚焦测试并检查 JS**：`node --test --test-name-pattern "recipe form dirty state" miniprogram/test/ui-v1.test.js` 与 `node --check miniprogram/pages/recipe-form/index.js`。

### Task 4: 完成方案 C 页面回归验证

**Files:**
- Verify: `miniprogram/pages/recipe-form/*`
- Verify: `miniprogram/utils/ui.js`
- Verify: `server/src/routes/recipes.js`
- Verify: `database/01_schema.sql`

- [x] **Step 1: 运行前端完整测试**：`node --test miniprogram/test/ui-v1.test.js`，记录任何与本次无关的基线失败。
- [x] **Step 2: 运行服务端完整测试**：`npm test`（workdir `server`），确认 API/Schema 相关测试通过。
- [x] **Step 3: 运行自动化 UI 脚本（若微信自动化端点可用）**：设置 `RECIPE_UI_OUTPUT_ROOT` 后执行 `node scripts/verify-recipe-ui.js`，确认编辑模式加载、食材 Sheet、步骤新增；如端点不可用，报告为环境限制而非代码结论。
- [x] **Step 4: 做差异审计**：`git diff --stat`、`git diff -- miniprogram/pages/recipe-form miniprogram/test/ui-v1.test.js` 和 API/Schema 路径状态，确认仅修改页面、测试、文档且未修改后端 contract。
