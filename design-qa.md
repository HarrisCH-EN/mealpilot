# 菜谱模块第二轮视觉 QA

> 历史视觉审计记录：本文记录 2026-09-05 的截图和环境，保留用于追溯。当前功能、测试和交付状态以 [docs/CURRENT_VERSION.md](/E:/Database_Design/docs/CURRENT_VERSION.md) 与 [交付前审计报告](/E:/Database_Design/docs/reports/2026-09-16-release-audit.md) 为准。

## 对照输入

- 视觉基准：`C:\Users\CHQ\AppData\Local\Temp\codex-clipboard-ac30f1b5-72cc-4a70-832d-9d4d4b6e9348.png`（1312 × 1199）
- 对照拼图：`C:\Users\CHQ\.codex\visualizations\2026\09\05\01a07094-65ae-7bc0-ae97-e8f7427fa41f\recipe-round-two-comparison.png`
- 实机环境：微信开发者工具 iPhone 15 Pro Max 模拟器，430 × 932 screen、430 × 752 window、DPR 3、SDK 3.17.2、statusBarHeight 54px。

对照拼图左列是参考图裁切，右列是已有的第一轮实现截图；右列明确标记为 stale / pre-round，仅用于定位本轮要修复的视觉差异，不能作为第二轮完成证据。

## 本轮静态校准结论

- 菜谱页面背景统一为白色；旧粉色云雾渐变已从菜谱 theme 和三页主容器移除。
- 总览卡片使用 `aspect-ratio: 1 / 1`，媒体区固定 68%，两列 grid 使用 20rpx 列间距、26rpx 行间距；卡片加号已改为真实图标的无文字按钮。
- 详情 Hero 使用 plate-shell / plate-rim / detail-photo 三层结构，外圈暖白、内圈白色、阴影为中性灰；已移除“难/时/份”装饰。
- 详情正文底部包含 CTA + safe-area + 额外留白，固定 CTA 宽度 70%、最小高度 88rpx。
- 编辑页使用同一套 custom navigation 几何；cover 高度 300rpx，字段标签和值、食材行、步骤 textarea 均已统一。
- 图标使用 `miniprogram/assets/icons/recipes/` 中的真实位图资源；没有新增 emoji、ASCII 或 CSS 伪图标。

## 运行证据

- `node --test miniprogram/test/*.test.js`：菜谱相关测试全部通过；同一命令有 2 个既有 settings 占位页面断言失败，与本轮菜谱文件无关。
- `npm test`（`server/`）：10/10 通过。
- `node --check`：菜谱列表、详情、编辑页 JS 及 `utils/ui.js` 通过。
- JSON 解析、`git diff --check`：通过。
- `scripts/verify-recipe-ui.js`：48 道菜谱加载、分类总览、收藏本机 storage 往返、加入菜单面板、详情食材/步骤、编辑页封面、食材面板、步骤新增均通过。

## 阻塞项 / 不能冒充的证据

微信开发者工具当前自动截图命令 `App.captureScreenshot` 在本轮重载后的 catalog/detail/editor 状态不返回 payload；编辑页调用会阻塞。因此无法把本轮渲染结果截图作为视觉 QA 证据，也不能声称已完成 iPhone 12/13 或 Android 的实机视觉比对。旧截图只作为 stale 对照保留。

下一步需要在开发者工具中手动截图同一 viewport 的总览、详情、编辑三页，再对照本文件的参考图复核字体 baseline、safe-area、最后一排卡片和键盘弹起状态。

final result: blocked (implementation and functional regression complete; fresh visual screenshot comparison unavailable)
