# Frontend Engineering Handoff

本文描述当前真实的小程序前端 contract，面向新开发者、维护者和课程演示。前端位于 E:\Database_Design\miniprogram，使用原生 WXML、WXSS、JavaScript，不使用云开发或 H5 框架。

## 1. 运行与认证

先启动 Backend：

~~~powershell
cd E:\Database_Design\server
npm run dev
~~~

小程序 API base 集中在 miniprogram/config.js：

- development：http://127.0.0.1:3000/api
- production：HTTPS placeholder，部署前替换

正式认证链路：

~~~text
wx.login → code → POST /api/auth/wechat-login
→ Backend code2Session → openid → JWT → /api/auth/me
~~~

utils/api.js 负责：

- Bearer Token 注入。
- Token 读写。
- wx.login。
- 正式微信登录。
- 401 单次重新认证。
- 重新认证失败后的 Session 清理。
- 封面相对 URL 转绝对访问地址。

DEV_AUTH_ENABLED=true 时，Settings 可提供明确的本地开发登录入口。它不是正式用户入口，也不会在微信登录失败后静默 fallback。

## 2. 页面结构

四个 Tab：

| Tab | 页面 | 真实能力 |
| --- | --- | --- |
| 推荐 | pages/recommend | 生成推荐、家庭限制与偏好状态、理由、Apply |
| 菜单 | pages/menu | 日期/餐次菜单、手动加菜、删除 MenuItem、Feedback |
| 菜谱 | pages/recipes | 搜索、分类、列表、加入菜单 |
| 设置 | pages/settings | 身份、Family、邀请码、Preference、Restriction、Insights、About |

非 Tab 页面：

- pages/recipe-detail：菜谱详情、封面、编辑、加入菜单。
- pages/recipe-form：新增/编辑菜谱、食材、步骤、封面上传。
- pages/restrictions：active Member 的 Ingredient restrictions。
- pages/preferences：active Member 的 category preferences。
- pages/about：项目说明。

## 3. Session 与 no-Family 状态

页面进入时应调用 ensureAuthenticated() 或发起会触发同一认证机制的 API 请求。已有有效 Token 不重复 wx.login；401 只允许一次重新认证。

正式新用户登录成功后 membership 可以为 null。这是合法业务状态，页面应显示：

~~~text
你还没有加入家庭
创建家庭 / 加入家庭
~~~

不要把没有 Family 当成登录失败，也不要自动创建 Family。

## 4. Family

当前前端使用：

- POST /api/families：创建家庭。
- POST /api/families/join：邀请码加入。
- GET /api/families/current：家庭与 active Members。

当前规则：单 active Family、跨 Family 资源 404、同 Family 权限不足 403。多 Family、切换、Owner transfer、Owner leave、Family delete 均 Deferred。

## 5. Recipe 与 Cover

Recipe APIs：

~~~text
GET/POST /api/recipes
GET/PUT/DELETE /api/recipes/:id
GET /api/ingredients
POST /api/uploads/recipe-cover
~~~

创建/编辑流程：

1. wx.chooseMedia 或 wx.chooseImage 获取临时路径。
2. 先上传封面。
3. 使用返回的 coverUrl 提交 Recipe POST/PUT。
4. 列表、详情和编辑页读取持久化 coverUrl。

支持 JPG、PNG、WebP，上传上限 5 MB。数据库保存相对 URL，不保存二进制。旧封面保留和 orphan cleanup 属于 Deferred 策略。

Recipe 使用 soft delete；历史 MenuItem 仍可动态读取同 Family 的 deleted Recipe。

## 6. Menu

~~~text
GET /api/menus?date=YYYY-MM-DD
GET /api/menus/dates
POST /api/menus/items
DELETE /api/menus/items/:id
~~~

Menu slot 为 family + date + meal_type。同一菜谱重复加入应显示已存在，不覆盖原 note。删除 MenuItem 不删除 Menu 或 Recipe，空 Menu 保留。

