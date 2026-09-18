# MealPilot / 饭有谱

> Plan less. Eat better.

## 0. 品牌与部署命名

| 项目 | 统一命名 |
| --- | --- |
| 品牌名 | MealPilot |
| 中文名 | 饭有谱 |
| Slogan | Plan less. Eat better. |
| Git 仓库 | mealpilot |
| 微信小程序 | mealpilot-miniprogram |
| 后端服务 | mealpilot-api |
| CloudBase 服务 | mealpilot-api |
| 数据库 | mealpilot |
| 对象存储 | mealpilot-assets |

MealPilot（饭有谱）是一个基于微信小程序、Express REST API 和 MySQL 的家庭菜谱与菜单系统。系统围绕家庭数据边界，提供菜谱、菜单、规则推荐、成员忌口、口味偏好、用餐反馈和基础洞察。

推荐是规则和可解释评分模型，不是 AI、机器学习或协同过滤系统。

当前实现基线、数据库边界和交付状态见 [docs/项目现状说明.md](docs/项目现状说明.md)；完整文档入口见 [docs/文档索引.md](docs/文档索引.md)。

## 1. 当前功能

- 正式微信登录：wx.login、Backend code2Session、OpenID 映射、JWT 会话。
- 本地开发登录：受 DEV_AUTH_ENABLED 控制，仅用于开发和自动化测试。
- 全局认证闸门：未登录只能停留在登录页，登录成功进入推荐页，退出或 401 失效回到登录页。
- 全局用户资料：用户名、头像在账号、设置、家庭成员和成员忌口页面共用并持久化。
- Family：创建家庭、邀请码加入、家庭改名、成员与 Owner/Admin 展示、单 active Family。
- Family Admin：普通成员可读取/复制邀请码；管理员可改名、刷新邀请码、设置成员权限和移除成员；创建者可移交创建者身份。
- Invite Code：密码学随机 6 位数字/大小写字母组合，ASCII 区分大小写，刷新后旧邀请码立即失效。
- Recipe：列表、详情、新增、编辑、软删除、食材明细、步骤和封面。
- Recipe Cover：上传 JPG、PNG、WebP 到 CloudBase 私有 Storage，数据库保存稳定 File ID，接口返回临时展示 URL。
- Menu：按日期和餐次查看、手动加菜、备注、幂等添加、删除 MenuItem。
- Restriction：成员级忌口维护，并作为家庭推荐硬过滤。
- Preference：成员级类别偏好持久化，并参与家庭软排序。
- Recommendation：规则生成、评分、理由、家庭限制过滤、推荐应用和幂等 Apply。
- Feedback：当前 active Member 对 MenuItem 评分和可选文字反馈。
- Insights：菜单数量、菜品数量、热门菜谱和平均评分。

## 2. 架构

~~~text
微信小程序
    │ wx.login / wx.request / Bearer JWT
    ▼
Express REST API
    │ mysql2 connection pool / transaction / SQL
    ▼
MySQL 8：mealpilot
~~~

正式登录链路：

~~~text
wx.login → code → /api/auth/wechat-login → WeChat code2Session
→ openid → users → JWT → /api/auth/me → Family business APIs
~~~

## 3. 技术栈

- Frontend：原生微信小程序，WXML、WXSS、JavaScript。
- Backend：Node.js、Express 5、mysql2/promise、jsonwebtoken、dotenv。
- Database：MySQL 8.0+、InnoDB、utf8mb4。
- Authentication：微信 OpenID + JWT；不保存或返回 session_key。
- Testing：Node.js built-in test runner；Direct、Real MySQL Integration、Frontend 三层测试。

## 4. 项目结构

