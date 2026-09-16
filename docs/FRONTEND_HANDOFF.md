# Frontend Engineering Handoff

本文描述当前真实的小程序前端 contract，面向新开发者、维护者和课程演示。前端位于 E:\Database_Design\miniprogram，使用原生 WXML、WXSS、JavaScript，不使用云开发或 H5 框架。当前版本总览见 [CURRENT_VERSION.md](/E:/Database_Design/docs/CURRENT_VERSION.md)。

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
- 头像和封面相对 URL 转绝对访问地址。

未登录、没有 Token 或 Token 失效时，业务页面不会继续展示旧内容，而是清理会话并 `reLaunch` 到 `pages/login/index`。登录页检测到有效会话后进入 `pages/recommend/index`。退出登录也会直接回到登录页。

开发配置且 `DEV_AUTH_ENABLED=true` 时，登录页可以显示明确的本地开发登录入口。它不是正式用户入口，也不会在微信登录失败后静默 fallback。

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
- pages/account-management：编辑全局用户名、拍照或从相册选择头像、退出登录。
- pages/family-management：家庭名称、邀请码、成员、管理员权限和退出/移交操作。
- pages/about：项目说明。

## 3. Session 与 no-Family 状态

页面进入时必须调用 `requireAuthentication()` 或 `ensureAuthenticated()`。已有有效 Token 会先通过 `/auth/me` 校验；401 只允许一次重新认证，重新认证失败就清理会话并回登录页。

正式新用户登录成功后 membership 可以为 null。这是合法业务状态，页面应显示：

~~~text
你还没有加入家庭
创建家庭 / 加入家庭
~~~

不要把没有 Family 当成登录失败，也不要自动创建 Family。

## 4. 账号资料

账号资料属于全局 User，而不是某个家庭成员的本地副本：

- `PATCH /api/auth/profile` 修改用户名。
- `POST /api/uploads/avatar` 上传头像；头像文件归属于 User，不要求先加入家庭。
- `GET /api/auth/me` 返回当前 User 和当前 active membership。

设置页、账号管理页、家庭成员列表和成员忌口页都优先使用同一份 `user.display_name` / `avatar_url`。修改成功后要更新全局 Session，返回其他页面时重新读取或使用该 Session。

## 5. Family

当前前端使用：

- POST /api/families：创建家庭。
- POST /api/families/join：邀请码加入。
- GET /api/families/current：家庭与 active Members。
- PATCH /api/families/current/name：Owner/Admin 修改家庭名称。
- GET /api/families/current/invite-code：所有 active 成员读取邀请码。
- POST /api/families/current/invite-code/refresh：Owner/Admin 刷新邀请码，旧码立即失效。
- POST /api/families/current/transfer-ownership：Owner 向同家庭 active 成员移交创建者身份。
- PATCH/DELETE /api/families/current/members/:memberId：Owner/Admin 管理成员角色或移除成员。

当前规则：单 active Family、跨 Family 资源 404、同 Family 权限不足 403。普通成员可以邀请别人，具体表现为读取和复制当前邀请码；Owner/Admin 可以管理家庭；Owner 不能直接退出，移交后原 Owner 变为普通成员并可退出。多 Family、切换和 Family delete 仍 Deferred。

邀请码由服务端随机生成 6 位数字/大小写字母组合，加入时保留大小写；数据库列使用 `ascii_bin`，管理员刷新后旧邀请码立即失效。

## 6. Recipe 与 Cover

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

## 7. Menu

~~~text
GET /api/menus?date=YYYY-MM-DD
GET /api/menus/dates
POST /api/menus/items
DELETE /api/menus/items/:id
~~~

Menu slot 为 family + date + meal_type。同一菜谱重复加入应显示已存在，不覆盖原 note。删除 MenuItem 不删除 Menu 或 Recipe，空 Menu 保留。

菜单页保留 breakfast、lunch、dinner 三个餐次，并保持日期和餐次 context。整张 Menu 删除和 completed 流程没有前端入口。

## 8. Recommendation

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

## 9. Restriction

~~~text
GET /api/family-members/:memberId/restrictions
POST /api/family-members/:memberId/restrictions
DELETE /api/family-members/:memberId/restrictions/:ingredientId
~~~

Owner 可以维护本 Family 所有 active Members；普通 Member 只能维护自己；left Member 不可编辑。Restriction 是 active Member 的家庭级硬约束，任一命中即可排除 Recipe。

## 10. Preference

~~~text
GET /api/family-members/:memberId/preferences
PUT /api/family-members/:memberId/preferences/:category
DELETE /api/family-members/:memberId/preferences/:category
~~~

类别为 荤菜、素菜、汤、主食，分数为 1–5。UI 使用“不喜欢 / 一般 / 喜欢”等语义，不直接暴露数据库术语。未设置按中性值 3；Preference 参与推荐软排序，不直接过滤 Recipe。

## 11. Feedback 与 Insights

Feedback APIs：

~~~text
GET/PUT/DELETE /api/menu-items/:menuItemId/feedback
~~~

Feedback owner 是当前 active Member，不信任 Frontend 传入的 memberId。重复评分更新原记录。comment 可选，最多 200 字符。

Insights：

~~~text
GET /api/insights?days=7|30
~~~

设置页“最近的餐桌记录”默认请求近 7 天，标题行右侧提供“近 7 天”和“近 30 天”两个按钮；切换按钮会重新请求后端并同时刷新菜单次数、菜品次数、平均评分和热门菜谱。后端只接受 7 或 30，未传参数默认 7。页面读取真实 aggregate，不生成本地假统计。

## 12. 状态与错误处理

页面应区分 Loading、Empty、Error、Content，并为保存、删除、Apply 防止重复点击。

- 401：未登录或登录过期，交给统一 re-auth。
- 403：无 active Family 或同 Family 权限不足。
- 404：资源不存在或属于其他 Family。
- 409：业务冲突。
- 500/503：显示可恢复的通用错误，不展示 SQL、stack 或 secret。

## 13. 不要误实现的范围

以下能力没有前端 contract：

- 多 Family / Family switch。
- Family delete。
- Menu completed。
- Refresh Token、logout revoke、多设备 Session。
- UnionID。
- AI、协同过滤、Feedback 学习。
- 云对象存储、CDN、orphan cleanup。

## 14. 前端测试

~~~powershell
npm test --prefix miniprogram
~~~

当前基线为 147 passed、0 failed、0 skipped。测试使用 Node built-in runner，覆盖纯函数、页面 contract、API contract 和关键文案，不替代微信开发者工具真实 E2E。

所有可见 WXML 事件必须对应真实 handler；新增按钮必须连接真实 API、导航或明确的不可用状态，不能创建假成功交互。
