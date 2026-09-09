# 饭有谱——家庭智能配餐系统

饭有谱是一个基于微信小程序、Express REST API 和 MySQL 的家庭菜谱与菜单系统。系统围绕家庭数据边界，提供菜谱、菜单、规则推荐、成员忌口、口味偏好、用餐反馈和基础洞察。

推荐是规则和可解释评分模型，不是 AI、机器学习或协同过滤系统。

## 1. 当前功能

- 正式微信登录：wx.login、Backend code2Session、OpenID 映射、JWT 会话。
- 本地开发登录：受 DEV_AUTH_ENABLED 控制，仅用于开发和自动化测试。
- Family：创建家庭、邀请码加入、成员与 Owner 展示、单 active Family。
- Recipe：列表、详情、新增、编辑、软删除、食材明细、步骤和封面。
- Recipe Cover：本地上传 JPG、PNG、WebP，数据库保存相对 URL。
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
MySQL 8：smart_meal
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
└─ 07_remove_cuisine_tags.sql
server/
├─ src/routes/
├─ src/services/
├─ src/middleware/
├─ src/scripts/
├─ test/
└─ test/integration/
miniprogram/
├─ pages/
├─ utils/
├─ config.js
├─ test/
└─ scripts/run-tests.js
docs/
├─ FRONTEND_HANDOFF.md
└─ superpowers/
启动后端.bat
~~~

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
| MYSQL_DATABASE | 业务数据库，通常为 smart_meal | 本地 Backend 必需 |
| JWT_SECRET | JWT 签名密钥 | 必须配置为稳定随机值 |
| DEV_AUTH_ENABLED | 是否启用 /api/auth/dev-login | 开发可为 true，生产建议 false |
| WECHAT_APP_ID | 微信小程序 AppID | 正式微信登录必需 |
| WECHAT_APP_SECRET | 微信小程序 AppSecret | 仅 Backend，正式微信登录必需 |
| RECIPE_UPLOAD_ROOT | 菜谱封面上传目录 | 可选 |
| MYSQL_TEST_DATABASE | Real MySQL Integration 测试库 | 仅 Integration |
| PHASE_1C_ALLOW_DB_WRITES | 显式允许测试库写入，必须为 1 | 仅 Integration |

WECHAT_APP_SECRET 不得写入小程序、API response、日志或测试快照。

## 7. 数据库初始化

业务数据库为 smart_meal。首次初始化时使用具有建库和授权权限的 MySQL 管理账号执行：

~~~powershell
mysql -u root -p < database/00_create_user.sql
~~~

然后配置 server/.env，执行：

~~~powershell
cd E:\Database_Design\server
npm install
npm run db:init
npm run db:seed
~~~

真实脚本含义：

- db:init：读取项目 database/01_schema.sql 创建数据库和表；当前新建 Schema 已包含 canonical Recommendation 结构。
- db:seed：读取项目 database/02_seed.sql 写入本地演示数据。
- 03_queries.sql：课程展示和统计用 SQL，不是启动必需步骤。
- 04、05、06、07：针对已经存在的旧数据库执行的增量升级，顺序为先 04、05、06，再 07；06 用于按 seed 映射 insert-only 补齐现有 Recipe 的口味、饮食和烹饪方法标签，07 用于清理已废弃的菜系标签并收窄标签类型。它们不替代新环境的 01_schema.sql，也不应跳过数据库基础表初始化。

当前 `01_schema.sql` 定义 17 张表；seed 包含 48 道 Recipe、食材和完整的 recipe_ingredients 关系，供本地演示和开发使用。

## 8. Backend 启动

~~~powershell
cd E:\Database_Design\server
npm install
Copy-Item .env.example .env
# 编辑 .env 后：
npm run db:init
npm run db:seed
npm run dev
~~~

也可以双击根目录 启动后端.bat。健康检查：

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

## 11. 核心 API

基础地址为 API_BASE/api。除健康检查和登录接口外，业务接口需要 Bearer JWT。

| 模块 | API |
| --- | --- |
| Auth | POST /auth/wechat-login、POST /auth/dev-login、GET /auth/me |
| Family | POST /families、POST /families/join、GET /families/current |
| Recipe | GET/POST /recipes、GET/PUT/DELETE /recipes/:id |
| Ingredient | GET /ingredients |
| Menu | GET /menus、GET /menus/dates、POST /menus/items、DELETE /menus/items/:id |
| Recommendation | POST /recommendations、GET /recommendations/:id/candidates/:rank、POST /recommendations/:id/apply |
| Restriction | GET/POST /family-members/:memberId/restrictions、DELETE .../:ingredientId |
| Preference | GET /family-members/:memberId/preferences、PUT/DELETE .../:category |
| Feedback | GET/PUT/DELETE /menu-items/:menuItemId/feedback |
| Insights | GET /insights |
| Upload | POST /uploads/recipe-cover |

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
- Owner 不能直接 leave；Owner transfer、Family delete 暂不实现。
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