~~~text
database/
├─ 00_create_user.sql
├─ 01_schema.sql
├─ 02_seed.sql
├─ 03_queries.sql
├─ 04_recommendation_refactor_r1.sql
├─ 05_recommendation_run_nullable_legacy.sql
├─ 06_recipe_tag_metadata_backfill.sql
├─ 07_remove_cuisine_tags.sql
├─ 08_tag_system_v1.sql
├─ 09_family-admin-role.sql
└─ 10_family-invite-code.sql
server/
├─ src/routes/
├─ src/services/
├─ src/middleware/
├─ src/scripts/
├─ test/
└─ test/integration/
miniprogram/
├─ pages/
│  ├─ login/
│  ├─ account-management/
│  └─ family-management/
├─ utils/
├─ styles/
├─ assets/
│  ├─ icons/
│  ├─ tab/
│  └─ brand/
├─ app.js
├─ app.json
├─ app.wxss
├─ config.js
└─ sitemap.json
tests/
└─ miniprogram/
scripts/
└─ run-miniprogram-tests.js
resources/
├─ recipe-images/
└─ brand/
   └─ logo-source.png
docs/
├─ 文档索引.md
├─ 项目现状说明.md
├─ 系统架构与部署说明.md
├─ 前端开发与接口说明.md
├─ 数据库设计与审计说明.md
├─ 推荐系统设计说明.md
├─ 界面设计规范.md
├─ 菜谱图片素材来源说明.md
├─ 课程设计/
├─ 图表/
└─ 归档/
start-mealpilot-api.bat
~~~

## 4.1 文档入口

正式文档、课程设计交付物、图表源文件和历史审计记录统一从 [docs/文档索引.md](docs/文档索引.md) 进入。历史归档只用于追溯，不覆盖当前代码事实。

## 5. 环境要求

- Windows 10/11 或等价开发环境。
- Node.js 18 或更高版本；当前验证版本为 Node.js 24.14.0。
- MySQL 8.0 或更高版本；当前验证版本为 MySQL 8.0.45。
- npm。
- 微信开发者工具。

项目使用 Node.js 18+ 已提供的 fetch、AbortController、URL、node:test 和 node --watch 能力。

## 6. 环境变量

复制 server/.env.example 为 server/.env。真实 .env 不应提交到 Git。

| 变量 | 用途 | 分类 |
| --- | --- | --- |
| PORT | Backend 监听端口，默认 3000 | 可选 |
| MYSQL_HOST | MySQL 地址 | 本地 Backend 必需 |
| MYSQL_PORT | MySQL 端口 | 本地 Backend 必需 |
| MYSQL_USER | 项目数据库用户 | 本地 Backend 必需 |
| MYSQL_PASSWORD | 数据库密码 | 本地 Backend 必需 |
| MYSQL_DATABASE | 业务数据库，通常为 mealpilot | 本地 Backend 必需 |
| JWT_SECRET | JWT 签名密钥 | 必须配置为稳定随机值 |
| DEV_AUTH_ENABLED | 是否启用 /api/auth/dev-login | 开发可为 true，生产建议 false |
| NODE_ENV | 生产配置校验开关 | 生产部署建议设置为 production |
| WECHAT_APP_ID | 微信小程序 AppID | 正式微信登录必需 |
| WECHAT_APP_SECRET | 微信小程序 AppSecret | 仅 Backend，正式微信登录必需 |
| CLOUDBASE_ENV_ID | CloudBase 环境 ID | 正式 Backend 必需 |
| CLOUDBASE_STORAGE_FILE_ID_PREFIX | CloudBase Storage 文件 ID 前缀，例如 `cloud://env.bucket` | 正式 Backend 必需 |
| CLOUDBASE_APIKEY | CloudBase 服务端 API Key | 正式 Backend 必需，仅服务端 |
| MYSQL_TEST_DATABASE | Real MySQL Integration 测试库 | 仅 Integration |
| PHASE_1C_ALLOW_DB_WRITES | 显式允许测试库写入，必须为 1 | 仅 Integration |

WECHAT_APP_SECRET 不得写入小程序、API response、日志或测试快照。

## 7. 数据库初始化

业务数据库为 mealpilot。首次初始化时使用具有建库和授权权限的 MySQL 管理账号执行：

~~~powershell
mysql -u root -p < database/00_create_user.sql
~~~

