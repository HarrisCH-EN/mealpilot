# 前端 UI 改造交接说明

## 项目边界

- 项目根目录：`E:\Database_Design`
- 只允许在本项目中开发；**不要读取、复制或参考** `E:\Mini_Program\What_To_Eat` 的任何代码、数据或设计。
- 当前目标是微信小程序的 UI/交互升级；后端与数据库继续保留在本机。
- 技术栈：原生微信小程序（WXML、WXSS、JavaScript），不要引入云开发，也不要替换为 Web/H5 框架。

## 当前如何运行

1. 保持后端启动：在 `E:\Database_Design\server` 运行 `npm run dev`。
2. 在微信开发者工具导入 `E:\Database_Design`，点击“编译”。
3. 本地调试允许访问 `http://127.0.0.1:3000`；在开发者工具“详情 → 本地设置”启用“不校验合法域名”。

## 当前小程序结构

小程序目录：`E:\Database_Design\miniprogram`

四个 Tab 页：

| 页面 | 文件夹 | 现有业务 |
| --- | --- | --- |
| 推荐 | `pages/recommend` | 选人数/模式、生成推荐、重新生成、应用到菜单 |
| 菜单 | `pages/menus` | 按日期查看、手动加菜、删除菜品 |
| 菜谱 | `pages/recipes` | 搜索、分类筛选、新增、查看、删除 |
| 设置 | `pages/settings` | 本地登录、创建/加入家庭、复制邀请码、成员和基础洞察 |

全局文件：

- `app.json`：页面和 Tab 配置；保留四个 Tab 的业务含义。
- `app.wxss`：现有全局样式，可整体重做。
- `utils/api.js`：请求封装与本地 API 地址。除非同步修改后端，勿改接口路径或请求字段。

## UI 改造目标

- 风格：简洁、清爽、适合“家庭智能配餐”；不需要复杂插画或图片资源。
- 优先提升信息层级、留白、卡片、表单、空状态、加载状态、错误反馈和删除确认。
- 保持原生组件与轻量代码；手机端优先，避免依赖难以配置的第三方 UI 库。
- 所有可见按钮必须保留真实行为、导航或明确提示；不能为了界面效果放置无响应按钮。
- 推荐页不能取代手动点餐：推荐仅辅助，菜单页必须继续支持手动加菜/删菜。

## 已可调用的 API

基础地址：`http://127.0.0.1:3000/api`。除 `POST /auth/dev-login` 外，均需要 Bearer Token；`utils/api.js` 已自动处理。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| POST | `/auth/dev-login` | 本地演示登录 |
| GET | `/auth/me` | 当前用户和家庭归属 |
| POST | `/families` | 创建家庭，字段 `name` |
| POST | `/families/join` | 加入家庭，字段 `inviteCode` |
| GET | `/families/current` | 家庭及成员列表 |
| GET | `/recipes` | 菜谱列表，支持 `keyword`、`category` |
| GET | `/recipes/:id` | 菜谱和食材明细 |
| POST | `/recipes` | 新建菜谱 |
| PUT | `/recipes/:id` | 更新菜谱 |
| DELETE | `/recipes/:id` | 软删除菜谱 |
| GET | `/ingredients` | 食材列表 |
| GET | `/menus?date=YYYY-MM-DD` | 当日菜单 |
| POST | `/menus/items` | 加菜：`menuDate`、`mealType`、`recipeId`、可选 `note` |
| DELETE | `/menus/items/:id` | 删除菜单菜品 |
| POST | `/recommendations` | 生成推荐：`menuDate`、`mealType`、`peopleCount`、`maxCookMinutes`、`mode` |
| GET | `/insights` | 基础洞察 |

## 已知业务限制（UI 必须如实呈现）

- 当前是本地“演示登录”，不是正式微信授权登录。
- 推荐支持 `balanced`、`healthy`、`quick` 三个模式；页面文案可改为“均衡优先 / 健康优先 / 快手优先”。
- 菜谱食材明细 API 已有，但现有界面尚未做完整的食材行编辑；可在 UI 改造时补足表单交互，调用既有菜谱 POST/PUT 接口的 `ingredients` 数组。
- 偏好、忌口、反馈等数据库表已经存在，但对应后端接口尚未实现；不要制作看似可保存、实际无法保存的交互入口。可以在设置页显示“即将开放”并说明原因，或隐藏入口。
- “应用推荐”当前通过逐道调用 `/menus/items` 写入菜单；请保留成功/失败反馈和防重复点击。

## 推荐的改造顺序

1. 重做 `app.wxss` 的色彩、字号、间距、按钮和卡片基础规范。
2. 先完成推荐、菜单两个高频页，再处理菜谱和设置页。
3. 为每页统一补齐 loading、空数据、网络错误、成功提示、删除二次确认。
4. 在微信开发者工具逐页点击验证：登录 → 推荐 → 应用 → 菜单查看/删菜 → 菜谱查询/新增/删除 → 设置页。

## 给新聊天的任务提示词

```text
请只在 E:\Database_Design 中进行微信小程序前端 UI 改造。不要读取、复制或参考 E:\Mini_Program\What_To_Eat 的任何内容。

项目是“家庭智能配餐系统”，前端位于 E:\Database_Design\miniprogram，技术栈是原生 WXML/WXSS/JavaScript；后端 Express 与 MySQL 已可在本机运行。请先阅读 E:\Database_Design\docs\FRONTEND_HANDOFF.md 和现有 miniprogram 代码，再设计并实施简洁清爽的手机端 UI。

保留四个 Tab：推荐、菜单、菜谱、设置。所有可见按钮必须连接真实功能、跳转或明确提示；推荐只能辅助，不能取代菜单页的手动加菜/删菜。不要引入云开发或大体量第三方 UI 框架。完成后请在微信开发者工具中逐页验证已有功能不回退。
```
