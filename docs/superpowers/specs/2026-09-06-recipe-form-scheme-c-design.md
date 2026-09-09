# Recipe Form 方案 C 重构设计

## 当前实现审计

- WXML 已有自定义导航、单封面展示、基础信息、食材编辑 Sheet 和步骤编辑列表，但仍以“章节标题 + 大卡片 + 开发说明”为主，不能形成“图片 → 基础信息 → 食材 → 步骤”的连续编辑节奏。
- WXSS 使用了较重的边框/阴影、重复的辅助说明、食材删除粉色圆底和过大的步骤标题，且 Hero 高度不足；基础信息的时间/份量仍是后台表单式文案。
- JS 已有真实业务逻辑：根据系统状态栏与微信胶囊计算导航高度，加载 `/ingredients` 与 `/recipes/:id`，食材新增/编辑/去重/删除，步骤 parse、编辑、排序、删除、添加，保存时通过现有 payload 调用 POST/PUT。
- 数据边界已确认：菜品只有 `coverUrl` 单封面；没有上传接口，不增加更换图片假入口；食材没有图片字段；步骤仍通过单个 TEXT 字段存储。

## 设计方案

采用方案 C 的沉浸式大图编辑页：纯白页面，自定义安全区导航，Hero 使用统一水平边距和 4:3 `aspectFill` 大图；Hero 下方为浅灰白基础信息编辑卡，分类/难度/时间/份量使用 2×2 metadata grid；食材与步骤使用同一水平边界的轻量管理卡，行内只保留真实可用的编辑、排序、删除动作。

统一设计 token：页面水平 padding 32rpx；Hero 圆角 36rpx；主卡圆角 30rpx；子卡圆角 22rpx；导航标题 32rpx/600；区块标题 36rpx/700；正文输入 28rpx；label 22rpx；主题粉只用于保存、添加、步骤编号、focus/active。所有图标通过 `/assets/icons/.../*.png` 引用，不使用 WXML `icon` 组件。

导航继续使用 `wx.getMenuButtonBoundingClientRect()` 计算 `statusBarHeight`、胶囊底部和右侧安全区；保存按钮位于胶囊左侧，标题绝对居中，内容滚动区域通过动态 padding-top 避免遮挡。返回动作增加 dirty-state 轻量确认；保存成功仍按现有真实返回逻辑执行。

食材点击整行打开底部 Sheet；步骤每项保留稳定 key，序号由数组索引实时显示，保存前调用现有 `serializeRecipeSteps`。空状态使用文字提示；不虚构多图、食材图片、步骤图片或后端字段。

## 文件范围

- 修改 `miniprogram/pages/recipe-form/index.wxml`：重建页面层级，删除开发者说明和假图片动作，保留真实事件绑定。
- 修改 `miniprogram/pages/recipe-form/index.wxss`：清理旧布局并建立方案 C 的白底、Hero、卡片、sheet 和安全区样式。
- 修改 `miniprogram/pages/recipe-form/index.js`：加入 dirty-state 基线、返回确认和空状态所需展示字段；保留 API contract 与步骤/食材序列化逻辑。
- 修改 `miniprogram/test/ui-v1.test.js`：增加 recipe-form 结构、PNG 图标、单封面边界、步骤兼容和 dirty-state 合约。
- 新增 `docs/superpowers/plans/2026-09-06-recipe-form-scheme-c.md`：记录实现与验证步骤。

## 验证标准

运行 recipe-form 相关 Node 测试、完整 `miniprogram/test/ui-v1.test.js`、JS 语法检查；如环境可用，再运行 `scripts/verify-recipe-ui.js` 进行编辑模式、食材 Sheet 和步骤新增的真实小程序自动化检查。最终检查 API routes、数据库 Schema 与 `git diff`，确保未被修改。