然后配置 server/.env，执行：

~~~powershell
cd E:\Database_Design\server
npm install
npm run db:init
npm run db:migrate
npm run db:seed
~~~

真实脚本含义：

- db:init：读取项目 database/01_schema.sql 创建数据库和表；当前新建 Schema 已包含 canonical Recommendation 结构。
- db:seed：读取项目 database/02_seed.sql 写入本地演示数据。
- 03_queries.sql：课程展示和统计用 SQL，不是启动必需步骤。
- 04、05、06、07、08、09、10：针对已经存在的旧数据库执行的增量升级，按数据库演进顺序执行；06 用于按 seed 映射 insert-only 补齐现有 Recipe 的口味、饮食和烹饪方法标签，07 用于清理已废弃的菜系标签并收窄标签类型，08 用于启用系统/自定义标签，09 用于启用家庭管理员角色，10 用于让邀请码区分大小写。`npm run db:migrate` 当前只幂等校正家庭管理相关的旧库结构，不能替代 04～08 的完整历史迁移。

当前 `01_schema.sql` 定义 19 张表；seed 包含 48 道 Recipe、食材和完整的 recipe_ingredients 关系，供本地演示和开发使用。

## 8. Backend 启动

~~~powershell
cd E:\Database_Design\server
npm install
Copy-Item .env.example .env
# 编辑 .env 后：
npm run db:init
npm run db:migrate
npm run db:seed
npm run dev
~~~

也可以双击根目录 start-mealpilot-api.bat。健康检查：

~~~text
GET http://127.0.0.1:3000/api/health
~~~

## 9. 微信小程序设置

小程序目录为 miniprogram/。在微信开发者工具中导入项目根目录并编译。

miniprogram/config.js 集中管理：

- development API：http://127.0.0.1:3000/api
- production API：HTTPS placeholder，需要部署前替换
- allowDevLogin：开发环境可用，生产环境关闭

开发者工具本地调试可以开启“不校验合法域名、TLS 版本以及 HTTPS 证书”。真机不能访问电脑的 127.0.0.1；正式环境必须使用 HTTPS Backend，并在微信后台配置 request 合法域名。

## 10. Authentication

### 正式微信登录

~~~text
wx.login
→ code
→ POST /api/auth/wechat-login
→ Backend 调用 code2Session
→ openid
→ users.openid
→ JWT
→ GET /api/auth/me
~~~

Frontend 不提交 openid、unionid、session_key 或 user_id。新用户自动创建 User，但不会自动创建 Family；登录后可以创建或加入家庭。

### Development Login

~~~text
DEV_AUTH_ENABLED=true
→ POST /api/auth/dev-login
~~~

仅用于本地开发、自动化测试和没有微信运行环境的调试。正式产品入口应使用微信登录。

### 强制登录闸门

未登录、没有 Token 或 Token 失效时，小程序只展示 `pages/login/index`。业务页面进入时会先检查共享会话；普通请求收到 401 会清理会话并回到登录页。登录成功后统一进入 `pages/recommend/index`，退出登录直接 `reLaunch` 到登录页。

## 11. 核心 API

基础地址为 API_BASE/api。除健康检查和登录接口外，业务接口需要 Bearer JWT。

| 模块 | API |
| --- | --- |
| Auth | POST /auth/wechat-login、POST /auth/dev-login、GET /auth/me、PATCH /auth/profile |
| Profile | POST /uploads/avatar |
| Family | POST /families、POST /families/join、GET /families/current、PATCH /families/current/name、GET /families/current/invite-code、POST /families/current/invite-code/refresh、POST /families/leave |
| Family Admin | POST /families/current/transfer-ownership、PATCH /families/current/members/:memberId/role、DELETE /families/current/members/:memberId |
| Recipe | GET/POST /recipes、GET/PUT/DELETE /recipes/:id |
| Ingredient | GET /ingredients |
| Menu | GET /menus、GET /menus/dates、POST /menus/items、DELETE /menus/items/:id |
| Recommendation | POST /recommendations、GET /recommendations/:id/candidates/:rank、POST /recommendations/:id/apply |
| Restriction | GET/POST /family-members/:memberId/restrictions、DELETE .../:ingredientId |
| Preference | GET /family-members/:memberId/preferences、PUT/DELETE .../:category |
| Feedback | GET/PUT/DELETE /menu-items/:menuItemId/feedback |
| Insights | GET /insights?days=7|30（默认 7 天，设置页可切换近 7 天/近 30 天） |
| Upload | POST /uploads/avatar、POST /uploads/recipe-cover |

