# MealPilot / 饭有谱

> **Plan less. Eat better.**

MealPilot（饭有谱）是一款面向家庭场景的微信小程序，用于管理家庭菜谱、菜单、成员偏好与忌口，并提供可解释的规则推荐。

项目当前已经完成后端、数据库与 CloudBase 私有对象存储部署；小程序已切换到生产 API，现阶段主要进行真机验收、体验版测试与发布前检查。

---

## 1. 项目概览

### 1.1 核心能力

- 微信登录：`wx.login → code2Session → OpenID → JWT`
- 用户资料：昵称、头像
- 家庭管理：创建、加入、邀请码、成员角色、成员移除、所有者移交
- 菜谱管理：列表、详情、新增、编辑、软删除、食材、步骤、封面
- 标签系统：系统标签、家庭自定义标签
- 菜单管理：按日期和餐次维护菜单、手动加菜、备注、删除
- 饮食限制：成员忌口维护，并作为推荐硬约束
- 成员偏好：类别偏好参与家庭推荐评分
- 菜谱推荐：结构约束、标签偏好、营养、季节、多样性、新颖度综合评分
- 推荐候选：单次推荐最多保留 3 套候选，可“换一组”并应用到菜单
- 用餐反馈：评分与文字评价
- 家庭洞察：菜单数量、菜品数量、热门菜谱、平均评分等

推荐系统目前是**确定性规则 + 可解释加权评分模型**，不是机器学习、协同过滤或大模型推荐系统。

---

## 2. 当前生产状态

### 2.1 已部署

| 组件 | 当前状态 |
| --- | --- |
| 微信小程序前端 | 已切换生产 API，正在进行真机与体验版验收 |
| Backend | 已部署到腾讯 CloudBase 云托管 |
| Backend 服务名 | `mealpilot-api` |
| API Base | `https://mealpilot-api-315434-10-1423427242.sh.run.tcloudbase.com/api` |
| MySQL | 已部署，业务数据库为 `mealpilot` |
| Cloud Storage | CloudBase 私有 Storage |
| 系统菜谱图片 | 已迁移到 `system/recipes/` |
| 用户头像 | 已迁移到 `users/<userId>/avatars/` |
| 用户菜谱封面 | 已迁移到 `families/<familyId>/recipes/` |

当前小程序配置：

```js
activeEnvironment = 'production'
```

生产环境：

```text
https://mealpilot-api-315434-10-1423427242.sh.run.tcloudbase.com/api
```

生产环境关闭开发登录：

```text
allowDevLogin = false
```

### 2.2 当前仍需完成

项目已经完成基础生产部署，但**微信小程序尚未完成最终正式发布流程**。当前剩余工作主要包括：

- 微信开发者工具完整编译检查
- 真机登录与业务链路验收
- 微信后台合法域名配置核对
- 体验版测试
- 微信审核与正式发布
- 重新导出最新 draw.io 图表 PNG
- 将当前 CloudBase 架构同步到最终课程设计 DOCX

---

## 3. 系统架构

```text
┌──────────────────────────────┐
│        微信小程序客户端       │
│   WXML / WXSS / JavaScript   │
└──────────────┬───────────────┘
               │
               │ HTTPS
               │ Authorization: Bearer JWT
               ▼
┌──────────────────────────────┐
│   CloudBase 云托管           │
│   mealpilot-api              │
│   Node.js + Express          │
└──────────────┬───────────────┘
               │
        ┌──────┴─────────┐
        │                │
        ▼                ▼
┌───────────────┐  ┌──────────────────────┐
│ MySQL         │  │ CloudBase Storage    │
│ mealpilot     │  │ Private              │
│ 结构化业务数据 │  │ 图片文件             │
└───────────────┘  └──────────────────────┘
```

微信登录额外经过：

```text
wx.login
  ↓
临时 code
  ↓
POST /api/auth/wechat-login
  ↓
Backend 调用微信 code2Session
  ↓
openid
  ↓
users
  ↓
JWT
```

---

## 4. 媒体存储架构

MealPilot 不再把用户图片保存在 Docker / 云托管实例本地磁盘。

当前正式架构：

```text
MySQL
→ 保存稳定 CloudBase File ID

CloudBase Storage
→ 保存图片二进制

Backend
→ 使用 CloudBase 服务端凭据生成临时 HTTPS URL

Mini Program
→ 使用临时 HTTPS URL 展示图片
```

### 4.1 为什么数据库不保存临时 HTTPS URL