支持 JPG、JPEG、PNG、WebP，大小上限 5 MB。文件保存在本地 upload directory，服务端生成安全文件名；数据库只保存 /uploads/recipes/<filename> 相对 URL。

上传失败时 Recipe 不会假装保存成功。孤儿图片清理、云对象存储和 CDN 属于 Deferred。

## 15. 测试系统

### Backend Direct

~~~powershell
cd E:\Database_Design\server
npm test
~~~

当前基线：141 passed，0 failed，0 skipped。Direct 测试不连接、不读取、不写入 smart_meal。

### Backend Real MySQL Integration

~~~powershell
cd E:\Database_Design\server
$env:MYSQL_TEST_DATABASE = 'smart_meal_test'
$env:PHASE_1C_ALLOW_DB_WRITES = '1'
npm run test:integration
~~~

当前声明测试：23 个。安全门禁要求测试库名称包含 test，且不得等于 MYSQL_DATABASE。Integration 可以 DROP/CREATE 和清理测试库，但绝对不能使用 smart_meal。没有安全环境时命令会 fail-fast，不会 fallback 到业务库。

### Frontend

~~~powershell
npm test --prefix miniprogram
~~~

当前基线：94 passed，0 failed，0 skipped。Frontend 测试使用 Node built-in runner，覆盖 contract、纯函数和 source-level checks，不等同于微信开发者工具真实 E2E。

### 全部 Backend

~~~powershell
cd E:\Database_Design\server
npm run test:all
~~~

该命令会先运行 Direct，再运行带安全门禁的 Integration；未配置测试库时会明确失败，不应把失败误报为完整测试通过。

## 16. Real MySQL Integration 测试库

建议使用独立的 smart_meal_test，不要复制或清空业务库。使用 MySQL 管理账号准备测试库和专用权限，例如：

~~~sql
CREATE DATABASE IF NOT EXISTS smart_meal_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
GRANT ALL PRIVILEGES ON smart_meal_test.* TO 'smart_meal_app'@'localhost';
GRANT CREATE, DROP ON *.* TO 'smart_meal_app'@'localhost';
FLUSH PRIVILEGES;
~~~

测试 runner 会读取正式 database/01_schema.sql，在测试库中重建 Schema 和最小 fixture；不维护第二份 Schema，不复制 smart_meal 数据。

## 17. Course Design Scope

项目同时作为数据库课程设计，真实体现：

- Primary Key、Foreign Key、Composite Key、UNIQUE、CHECK、DEFAULT、NOT NULL
- 1:N、M:N、关联实体、索引和参照完整性
- Transaction、Rollback、Concurrency、FOR UPDATE、UPSERT、Idempotency
- Soft Delete、JOIN、LEFT JOIN、GROUP BY、AVG、COUNT、Family isolation

最终 ER 图、数据字典、课程报告和答辩材料另行整理，不在本 README 中展开。

## 18. Known Limitations / Deferred

这些不是当前业务 Bug，而是明确的后续范围：

- 用户资料完善、头像上传、UnionID 数据模型。
- Refresh Token、logout revoke、Token blacklist、多设备 Session 中心。
- 多 Family、Family switch、Owner transfer、Owner leave、Family delete。
- Menu completed 流程。
- Recommendation 行为学习、Feedback 学习、AI/LLM、协同过滤。
- 云对象存储、CDN、orphan image cleanup。
- 生产服务器、域名、HTTPS、监控、备份与灾备部署。

## 19. Production Prerequisites

当前代码已经提供正式认证基础，但尚未完成生产部署。上线前仍需：

1. 配置真实 WECHAT_APP_ID 和 WECHAT_APP_SECRET。
2. 将 miniprogram/config.js production API 替换为正式 HTTPS 地址。
3. 在微信后台配置 request 合法域名。
4. 部署 Express、MySQL、上传目录和备份策略。
5. 重新执行安全的 Real MySQL Integration 和现场小程序验收。

不要把当前 localhost 或 HTTPS placeholder 误认为已经部署。