统一响应：

~~~json
{ "ok": true, "data": {} }
~~~

失败响应：

~~~json
{ "ok": false, "message": "可展示的错误信息" }
~~~

跨 Family 资源统一返回 404；无 active Family 通常返回 403；业务冲突返回 409。

## 12. 核心业务规则

- 一个 User 同一时间最多拥有一个 active Family membership。
- Family 是 Recipe、Menu、RecommendationRun、Member 等家庭业务数据的隔离边界。
- Owner 不能直接 leave；创建者可将创建者身份转移给 active 成员，转移后原创建者降为普通成员并可退出家庭。Admin 可以管理成员、修改家庭名称和刷新邀请码；普通成员可以查看并复制邀请码。Family delete 暂不实现。
- 邀请码由服务端随机生成 6 位数字/大小写字母组合，`families.invite_code` 使用 `ascii_bin` 区分大小写；管理员刷新后旧码立即失效。
- Recipe 使用 soft delete；历史 MenuItem 使用 Dynamic Reference，仍可展示同 Family 的 deleted Recipe。
- 新 Menu 的粒度是 family_id + menu_date + meal_type，同一槽位只能有一个 Menu。
- 同一 Menu 中同一 Recipe 只能有一个 MenuItem；空 Menu 保留。
- Restriction 是 active Member 的硬过滤；命中任一限制的 Recipe 不进入推荐候选。
- Preference 是 active Member 的类别软偏好；未设置按中性值 3，家庭按 active Member 平均值聚合。
- Recommendation Apply 对 stale 或跨 Family Recipe 整体失败并回滚。
- Feedback 由当前 active Member 维护，重复评分更新原关系。

## 13. Recommendation Model

~~~text
canonical request: maxPrepMinutes + structure + preferences
        ↓
active-member restrictions
        ↓
hard category/ingredient filter
        ↓
family and session preference soft score
        ↓
ingredient/method diversity + nutrition + season + novelty
        ↓
persisted candidates with score/reason snapshots
~~~

新推荐结果会持久化为 `recommendation_runs`、`recommendation_candidates` 和 `recommendation_candidate_items`。客户端通过候选 `candidateId` 读取或 Apply；Apply 会重新校验当前家庭、成员、Recipe 状态、限制和菜单结构，并使用事务和幂等规则写入 Menu。旧的 `maxCookMinutes + mode` 请求和历史 `recommendation_items` 仍保留兼容读取与 Apply 路径。

## 14. Recipe Cover Upload

~~~text
POST /api/uploads/recipe-cover
~~~

支持 JPG、JPEG、PNG、WebP，大小上限 5 MB。文件上传至 CloudBase Storage，数据库只保存稳定的 `cloud://...` 文件 ID；API 和小程序使用临时 HTTPS URL 展示。头像属于全局用户资料，菜谱封面属于家庭菜谱资料。

上传接口返回 `coverFileId`（稳定 ID）和 `coverUrl`（临时展示 URL）。Recipe 创建/编辑优先接收 `coverFileId`，读取接口同时返回稳定 ID 与临时 URL。上传失败时 Recipe 不会假装保存成功；数据库更新失败会清理本次新上传对象，旧头像删除失败只记录安全告警，不影响主请求。

历史菜谱封面迁移默认只做 dry-run；确认摘要并完成备份后执行 `npm run storage:migrate-recipe-covers -- --apply`。迁移不会自动上传本地图片，也不会在应用启动时执行。