CloudBase 临时 URL 会过期，因此数据库必须保存稳定标识：

```text
cloud://...
```

API 在读取数据时，再把稳定 File ID 转换成临时 HTTPS URL。

典型响应：

```json
{
  "coverFileId": "cloud://.../families/1/recipes/example.jpg",
  "coverUrl": "https://temporary-signed-url..."
}
```

其中：

- `coverFileId`：持久化身份，用于保存和编辑
- `coverUrl`：短期展示地址，仅用于 `<image>`

### 4.2 数据库字段兼容说明

当前数据库仍沿用历史字段名：

```text
recipes.cover_url
users.avatar_url
```

但这两个字段在当前生产架构中的语义已经变为：

> **稳定 CloudBase `cloud://` File ID**

请不要因为字段名包含 `_url`，就把临时 HTTPS URL 持久化进去。

### 4.3 Storage 路径

```text
system/recipes/<filename>

users/<userId>/avatars/<uuid>.<ext>

families/<familyId>/recipes/<uuid>.<ext>
```

系统菜谱图片的原始母版保存在：

```text
resources/recipe-images/
```

这些原图不属于微信小程序发布包。

---

## 5. 家庭数据隔离

MealPilot 使用逻辑多租户模型。

```text
User
  ↓ JWT
Backend
  ↓ 查询 family_members
Membership
  ↓
family_id
  ↓
Family-scoped SQL
```

家庭业务数据通过：

- JWT 用户身份
- `family_members`
- `family_id`
- Backend 权限中间件
- Family-scoped SQL

共同实现隔离。

例如：

```sql
SELECT *
FROM recipes
WHERE id = ?
  AND family_id = ?;
```

即使用户知道其他家庭某条记录的 ID，只要不属于当前家庭，正常 API 也不会返回该数据。

当前家庭角色：

```text
owner
admin
member
```

注意：这是**应用层逻辑隔离**，不是每个家庭单独建立一套物理数据库。

---

## 6. 技术栈

### Frontend

- 微信原生小程序
- WXML
- WXSS
- JavaScript
- `wx.request`
- `wx.uploadFile`
- 微信登录 API

### Backend

- Node.js
- Express 5
- `mysql2/promise`
- `jsonwebtoken`
- `zod`
- `@cloudbase/node-sdk`
- `dotenv`

### Database

- MySQL 8.0+
- InnoDB
- utf8mb4
- Primary Key / Foreign Key
- UNIQUE / CHECK / INDEX
- Transaction
- Soft Delete
- Migration

### Testing

- Node.js built-in test runner
- Backend Direct Tests
- Real MySQL Integration Tests
- MiniProgram source / contract tests

---

## 7. 项目结构

```text
mealpilot/
│
├─ miniprogram/                 # 微信小程序正式运行代码
│  ├─ pages/
│  ├─ utils/
│  ├─ styles/
│  ├─ assets/
│  │  ├─ brand/
│  │  ├─ icons/
│  │  └─ tab/
│  ├─ app.js
│  ├─ app.json
│  ├─ app.wxss
│  ├─ config.js
│  └─ sitemap.json
│
├─ server/                      # Node.js / Express Backend
│  ├─ src/
│  │  ├─ routes/
│  │  ├─ services/
│  │  ├─ middleware/
│  │  ├─ data/
│  │  └─ scripts/
│  ├─ test/
│  ├─ Dockerfile
│  ├─ package.json
│  └─ package-lock.json
│
├─ database/                    # MySQL Schema 与迁移历史
│  ├─ 00_create_user.sql
│  ├─ 01_schema.sql
│  ├─ 02_seed.sql
│  ├─ 03_queries.sql
│  ├─ 04_recommendation_refactor_r1.sql
│  ├─ 05_recommendation_run_nullable_legacy.sql
│  ├─ 06_recipe_tag_metadata_backfill.sql
│  ├─ 07_remove_cuisine_tags.sql
│  ├─ 08_tag_system_v1.sql
│  ├─ 09_family-admin-role.sql
│  └─ 10_family-invite-code.sql
│
├─ tests/
│  └─ miniprogram/              # 小程序自动化测试
│
├─ scripts/
│  └─ run-miniprogram-tests.js
│
├─ resources/
│  ├─ recipe-images/            # 系统菜谱原始母版
│  └─ brand/
│     └─ logo-source.png
│
├─ docs/
│  ├─ 文档索引.md
│  ├─ 项目现状说明.md
│  ├─ 系统架构与部署说明.md
│  ├─ 前端开发与接口说明.md
│  ├─ 数据库设计与审计说明.md
│  ├─ 推荐系统设计说明.md
│  ├─ 界面设计规范.md
│  ├─ 菜谱图片素材来源说明.md
│  ├─ 课程设计/
│  ├─ 图表/
│  └─ 归档/
│
├─ project.config.json
├─ README.md
└─ .gitignore
```