菜单页保留 breakfast、lunch、dinner 三个餐次，并保持日期和餐次 context。整张 Menu 删除和 completed 流程没有前端入口。

## 7. Recommendation

~~~text
POST /api/recommendations
GET /api/recommendations/:id/candidates/:rank
POST /api/recommendations/:id/apply
GET /api/families/current/restrictions
GET /api/families/current/preferences
~~~

当前 Frontend 使用 canonical 请求：`menuDate`、`mealType`、`peopleCount`、`maxPrepMinutes`、`structure` 和可选 `preferences`。Frontend 不提交家庭 Preference 作为推荐来源；Backend 从数据库读取 active Members，并将未设置的 category preference 按中性值 3 聚合。旧客户端仍可使用 `maxCookMinutes + mode` 兼容路径，但新请求不能混用两套参数。

推荐逻辑：

~~~text
Restriction hard filter → structure/category capacity → preference/diversity/nutrition/season/novelty score → persisted candidates
~~~

`maxPrepMinutes` 是 preferred preparation target：候选可以在必要时超时，但必须返回 `estimatedPrepMinutes`、`withinTimeLimit` 和超时提示。推荐结果包含最多 3 个服务端持久化 Candidate；页面用 `GET .../candidates/:rank` 切换候选，并用 `{ candidateId }` Apply。推荐理由必须显示 Backend 返回的真实 reason，不自行替换成 AI 或营销文案。Apply 遇到 stale/cross-Family Recipe 时整体失败，不做 partial success；重复 Apply 保持幂等。

## 8. Restriction

~~~text
GET /api/family-members/:memberId/restrictions
POST /api/family-members/:memberId/restrictions
DELETE /api/family-members/:memberId/restrictions/:ingredientId
~~~

Owner 可以维护本 Family 所有 active Members；普通 Member 只能维护自己；left Member 不可编辑。Restriction 是 active Member 的家庭级硬约束，任一命中即可排除 Recipe。

## 9. Preference

~~~text
GET /api/family-members/:memberId/preferences
PUT /api/family-members/:memberId/preferences/:category
DELETE /api/family-members/:memberId/preferences/:category
~~~

类别为 荤菜、素菜、汤、主食，分数为 1–5。UI 使用“不喜欢 / 一般 / 喜欢”等语义，不直接暴露数据库术语。未设置按中性值 3；Preference 参与推荐软排序，不直接过滤 Recipe。

## 10. Feedback 与 Insights

Feedback APIs：

~~~text
GET/PUT/DELETE /api/menu-items/:menuItemId/feedback
~~~

Feedback owner 是当前 active Member，不信任 Frontend 传入的 memberId。重复评分更新原记录。comment 可选，最多 200 字符。

Insights：

~~~text
GET /api/insights
~~~

设置页和菜单反馈入口读取真实 aggregate，不生成本地假统计。

## 11. 状态与错误处理

页面应区分 Loading、Empty、Error、Content，并为保存、删除、Apply 防止重复点击。

- 401：未登录或登录过期，交给统一 re-auth。
- 403：无 active Family 或同 Family 权限不足。
- 404：资源不存在或属于其他 Family。
- 409：业务冲突。
- 500/503：显示可恢复的通用错误，不展示 SQL、stack 或 secret。

## 12. 不要误实现的范围

以下能力没有前端 contract：

- 多 Family / Family switch。
- Owner transfer / leave / Family delete。
- Menu completed。
- Refresh Token、logout revoke、多设备 Session。
- 用户资料完善、头像上传、UnionID。
- AI、协同过滤、Feedback 学习。
- 云对象存储、CDN、orphan cleanup。

## 13. 前端测试

~~~powershell
npm test --prefix miniprogram
~~~

当前基线为 94 passed。测试使用 Node built-in runner，覆盖纯函数、页面 contract、API contract 和关键文案，不替代微信开发者工具真实 E2E。

所有可见 WXML 事件必须对应真实 handler；新增按钮必须连接真实 API、导航或明确的不可用状态，不能创建假成功交互。
