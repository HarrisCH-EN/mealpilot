# 设置页现代面板风格 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将设置页重构为方案 D 的白底家庭 Dashboard，同时保留现有真实数据、API 和交互。

**Architecture:** 仅修改设置页的 WXML/WXSS/JS/JSON。WXML 负责新的 Header、账户卡、三列快捷卡和两个设置组；JS 继续使用既有请求与事件函数，仅补充家庭信息弹窗、真实成员计数/缓存状态和安全的交互映射；WXSS 建立小型 token 系统，并用 flex 完成主布局。

**Tech Stack:** 微信小程序 WXML、WXSS、JavaScript、原生 `wx.*` API；Node.js 现有测试脚本。

---

### Task 1: 重组设置页模板

**Files:**
- Modify: `miniprogram/pages/settings/index.wxml`

- [ ] **Step 1: 保留加载、未登录和错误分支**

继续使用 `loading`、`error`、`user.display_name` 条件，保留演示登录按钮和已有 handler。

- [ ] **Step 2: 替换已登录内容结构**

按以下顺序组织 `.settings-content`：`.settings-header`、`.settings-profile`、家庭管理标题与 `.settings-dashboard`、饮食与账户组、更多组。三张快捷卡分别绑定 `showFamilyInfo`、`copyCode`、`toggleMembers`，成员展开列表放在 Dashboard 卡片下方并继续使用真实 `family.members`。

- [ ] **Step 3: 为不可用项移除误导性导航 affordance**

口味偏好、成员忌口、账号、帮助与反馈保留状态文案并绑定 `showUnavailable`，不渲染 chevron；关于我们、洞察和清理缓存继续渲染 chevron，且仅在其已有真实 handler 的位置出现。

### Task 2: 实现页面设计系统与响应式布局

**Files:**
- Modify: `miniprogram/pages/settings/index.wxss`

- [ ] **Step 1: 建立白底和统一 token**

使用 `#FFFFFF` 页面背景、`#FAFAFA` 普通组、`#FFF5F7` 快捷卡、`#FF4F7B` 强调色；统一 `32rpx` 页面边距、`28rpx/24rpx` 容器圆角、浅 divider 和无明显阴影。

- [ ] **Step 2: 使用 flex 实现 Dashboard 三列等宽卡**

`.settings-dashboard` 使用 `display:flex` 和 `gap:16rpx`，`.settings-quick-card` 使用 `flex:1`、相同 `min-height` 与统一 icon/title/subtitle 对齐；窄屏媒体规则缩小卡内 padding 和字号，不写死卡片宽度。

- [ ] **Step 3: 统一设置组行的 baseline 和 pressed 状态**

设置行统一高度、icon 盒、copy 区和右侧 value/chevron 对齐；只给真实可点击行添加 `:active` 轻微透明度/缩放，不给 disabled 行提供可点击视觉。

- [ ] **Step 4: 添加克制的 CSS 家庭装饰和底部安全区**

Header 使用相对容器承载 CSS 房屋/树/爱心装饰，装饰不覆盖标题区域；页面底部 padding 使用 `calc(132rpx + env(safe-area-inset-bottom))`，保证原生 TabBar 和系统安全区不遮挡内容。

### Task 3: 补齐真实数据展示和家庭信息交互

**Files:**
- Modify: `miniprogram/pages/settings/index.js`

- [ ] **Step 1: 初始化真实 cache label**

将 `cacheLabel` 初始化为空字符串，并在 `refresh` 前调用 `getCacheLabel`；只基于已有临时缓存 key 展示“可清理”状态，不生成容量数字。

- [ ] **Step 2: 增加家庭信息 modal handler**

新增 `showFamilyInfo()`：没有家庭数据时提示“暂时没有家庭信息”；有数据时使用 `membership.family_name`、`membership.role` 和 `family.members.length` 拼出 modal 内容，不创建新页面、不引入假数据。

- [ ] **Step 3: 保留并复用现有异步行为**

不改变 `/auth/me`、`/families/current`、`/insights`、家庭创建/加入、邀请码复制、清理缓存的请求和确认逻辑。

### Task 4: 更新页面元信息并执行验证

**Files:**
- Modify: `miniprogram/pages/settings/index.json`
- Test: `miniprogram/test/ui-v1.test.js`, `server/test/*.test.js`

- [ ] **Step 1: 将设置页原生导航背景设为白色**

使用 `navigationStyle: "custom"`，在 JS 中根据状态栏和 `wx.getMenuButtonBoundingClientRect()` 动态设置页面顶部留白；不添加返回按钮或假 TabBar，将页面背景元信息与白底 UI 对齐。

- [ ] **Step 2: 静态校验事件和资源**

运行 `rg "bindtap=|src=" miniprogram/pages/settings/index.wxml`，逐项确认 handler 在 `index.js` 存在、引用的 icon 文件存在。

- [ ] **Step 3: 运行测试和语法检查**

运行 `npm test --prefix server`、`node --check miniprogram/pages/settings/index.js`，再运行仓库已有 UI 检查脚本（若其入口存在）。预期现有测试通过，设置页 JS 无语法错误。

- [ ] **Step 4: 检查变更边界**

运行 `git diff -- miniprogram/pages/settings/index.wxml miniprogram/pages/settings/index.wxss miniprogram/pages/settings/index.js miniprogram/pages/settings/index.json` 和 `git status --short`，确认没有数据库/API/其他 Tab 页面修改。