---

## 8. 文档

完整文档入口：

- [文档索引](docs/文档索引.md)
- [项目现状说明](docs/项目现状说明.md)
- [系统架构与部署说明](docs/系统架构与部署说明.md)
- [前端开发与接口说明](docs/前端开发与接口说明.md)
- [数据库设计与审计说明](docs/数据库设计与审计说明.md)
- [推荐系统设计说明](docs/推荐系统设计说明.md)
- [界面设计规范](docs/界面设计规范.md)
- [菜谱图片素材来源说明](docs/菜谱图片素材来源说明.md)

图表：

- [系统总体架构图](docs/图表/系统总体架构图.drawio)
- [系统总体 E-R 图](docs/图表/系统总体E-R图.drawio)
- [系统功能模块图](docs/图表/系统功能模块图.drawio)
- [菜谱推荐处理流程图](docs/图表/菜谱推荐处理流程图.drawio)

课程设计：

- [课程设计任务书](docs/课程设计/课程设计任务书.doc)
- [课程设计报告源稿](docs/课程设计/课程设计报告源稿.md)
- [课程设计报告](docs/课程设计/课程设计报告.docx)

---

## 9. 环境变量

后端环境变量示例位于：

```text
server/.env.example
```

真实 `.env`、API Key、数据库密码和微信 Secret 不应提交到 Git。

| 变量 | 用途 |
| --- | --- |
| `NODE_ENV` | Backend 运行环境 |
| `PORT` | HTTP 监听端口 |
| `MYSQL_HOST` | MySQL Host |
| `MYSQL_PORT` | MySQL Port |
| `MYSQL_USER` | MySQL Runtime User |
| `MYSQL_PASSWORD` | MySQL Password |
| `MYSQL_DATABASE` | MySQL Database |
| `JWT_SECRET` | JWT 签名密钥 |
| `WECHAT_APP_ID` | 微信小程序 AppID |
| `WECHAT_APP_SECRET` | 微信小程序 AppSecret |
| `DEV_AUTH_ENABLED` | 是否允许开发登录 |
| `CLOUDBASE_ENV_ID` | CloudBase 环境 ID |
| `CLOUDBASE_STORAGE_FILE_ID_PREFIX` | CloudBase File ID 前缀 |
| `CLOUDBASE_APIKEY` | CloudBase 服务端 API Key |
| `MYSQL_TEST_DATABASE` | Real MySQL Integration 测试数据库 |
| `PHASE_1C_ALLOW_DB_WRITES` | Integration Test 写入门禁 |

三个身份系统不要混淆：

```text
JWT
→ Mini Program → Backend

MySQL Credentials
→ Backend → MySQL

CLOUDBASE_APIKEY
→ Backend → CloudBase Storage
```

服务端凭据绝不能进入小程序代码。

---

## 10. 本地开发

### 10.1 安装 Backend 依赖

```powershell
cd E:\Database_Design\server
npm install
```

复制环境变量：

```powershell
Copy-Item .env.example .env
```

然后填写本地开发环境所需配置。

### 10.2 初始化新数据库

`database/01_schema.sql` 是当前完整 Schema。

```powershell
cd E:\Database_Design\server
npm run db:init
```

如果只是本地 Demo / 开发环境，需要演示数据时：

```powershell
npm run db:seed
```

> 不要在生产业务库上执行完整 `02_seed.sql`。

### 10.3 已存在数据库升级

历史数据库升级由编号 migration 管理：

```text
04 → 05 → 06 → 07 → 08 → 09 → 10
```

当前项目提供：

```powershell
npm run db:migrate
```

Migration runner 使用 `schema_migrations` 记录迁移版本和 checksum，并通过 MySQL advisory lock 避免并发迁移。

生产环境执行任何 migration 前都应先确认：

- 当前数据库
- 当前版本
- 备份
- 迁移脚本
- 回滚兼容性

### 10.4 启动 Backend

```powershell
npm run dev
```

本地 API：

```text
http://127.0.0.1:3000/api
```

健康检查：

```text
GET http://127.0.0.1:3000/api/health
```

---

## 11. 微信小程序环境

配置文件：

```text
miniprogram/config.js
```

