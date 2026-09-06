# 菜单页菜品卡片信息结构设计

## 目标

只调整微信小程序菜单页早餐、午餐、晚餐区域内菜品卡片的信息结构与视觉排版，让每张卡统一展示菜名、简介、制作时长和星级难度；保留现有菜单日期、餐次切换、详情跳转、移除确认、API 和数据库 Schema。

## 现状与约束

- 菜单页当前在 `miniprogram/pages/menu/index.wxml` 中通过 `menu-dish` 展示图片、菜名、简介和 `cookMinutes + difficultyText`。
- 菜谱总览页已经使用 `star-active.png` / `star-inactive.png` 展示 3 星制难度，但星级数组目前局部定义在 `miniprogram/pages/recipes/index.js`。
- `difficultyLabel` 现有映射为 `1 → 简单`、`2 → 适中`、`3 → 进阶`；本次菜单卡不再显示文字难度，但星级仍严格沿用同一 3 星映射。
- 菜谱真实数据来自 recipes API 返回的 `title`、`description`、`cookMinutes`、`difficulty` 与 `coverUrl`；菜单 item 通过 recipeId 关联这些字段。
- 当前工作区已有其他未提交修改，本次只编辑本设计涉及的新增/目标文件，不覆盖用户已有改动。

## 方案

### 共享难度星级 helper

在 `miniprogram/utils/ui.js` 新增 `difficultyStars(value)`，将输入转为 0–3 的安全等级并返回 `[true, false, false]` 形式的 3 项数组。菜谱总览页和菜单页都从该 helper 生成 `difficultyStars`，避免两页各自维护映射规则。未知或缺失难度返回全灰星级数组，同时菜单模板按是否存在有效 difficulty 决定是否展示星级。

### 菜单数据 enrich

保留现有 `enrichMenus` 的关联方式和字段来源，仅增加 `difficultyStars` 与有效难度标识，并继续把缺失的简介标准化为空字符串、缺失时长标准化为 0。菜单模板以 `cookMinutes` 和 `difficultyStars` 的有效状态控制对应元素，避免出现 `undefined分钟`、异常星级或分类替代信息。

### 菜单卡 DOM/WXML

每个 `menu-dish` 维持图片、信息区、删除按钮三个同级区域：

```text
menu-dish
├── menu-dish__photo / menu-dish__photo--fallback
├── menu-dish__copy
│   ├── menu-dish__title
│   ├── menu-dish__description（仅 description 非空）
│   └── menu-dish__meta
│       ├── menu-dish__time（仅 cookMinutes 有效）
│       └── menu-dish__stars（仅 difficulty 有效，内部复用菜谱星星图片）
└── menu-dish__remove
```

信息区使用 `flex: 1; min-width: 0`，菜名和简介各限制单行省略；图片继续 `aspectFill`。删除按钮保留现有 `remove` handler，扩大到至少 72rpx 点击热区，图标保持约 30–34rpx 且使用中性灰，不改变确认弹窗的危险色。

### 视觉规则

- 菜名约 30rpx、600 权重、深色；简介 24rpx、灰色、单行省略；第三行 24rpx 左右，时长与星级间距约 16rpx。
- 星级使用菜谱总览页已有 active/inactive PNG，继承深色/浅灰的稳定渲染，不使用 emoji；尺寸约 20rpx，星间距约 2rpx。
- 图片保持约 120rpx 方形与 22rpx 圆角，三行信息整体垂直居中。
- 早餐、午餐、晚餐继续共用同一套 `menu-dish` markup/classes。

## 错误与缺失数据

- `description` 为空时不渲染简介节点。
- `cookMinutes` 非正数时不渲染时长。
- `difficulty` 缺失/非 1–3 时不渲染星级，避免误导；有效值按共享 helper 输出 3 星。
- `coverUrl` 仍沿用现有 fallback 图与 `handleImageError`。

## 验证

- 运行现有 `npm test`（根目录若无脚本则运行 `server` 与 `miniprogram` 已有测试命令）。
- 用静态检查确认 WXML 不再引用 `difficultyText` 或“简单/适中/进阶”作为菜单卡难度展示，不再显示分类 fallback。
- 通过现有 UI 校验脚本/小程序开发者工具检查长菜名、长简介、缺失描述/时长/难度，以及早餐、午餐、晚餐三种餐次的卡片布局。
- 确认 `server/`、数据库文件、菜单 API 调用和现有事件 handler 未被修改。
