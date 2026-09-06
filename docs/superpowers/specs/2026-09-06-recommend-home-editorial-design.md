# 推荐首页：编辑式 UI 重构设计

## 范围

仅重构 `miniprogram/pages/recommend` 的初始和加载首页视觉。推荐结果、确认、错误及偏好抽屉维持既有结构、数据绑定、事件和行为。

## 不变量

- 保留 `dateCaption`、`peopleCount`、`modeLabel`、`screen` 与现有数据源。
- 保留 `generate`、`togglePreferences` 及所有 API、跳转、登录、缓存与推荐逻辑。
- 不编辑 JavaScript、全局样式、`app.json` 或原生 tabBar。
- 仅编辑推荐页 WXML、WXSS；新元素为无绑定的展示节点。

## 初始页信息层级

1. 日期。
2. 问候语与“今天吃什么？”标题。
3. 一条短、细的品牌粉色笔触。
4. 两行推荐说明。
5. 256rpx 圆形主 CTA，沿用 `generate`。
6. 轻描边偏好摘要，沿用 `togglePreferences`。
7. 发丝分隔线与三列无卡片价值信息。
8. 浅灰收尾文案。

## 视觉和适配

- 白色背景、约 44rpx 统一左右边距、#111 主文字、灰阶辅助信息与 #eeeeee 分隔线。
- 品牌粉色只用于笔触、CTA 和选中反馈；CTA 是唯一明显的视觉重心。
- 使用流式布局、`env(safe-area-inset-bottom)` 和 tabBar 余量，避免在窄屏和高屏出现溢出或与底部导航重叠。
- 不设置自定义导航、固定顶部元素或胶囊定位，避免覆盖微信原生胶囊。

## 验证

- 运行推荐偏好与 UI 现有测试。
- 静态检查模板事件仍指向既有处理器，JS、API、数据结构和 tabBar 配置均无变更。