当前同时保留：

```text
development
production
```

本地开发 API：

```text
http://127.0.0.1:3000/api
```

生产 API：

```text
https://mealpilot-api-315434-10-1423427242.sh.run.tcloudbase.com/api
```

当前激活：

```text
production
```

正式环境：

```text
allowDevLogin = false
```

开发者工具本地开发时可以临时切换到 `development`，但提交体验版 / 正式版前必须重新确认：

```text
activeEnvironment = 'production'
```

---

## 12. Authentication

正式微信登录：

```text
wx.login
  ↓
code
  ↓
POST /api/auth/wechat-login
  ↓
Backend code2Session
  ↓
openid
  ↓
User
  ↓
JWT
```

Frontend 不直接提交：

```text
openid
session_key
user_id
```

业务 API 使用：

```http
Authorization: Bearer <JWT>
```

生产环境禁止启用：

```text
DEV_AUTH_ENABLED=true
```

---

## 13. 核心 API

所有路径以下面的 Base URL 为前缀：

```text
/api
```

### Authentication

```text
POST  /auth/wechat-login
POST  /auth/dev-login
GET   /auth/me
PATCH /auth/profile
```

### Family

```text
POST   /families
POST   /families/join
GET    /families/current
PATCH  /families/current/name
GET    /families/current/invite-code
POST   /families/current/invite-code/refresh
POST   /families/leave
POST   /families/current/transfer-ownership
PATCH  /families/current/members/:memberId/role
DELETE /families/current/members/:memberId
```

### Recipe

```text
GET    /recipes
GET    /recipes/:id
POST   /recipes
PUT    /recipes/:id
DELETE /recipes/:id
GET    /ingredients
```

### Tag

```text
GET    /tags
POST   /tags
PUT    /tags/:id
DELETE /tags/:id
```

### Menu

```text
GET    /menus
GET    /menus/dates
POST   /menus/items
DELETE /menus/items/:id
```

### Recommendation

```text
POST /recommendations
GET  /recommendations/:id/candidates/:rank
POST /recommendations/:id/apply
```

### Preference

```text
GET    /family-members/:memberId/preferences
PUT    /family-members/:memberId/preferences/:category
DELETE /family-members/:memberId/preferences/:category
GET    /families/current/preferences
```

### Restriction

```text
GET    /family-members/:memberId/restrictions
POST   /family-members/:memberId/restrictions
DELETE /family-members/:memberId/restrictions/:ingredientId
GET    /families/current/restrictions
```

### Feedback

```text
GET    /menu-items/:menuItemId/feedback
PUT    /menu-items/:menuItemId/feedback
DELETE /menu-items/:menuItemId/feedback
```

### Insights

```text
GET /insights?days=7
GET /insights?days=30
```

### Upload

```text
POST /uploads/avatar
POST /uploads/recipe-cover
```

---

## 14. 推荐系统

当前 canonical 推荐请求主要包含：

```text
menuDate
mealType
peopleCount
maxPrepMinutes
structure
preferences.selectedTagIds
```

处理链：

```text
身份与 Family 校验
        ↓
读取家庭有效菜谱
        ↓
汇总 active 成员限制
        ↓
忌口硬过滤
        ↓
按照菜单结构生成完整组合
        ↓
多因素评分
        ↓
候选去重与多样性筛选
        ↓
最多持久化 3 套 Candidate
        ↓
前端展示 / 换一组
        ↓
candidateId Apply
        ↓
再次校验
        ↓
事务写入 Menu / MenuItem
```

当前菜单总评分权重：

| 因素 | 权重 |
| --- | ---: |
| Preference | 30 |
| Ingredient Diversity | 15 |
| Method Diversity | 10 |
| Nutrition | 15 |
| Seasonal | 10 |
| Novelty | 20 |

其中 Preference 分量综合：

```text
本次标签偏好
+
家庭成员类别偏好
```

Canonical 持久化结构：

```text
recommendation_runs
    ↓
recommendation_candidates
    ↓
recommendation_candidate_items
```

旧的：

```text
recommendation_items
```

仍保留用于历史兼容，不是新客户端的主路径。

---

## 15. 数据库

当前 `database/01_schema.sql` 定义 **19 张业务表**：

```text
users
families
family_members

ingredients
ingredient_seasons

recipes
recipe_ingredients

tag_definitions
recipe_tags_legacy
recipe_tags

member_category_preferences
member_ingredient_restrictions

recommendation_runs
recommendation_items
recommendation_candidates
recommendation_candidate_items

menus
menu_items
menu_feedback
```

