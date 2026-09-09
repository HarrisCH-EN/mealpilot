# 推荐首页编辑式视觉重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变推荐、偏好、跳转或接口行为的前提下，将推荐页初始/加载首页严格调整为已确认的编辑式参考图。

**Architecture:** 初始页保留 `dateCaption`、`screen`、`peopleCount`、`modeLabel` 和原有事件；WXML 只增加无绑定的标题装饰和价值说明，WXSS 在推荐页作用域内建立固定的留白、排版、CTA 与安全区节奏。结果、确认、错误和偏好抽屉不变。

**Tech Stack:** 微信小程序 WXML、WXSS、Node.js 内置测试运行器。

---

### Task 1: 覆盖首页视觉锚点的静态回归检查

**Files:**
- Modify: `E:/Database_Design/miniprogram/test/ui-v1.test.js`
- Test: `E:/Database_Design/miniprogram/test/ui-v1.test.js`

- [ ] **Step 1: 写入会失败的首页视觉结构检查**

在 `ui-v1.test.js` 添加下列测试；它只约束显示结构、既有事件绑定和安全区规则：

```js
test('recommend home keeps its decision flow while using the editorial initial layout', () => {
  const root = path.join(__dirname, '..', 'pages', 'recommend')
  const template = fs.readFileSync(path.join(root, 'index.wxml'), 'utf8')
  const css = fs.readFileSync(path.join(root, 'index.wxss'), 'utf8')
  assert.match(template, /decision-cta[^>]*bindtap="generate"/)
  assert.match(template, /context-summary[^>]*bindtap="togglePreferences"/)
  assert.match(template, /recommend-accent-line/)
  assert.match(template, /recommend-value-list/)
  assert.match(template, /让每一顿饭都多一点幸福/)
  assert.match(css, /--recommend-page-gutter:\s*44rpx/)
  assert.match(css, /\.decision-cta--circle\s*\{[^}]*width:\s*256rpx;[^}]*height:\s*256rpx/s)
  assert.match(css, /env\(safe-area-inset-bottom\)/)
})
```

- [ ] **Step 2: 运行测试确认它失败**

Run: `node --test miniprogram/test/ui-v1.test.js`

Expected: 新测试因缺少 `recommend-accent-line` 或 `recommend-value-list` 而失败。

- [ ] **Step 3: 提交测试**

Run: `git add -- miniprogram/test/ui-v1.test.js; git commit -m "test: cover recommend home editorial layout"`

### Task 2: 重排推荐初始/加载页展示结构

**Files:**
- Modify: `E:/Database_Design/miniprogram/pages/recommend/index.wxml:2-18`

- [ ] **Step 1: 保留原数据绑定与交互节点**

如下节点和属性保持原样：

```xml
<view class="recommend-date">{{dateCaption}}</view>
<button class="decision-cta decision-cta--circle {{screen === 'loading' ? 'decision-cta--loading' : ''}}" disabled="{{loading}}" bindtap="generate">
<view wx:if="{{screen === 'initial'}}" class="context-summary" bindtap="togglePreferences">
```

- [ ] **Step 2: 添加纯展示笔触与标题旁注**

在 `recommend-question` 后增加无数据或事件绑定的：

```xml
<view class="recommend-title-aside" aria-hidden="true">好好吃饭<br />就是好生活</view>
<view class="recommend-accent-line" aria-hidden="true"></view>
```

- [ ] **Step 3: 添加无卡片价值信息与收尾文案**

只在 `screen === 'initial'` 下、偏好入口后增加：

```xml
<view class="recommend-value-section"><view class="recommend-value-list"><view class="recommend-value"><text class="recommend-value__icon">♧</text><text class="recommend-value__title">家人口味</text><text class="recommend-value__caption">更懂你们</text></view><view class="recommend-value"><text class="recommend-value__icon">♢</text><text class="recommend-value__title">营养均衡</text><text class="recommend-value__caption">吃得更健康</text></view><view class="recommend-value"><text class="recommend-value__icon">◷</text><text class="recommend-value__title">省时省心</text><text class="recommend-value__caption">快速出方案</text></view></view><view class="recommend-closing">— 让每一顿饭都多一点幸福 —</view></view>
```