## 15. 测试系统

### Backend Direct

~~~powershell
cd E:\Database_Design\server
npm test
~~~

Direct 测试不连接、不读取、不写入 mealpilot。

### Backend Real MySQL Integration

~~~powershell
cd E:\Database_Design\server
$env:MYSQL_TEST_DATABASE = 'mealpilot_test'
$env:PHASE_1C_ALLOW_DB_WRITES = '1'
npm run test:integration
~~~

当前声明测试：46 passed，0 failed，0 skipped。安全门禁要求测试库名称包含 test，且不得等于 MYSQL_DATABASE。Integration 可以 DROP/CREATE 和清理测试库，但绝对不能使用 mealpilot。没有安全环境时命令会 fail-fast，不会 fallback 到业务库。

### Frontend

~~~powershell
npm test --prefix tests/miniprogram
~~~

Frontend 测试使用 Node built-in runner，位于 `tests/miniprogram/`，覆盖 contract、纯函数和 source-level checks，不等同于微信开发者工具真实 E2E。测试文件和 runner 不属于 `miniprogram/` 发布目录。

### 全部 Backend

~~~powershell
cd E:\Database_Design\server
npm run test:all
~~~

该命令会先运行 Direct，再运行带安全门禁的 Integration；未配置测试库时会明确失败，不应把失败误报为完整测试通过。

## 16. Real MySQL Integration 测试库

建议使用独立的 mealpilot_test，不要复制或清空业务库。使用 MySQL 管理账号准备测试库和专用权限，例如：

~~~sql
CREATE DATABASE IF NOT EXISTS mealpilot_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
GRANT ALL PRIVILEGES ON mealpilot_test.* TO 'mealpilot_app'@'localhost';
GRANT CREATE, DROP ON *.* TO 'mealpilot_app'@'localhost';
FLUSH PRIVILEGES;
~~~

测试 runner 会读取正式 database/01_schema.sql，在测试库中重建 Schema 和最小 fixture；不维护第二份 Schema，不复制 mealpilot 数据。

## 17. Course Design Scope

项目同时作为数据库课程设计，真实体现：

- Primary Key、Foreign Key、Composite Key、UNIQUE、CHECK、DEFAULT、NOT NULL
- 1:N、M:N、关联实体、索引和参照完整性
- Transaction、Rollback、Concurrency、FOR UPDATE、UPSERT、Idempotency
- Soft Delete、JOIN、LEFT JOIN、GROUP BY、AVG、COUNT、Family isolation

最终 ER 图、数据字典、课程报告和答辩材料另行整理，不在本 README 中展开。

## 18. Known Limitations / Deferred

这些不是当前业务 Bug，而是明确的后续范围：

- UnionID 数据模型、刷新令牌和多设备 Session 中心。
- Refresh Token、logout revoke、Token blacklist、多设备 Session 中心。
- 多 Family、Family switch、Family delete。
- Menu completed 流程。
- Recommendation 行为学习、Feedback 学习、AI/LLM、协同过滤。
- 云对象存储、CDN、orphan image cleanup。
- 生产服务器、域名、HTTPS、监控、备份与灾备部署。

## 19. Production Prerequisites

当前代码已经提供正式认证、账号资料和家庭管理能力，但尚未完成生产部署。上线前仍需：

1. 配置真实 WECHAT_APP_ID 和 WECHAT_APP_SECRET。
2. 将 miniprogram/config.js production API 替换为正式 HTTPS 地址。
3. 在微信后台配置 request 合法域名。
4. 部署 `mealpilot-api`、`mealpilot` 数据库、`mealpilot-assets` 对象存储和备份策略。
5. 旧库按 04～08、09、10 的迁移顺序完成升级；新库按当前 schema 初始化。
6. 重新执行安全的 Real MySQL Integration 和现场小程序验收。

不要把当前 localhost 或 HTTPS placeholder 误认为已经部署。
