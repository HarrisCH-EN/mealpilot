# 推荐结果页视觉统一设计

## 目标

只优化 `recommend` 页 `screen === 'result'` 的菜品条目、信息层级、总结区与底部操作区，使其与上一轮菜单页菜品卡使用同一套菜名/简介/时长/三星彩级语言；不修改推荐 API、算法、状态机、菜单写入、initial/loading/confirmed 状态或 TabBar。

## 现状

- 推荐结果通过 `withRecipeDetails` 关联 recipes API，当前把 `category` 与 `difficultyText` 直接渲染在 `result-dish__meta`。
- 菜品条目当前有大列表边框、140rpx 图片、相机图标 fallback、主菜胶囊标签。
- 底部已经有 `generate`、`apply`、`backToInitial`、`chooseManually` 四个真实 handler，但返回和自己选使用图片与文字堆叠，返回为黑色，自己选为白底粉色加号。
- `miniprogram/utils/ui.js` 已提供共享 `difficultyStars`，菜单与菜谱页共同使用 3 星映射，点亮星通过 WXSS 滤镜呈深色。

## 设计方案

### 数据与共享语言

`recommend/index.js` 只调整 `withRecipeDetails` 的展示字段：复用 `difficultyStars(recipe.difficulty || item.difficulty || 1)`，增加 `hasDifficulty`，保留真实 `title`、`description`、`cookMinutes`、`coverUrl` 和 `initial`。结果态不再渲染 category/difficultyText；缺失 description 隐藏，非正 cookMinutes 隐藏，无效 difficulty 隐藏。推荐请求、reason、状态切换和 apply 写入保持原样。

### 结果条目

每个 `result-dish` 继续是可点击的整行，结构为 image、copy；copy 内为 title row、description、meta。图片统一 112rpx 方形、20rpx 圆角、`aspectFill`。空图 fallback 改为浅暖灰占位块加首字母，不使用相机 icon。主菜标签保留为同一行轻量粉色文字，不使用胶囊背景。

菜名 30rpx/600/#161616 单行省略；简介 24rpx/#777 单行省略；meta 为时长和 3 个 image 星星，间距 16rpx，星星约 20rpx。条目不再有整体外框，使用 20–24rpx 上下留白；divider 从内容区开始，不贯穿图片。

### 标题、总结与操作层级

标题区域使用日期 23rpx/#999、标题 44rpx/700/#111、副标题 26rpx/#777；副标题与第一条间距约 34rpx。总结保持粉色 8rpx 小圆点、28rpx/600 主总结和 24rpx 灰色辅助说明，不增加复杂背景。

底部操作顺序为第一行“换一组 + 就吃这些”，第二行左右分布两个圆形辅助按钮。`就吃这些` 为约 58% 宽、84rpx 高的粉色 pill；`换一组` 为轻量文字按钮并保留足够热区；返回为 76rpx 粉色圆形白色箭头，自己选为 76rpx 深色圆形白色加号，删除可见文字标签。保留所有原有 handlers 与 disabled/loading 状态。

## 响应式与状态边界

- 结果内容继续使用已有 `result-content--refreshing`、`result-content--confirming` 和入场动画。
- 只新增 result 作用域样式，避免影响 preference sheet、initial、loading、confirmed。
- 小屏通过降低条目图片与操作间距保持单行布局，不改变 TabBar 和安全区。

## 验证

- 静态确认 result WXML 不再渲染 `item.category`、`item.difficultyText`、相机 icon或返回/自己选文字标签。
- 验证结果条目整行仍绑定 recipe detail 跳转，按钮 handlers 仍存在。
- 运行推荐相关单测、WXML 事件绑定检查、JS 语法检查和服务端测试；确认 server/database 无变更。