- [ ] **Step 4: 确认模板事件不变**

Run: `rg -n 'bindtap="(generate|togglePreferences)"|recommendation|request\(' miniprogram/pages/recommend/index.wxml miniprogram/pages/recommend/index.js`

Expected: `generate` 与 `togglePreferences` 绑定仍在；JS 未编辑。

### Task 3: 实现页面专属编辑式排版与响应式空间

**Files:**
- Modify: `E:/Database_Design/miniprogram/pages/recommend/index.wxss:1-20`

- [ ] **Step 1: 建立推荐页专属空间 token**

```css
.recommend-page { --recommend-page-gutter: 44rpx; --recommend-tabbar-clearance: calc(118rpx + env(safe-area-inset-bottom)); min-height: 100%; overflow: hidden; background: #ffffff; }
.recommend-initial { padding: 58rpx var(--recommend-page-gutter) var(--recommend-tabbar-clearance); }
```

- [ ] **Step 2: 实现参考图中的版式层级**

日期为 22rpx、问候 36rpx、标题 62rpx、正文 28rpx；笔触为 96rpx 宽、4rpx 高的粉色圆角线。CTA 必须为 256rpx 正圆且无矩形边框：

```css
.decision-cta--circle { width: 256rpx !important; height: 256rpx !important; min-width: 256rpx !important; min-height: 256rpx !important; border-radius: 50%; background: var(--color-primary); }
```

- [ ] **Step 3: 实现偏好、分隔线、三列信息和窄屏规则**

偏好入口为轻描边胶囊；`.recommend-value-section` 采用 `border-top: 1rpx solid #eeeeee` 与三等分 flex，不给 value 背景、边框、阴影或圆角。为 `max-width: 360px` 和 `max-height: 700px` 减少标题/CTA/价值区纵向间距；不得设置固定页面高度、fixed CTA 或自定义胶囊定位。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test miniprogram/test/ui-v1.test.js miniprogram/test/recommend-preferences.test.js`

Expected: PASS，且无模板事件或 API 契约回归。

- [ ] **Step 5: 检查边界后提交**

Run: `git diff --check; git diff -- miniprogram/pages/recommend/index.wxml miniprogram/pages/recommend/index.wxss miniprogram/pages/recommend/index.js miniprogram/app.json`

Expected: 本次内容仅出现在推荐页 WXML/WXSS；JS 和 `app.json` 无差异。

Run: `git add -- miniprogram/pages/recommend/index.wxml miniprogram/pages/recommend/index.wxss miniprogram/test/ui-v1.test.js; git commit -m "feat: refresh recommend home visual layout"`

### Task 4: 完整回归验证

**Files:**
- Test: `E:/Database_Design/miniprogram/test/ui-v1.test.js`
- Test: `E:/Database_Design/miniprogram/test/recommend-preferences.test.js`
- Test: `E:/Database_Design/server/test/recommendation.test.js`

- [ ] **Step 1: 执行前端测试**

Run: `npm test --prefix miniprogram`

Expected: PASS；若项目未定义脚本，使用 `node --test miniprogram/test/*.test.js`。

- [ ] **Step 2: 执行推荐服务契约测试**

Run: `npm test --prefix server -- --test-name-pattern=recommendation`

Expected: PASS；证明 UI 改动没有触及服务端推荐契约。

- [ ] **Step 3: 检查 API 与数据文件没有被修改**

Run: `git diff --name-only HEAD^..HEAD -- miniprogram/pages/recommend/index.js miniprogram/utils/api.js server/src database miniprogram/app.json`

Expected: 无输出。