更多数据库说明见：

[数据库设计与审计说明](docs/数据库设计与审计说明.md)

---

## 16. 测试

### Backend Direct

```powershell
cd E:\Database_Design\server
npm test
```

最近一次文档重构验收记录：

```text
226 passed
0 failed
```

Backend Direct 测试不应读写生产数据库 `mealpilot`。

### MiniProgram

```powershell
npm test --prefix tests/miniprogram
```

最近一次文档重构验收记录：

```text
152 passed
0 failed
```

这些测试属于：

- source-level checks
- contract tests
- pure function tests

它们不等同于微信开发者工具 / 真机 E2E。

### Real MySQL Integration

Integration Test 必须使用独立测试数据库，例如：

```text
mealpilot_test
```

并显式开启写入门禁：

```powershell
$env:MYSQL_TEST_DATABASE = 'mealpilot_test'
$env:PHASE_1C_ALLOW_DB_WRITES = '1'

cd E:\Database_Design\server
npm run test:integration
```

Integration runner 可以在测试库执行重建和清理，因此：

> **绝对不要把 `MYSQL_TEST_DATABASE` 指向生产数据库 `mealpilot`。**

最近一次文档重构没有重新执行 Integration Test，因此 README 不把历史 46/46 结果描述为当前最新验证结果。

---

## 17. 系统菜谱图片

系统菜谱源素材位于：

```text
resources/recipe-images/
```

线上对象位于：

```text
CloudBase Storage
└─ system/recipes/
```

运行时映射：

```text
server/src/data/system-recipe-covers.js
```

当前：

```text
Starter Recipes：48
System Cover Mappings：47
```

“红豆小米粥”目前没有系统封面映射，前端使用无封面 fallback。

---

## 18. 安全边界

### 服务端 Secret

以下信息只能存在于服务端环境：

```text
MYSQL_PASSWORD
JWT_SECRET
WECHAT_APP_SECRET
CLOUDBASE_APIKEY
```

不能进入：

- Git
- README 中的真实值
- 微信小程序包
- API Response
- 前端日志

### Storage

CloudBase Storage 当前为私有权限。

小程序没有 CloudBase 服务端 API Key。

访问模型：

```text
Authenticated User
        ↓
MealPilot Backend
        ↓
权限校验
        ↓
CloudBase Temporary URL
        ↓
Mini Program
```

临时 URL 本身在有效期内可直接访问，因此不要把它当作永久权限凭证。

---

## 19. 当前限制

以下属于当前明确的后续范围，不是已实现能力：

- 多 Family / Family Switch
- Family Delete
- Refresh Token / Token Blacklist / 多设备 Session 中心
- Menu completed workflow
- 推荐系统长期行为学习
- Feedback 驱动推荐学习
- AI / LLM / Collaborative Filtering
- Storage orphan 自动回收
- Storage 病毒扫描
- 更完整的监控、备份和灾备
- 正式自定义域名
- 自动化微信真机 E2E

---

## 20. 当前发布阶段

目前状态：

```text
Backend                   ✅
MySQL                     ✅
CloudBase Storage         ✅
系统菜谱图片迁移            ✅
头像上传                    ✅
菜谱封面上传                ✅
Production API 配置        ✅
Backend Direct Tests      ✅
MiniProgram Tests         ✅

微信真机完整验收             进行中
微信体验版                   待完成
微信审核                     待完成
正式发布                     待完成
```

下一阶段主要围绕微信小程序发布，不需要重新设计后端存储架构。

---

## 21. License / 素材说明

部分 Demo 菜谱图片来自 Pexels、Unsplash 或其他公开来源。

其中部分小红书素材仅标记为：

```text
REFERENCE_ONLY
```

公开可访问不等于获得正式商业授权。

详细来源与许可记录：

[菜谱图片素材来源说明](docs/菜谱图片素材来源说明.md)

如果 MealPilot 后续公开商业化，应优先替换为：

- 自有拍摄素材
- 用户上传内容
- 明确获得授权的图库素材
- 具有清晰商业使用许可的素材

---

## 22. 项目文档事实优先级

当不同历史文档之间出现冲突时，按以下顺序判断：

```text
当前运行代码 / database Schema / migrations
        ↓
当前配置
        ↓
当前测试结果
        ↓
docs/ 正式文档
        ↓
docs/归档/ 历史记录
```

历史归档仅用于追溯，不代表当前生产状态。

---

**MealPilot / 饭有谱**

> Plan less. Eat better.
