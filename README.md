# MealPilot / 饭有谱

> **Plan less. Eat better.**

MealPilot（饭有谱）是一款面向家庭场景的微信小程序，用于管理家庭菜谱、菜单、成员偏好与忌口，并基于真实家庭数据生成可解释的配餐推荐。

本文档对应当前最新架构基线：`refactor/cloud-container-transport`（2026-09-24）。该版本已经把生产小程序的普通 API 调用切换为 `wx.cloud.callContainer`，图片上传则采用 Backend prepare → `wx.cloud.uploadFile` → Backend commit 的两阶段流程。后端仍然是 Node.js + Express，结构化业务数据继续保存在 MySQL，图片保存在 CloudBase 私有 Storage。

---

## 1. 项目定位

饭有谱不是单纯的“菜谱展示”程序。系统把用户、家庭成员、菜谱、食材、标签、菜单、偏好、忌口、推荐和反馈放在同一套关系模型中管理，让数据库中的数据能够继续参与筛选、组合、评分和统计。

当前主要能力包括：

- 微信登录：`wx.login → code2Session → OpenID → JWT`
- 首次资料完善：昵称、头像、`profileComplete`
- 家庭管理：创建、邀请码加入、改名、成员移除、管理员转移、退出、解散、恢复
- 菜谱管理：查询、搜索、新增、编辑、软删除、食材明细、标签与封面
- 菜单管理：按日期和餐次维护菜单，支持手动加菜、删除、备注
- 成员忌口与类别偏好：直接参与推荐约束和评分
- 菜谱推荐：完整菜单组合、硬过滤、六维评分、受控探索、最多三套候选
- 用餐反馈：1～5 星评分与文字反馈
- 家庭洞察：7 天 / 30 天菜单数量、菜品数量、平均评分、热门菜谱
- 私有媒体存储：CloudBase Storage + 稳定 `cloud://` File ID + 临时 HTTPS 展示 URL
- 家庭与账号生命周期：归档恢复、延迟清理、`storage_cleanup_jobs`

推荐系统属于**基于数据库多源数据的规则推荐与加权评分模型**，不是机器学习、协同过滤或大模型推荐。

---

## 2. 当前生产架构

### 2.1 普通业务 API

生产小程序不再直接通过 CloudBase 默认公网测试域名调用后端，而是通过 CloudBase 托管调用链路访问 `mealpilot-api`：

```text
微信小程序
    ↓
wx.cloud.callContainer
    ↓
CloudBase 环境 cloud1-d1gvr0mwv39a12cbd
    ↓
mealpilot-api
    ↓
Node.js + Express
    ↓
JWT / Family Boundary / Service
    ↓
MySQL
```

调用时仍然携带业务 JWT：

```text
X-WX-SERVICE: mealpilot-api
Authorization: Bearer <JWT>
```

`callContainer` 负责“小程序如何找到后端”，JWT 继续负责“当前 MealPilot 用户是谁”，两者职责不同。

### 2.2 图片上传

生产环境的头像和菜谱封面不再把图片二进制塞入 `callContainer`。当前流程是：

```text
① 小程序
   ↓ callContainer
POST /api/uploads/{avatar|recipe-cover}/prepare

② Backend
   ↓ JWT / Family 校验
生成 staging 路径并登记 24 小时后可清理的 Storage Job

③ 小程序
   ↓ wx.cloud.uploadFile
CloudBase Storage / staging/...
   ↓
得到 cloud:// File ID

④ 小程序
   ↓ callContainer
POST /api/uploads/{avatar|recipe-cover}/commit

⑤ Backend
   ↓
校验 File ID 与 staging 范围
   ↓
downloadFile / getFileInfo
   ↓
大小校验（最大 5MB）
   ↓
JPEG / PNG / WebP magic bytes 校验
   ↓
转存正式路径
   ↓
写入 MySQL 中的稳定 File ID
   ↓
删除 staging 文件与清理任务
```

正式路径由 Backend 决定：

```text
system/recipes/                         系统菜谱封面
users/<userId>/avatars/                 用户头像
families/<familyId>/recipes/            家庭菜谱封面
staging/users/<userId>/avatars/         头像临时上传区
staging/families/<familyId>/recipes/    菜谱封面临时上传区
```

这样既使用了 CloudBase 专门的文件上传能力，又保留了服务端对用户、家庭、文件大小和真实图片格式的最终控制。

### 2.3 开发环境

本地开发仍保留传统 HTTP 方式：

```text
development
    ↓
wx.request / wx.uploadFile
    ↓
http://127.0.0.1:3000/api
    ↓
Express
```

生产与开发共用同一套上层 API 封装，页面无需关心底层 transport。

---

## 3. 技术栈

| 层级 | 技术 |
|---|---|
| 小程序前端 | 微信原生小程序 WXML / WXSS / JavaScript |
| 生产传输 | `wx.cloud.callContainer`、`wx.cloud.uploadFile` |
| 后端 | Node.js 24 + Express 5 |
| 数据库 | MySQL 8.0+ / InnoDB / utf8mb4 |
| 数据访问 | mysql2/promise |
| 鉴权 | `wx.login` + code2Session + OpenID + JWT |
| 参数校验 | zod |
| 对象存储 | CloudBase 私有 Storage |
| Cloud SDK | `@cloudbase/node-sdk` |
| 部署 | CloudBase 云托管 + Docker |
| 测试 | Node.js 内置 `node:test` |
| 版本控制 | Git / GitHub |

---

## 4. 数据库设计

当前 `database/01_schema.sql` 定义 **20 张业务表**，共 **29 条外键**。

### 4.1 业务表

```text
users
families
family_members
storage_cleanup_jobs
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

### 4.2 核心关系

```text
User
  ↓ family_members
Family
  ├─ Recipe
  │    ├─ recipe_ingredients → Ingredient
  │    └─ recipe_tags → TagDefinition
  ├─ RecommendationRun
  │    └─ RecommendationCandidate
  │          └─ RecommendationCandidateItem → Recipe
  └─ Menu
       └─ MenuItem → Recipe
            └─ MenuFeedback
```

Family 是主要逻辑租户边界。后端先根据 JWT 确认用户，再根据有效 `family_members` 关系得到真正的 `family_id`，业务查询不会信任客户端任意传入的家庭编号。

### 4.3 完整性策略

数据库和应用层共同承担完整性检查：

- 主键 / 复合主键：保证实体或关联唯一
- 外键：保证引用对象存在
- `UNIQUE`：邀请码、菜单槽位、候选排名、反馈等业务唯一性
- `CHECK` / `ENUM`：评分、份数、月份、角色、状态和值域限制
- 事务：菜谱多表写入、家庭初始化、推荐持久化、候选应用等
- 应用层 Family 校验：补足“两个外键都存在但不属于同一家庭”这一类跨表业务约束

---

## 5. 微信登录与会话

正式登录链路：

```text
点击微信登录
    ↓
wx.login()
    ↓
临时 code
    ↓
wx.cloud.callContainer
POST /api/auth/wechat-login
    ↓
Backend 调用 code2Session
    ↓
OpenID
    ↓
users
    ↓
JWT
```

新用户登录成功后，如果昵称仍为默认值或头像 File ID 为空，会进入 `pages/profile-setup/index`。资料完善后再次读取 `/auth/me`，确认 `profileComplete=true` 再进入业务页面。

HTTP Client 保留 401 自动恢复机制：多个并发 401 共用同一个重新认证 Promise，原请求最多重试一次，避免循环重登。

---

## 6. 推荐系统

推荐不是从菜谱表随机抽取数据，而是先过滤，再生成完整菜单组合，最后对组合进行评分。

### 6.1 主要流程

```text
读取当前家庭有效菜谱
    ↓
汇总家庭成员忌口
    ↓
硬过滤 + 分类容量检查
    ↓
生成满足菜单结构的完整组合（最多 300 组原始候选）
    ↓
计算六维评分
    ↓
质量窗口 / 受控探索
    ↓
候选差异化
    ↓
最多保存 3 套候选
    ↓
应用前再次校验忌口、菜谱状态和菜单结构
    ↓
事务写入 Menu / MenuItem
```

### 6.2 综合评分

| 维度 | 权重 |
|---|---:|
| Preference | 30 |
| Ingredient Diversity | 15 |
| Method Diversity | 10 |
| Nutrition | 15 |
| Seasonal | 10 |
| Novelty | 20 |

近期重复惩罚：目标日期前 3 天内出现过的菜谱扣 20 分，4～7 天扣 8 分，超过 7 天不再扣分。

准备时间估算：

```text
estimatedPrepMinutes
= longestCookMinutes
+ ceil((sumCookMinutes - longestCookMinutes) * 0.5)
```

---

## 7. 目录结构

```text
mealpilot/
├─ miniprogram/                 微信小程序
│  ├─ pages/                    页面
│  ├─ utils/                    API、Auth、Route Guard、工具函数
│  ├─ app.js
│  ├─ app.json
│  └─ config.js                 development / production transport
├─ server/                      Node.js + Express Backend
│  ├─ src/
│  │  ├─ routes/
│  │  ├─ services/
│  │  ├─ recommendation/
│  │  ├─ middleware/
│  │  └─ scripts/
│  ├─ test/
│  └─ Dockerfile
├─ database/
│  ├─ 01_schema.sql
│  ├─ 02_seed.sql
│  └─ 04~12_*.sql              历史迁移脚本
├─ tests/miniprogram/           小程序自动化测试
├─ resources/                   系统菜谱图片等资源
└─ docs/                        架构、数据库、课程设计和图表文档
```

---

## 8. 环境配置

### 8.1 小程序

生产环境核心配置：

```js
transport: 'cloud'
cloudEnvId: 'cloud1-d1gvr0mwv39a12cbd'
cloudServiceName: 'mealpilot-api'
cloudApiPrefix: '/api'
allowDevLogin: false
```

本地开发：

```js
transport: 'http'
apiBaseUrl: 'http://127.0.0.1:3000/api'
```

旧 `sh.run.tcloudbase.com` 地址只保留给历史 `/uploads/...` URL 的兼容逻辑，不再是生产普通 API 和新图片上传的主通道。

### 8.2 Backend 环境变量

生产环境至少需要：

```text
NODE_ENV=production
PORT=3000

MYSQL_HOST=...
MYSQL_PORT=...
MYSQL_USER=...
MYSQL_PASSWORD=...
MYSQL_DATABASE=mealpilot

JWT_SECRET=...
DEV_AUTH_ENABLED=false

WECHAT_APP_ID=...
WECHAT_APP_SECRET=...

CLOUDBASE_ENV_ID=cloud1-d1gvr0mwv39a12cbd
CLOUDBASE_FILE_ID_PREFIX=cloud://...
CLOUDBASE_APIKEY=...
```

真实密钥、密码、AppSecret、API Key 不应进入 Git 仓库、小程序包或文档正文。

---

## 9. 本地运行

### 9.1 初始化 Backend

```powershell
cd server
npm ci
```

配置本地 `.env` 后运行：

```powershell
npm run dev
```

健康检查：

```text
GET http://127.0.0.1:3000/api/health
```

### 9.2 数据库

全新环境按项目脚本初始化：

```powershell
npm run db:init
npm run db:seed
```

已有数据库升级使用编号迁移脚本，并先备份数据。当前正式 Schema 以 `database/01_schema.sql` 为最终结构参考。

### 9.3 微信小程序

使用微信开发者工具打开仓库根目录。`project.config.json` 已指定 `miniprogram/` 为小程序根目录。

开发环境调本地 Backend 时，需要将 `miniprogram/config.js` 的活动环境切换到 development；提交或上传生产版本前必须切回 production。

---

## 10. CloudBase 部署

Backend 使用 Docker 镜像：

```dockerfile
FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["npm", "start"]
```

部署后重点检查：

1. `mealpilot-api` 容器可正常启动。
2. `wx.cloud.callContainer` 可以访问 `/api/health` 与登录接口。
3. MySQL 连接正常，登录、家庭、菜谱、菜单和推荐能够读写。
4. 图片 `prepare → uploadFile → commit` 链路正常。
5. Storage 客户端写权限仅开放给 staging 目录；`system/`、`users/`、`families/` 等正式资源目录应由 Backend 管理。
6. 私有图片临时 URL 能正常生成和展示。

> **注意：** staging 路径隔离不仅是代码问题，还依赖 CloudBase Storage 控制台的安全规则。正式发布前必须验证客户端无法绕过 Backend 直接写入正式资源目录。

---

## 11. 主要 API

| 模块 | 主要接口 |
|---|---|
| Auth | `POST /auth/wechat-login`、`GET /auth/me`、`PUT/PATCH /auth/profile`、`DELETE /auth/account` |
| Family | `POST /families`、`POST /families/join`、`GET /families/current`、`PUT/PATCH /families/current/name`、管理员转移/退出/解散/恢复 |
| Recipe | `GET/POST /recipes`、`GET/PUT/DELETE /recipes/:id`、`GET /ingredients` |
| Tag | `GET/POST /tags`、`PUT/DELETE /tags/:id` |
| Menu | `GET /menus`、`GET /menus/dates`、`POST /menus/items`、`DELETE /menus/items/:id` |
| Recommendation | `POST /recommendations`、`POST /recommendations/tag-availability`、候选读取与应用 |
| Preference | 成员类别偏好 GET / PUT / DELETE |
| Restriction | 成员食材忌口 GET / POST / DELETE |
| Feedback | 菜单项反馈 GET / PUT / DELETE |
| Insights | `GET /insights?days=7|30` |
| Upload（生产） | `POST /uploads/avatar/prepare`、`POST /uploads/avatar/commit`、`POST /uploads/recipe-cover/prepare`、`POST /uploads/recipe-cover/commit` |
| Upload（开发兼容） | `POST /uploads/avatar`、`POST /uploads/recipe-cover` multipart |

---

## 12. 测试

Backend：

```powershell
cd server
npm test
```

小程序：

```powershell
npm test --prefix tests/miniprogram
```

本轮 cloud transport / staged upload 相关测试重点覆盖：

- `callContainer` 路径、Service Header、Bearer JWT
- 401 重认证及并发重认证复用
- production cloud / development HTTP 双 transport
- `prepare → wx.cloud.uploadFile → commit`
- staging 路径归属校验
- 5MB 上限和 JPEG / PNG / WebP magic bytes
- 非法 / 未 prepare / 跨用户或跨家庭 File ID 拒绝
- 数据库写入失败时正式文件回滚
- staging 文件延迟清理兜底

真实 MySQL 集成测试应只在独立测试库和明确写入开关下执行。

---

## 13. 发布前检查

- [ ] production transport 为 `cloud`
- [ ] `allowDevLogin = false`
- [ ] `WECHAT_APP_ID / APP_SECRET` 与当前小程序一致
- [ ] JWT 与数据库密钥已配置
- [ ] `wx.cloud.callContainer` 真机登录正常
- [ ] `wx.cloud.uploadFile` 真机头像和菜谱封面正常
- [ ] Storage 安全规则只允许客户端写 staging
- [ ] Backend 能下载、校验并转存 staging 文件
- [ ] 私有图片临时 URL 展示正常
- [ ] 家庭边界、管理员操作、账号注销正常
- [ ] 推荐生成、换一组、应用菜单正常
- [ ] 后端和小程序测试通过
- [ ] 数据库已备份并确认 Schema / Seed / Migration 版本

---

## 14. 当前设计边界

目前一个用户同时最多拥有一个 active Family；推荐模型仍然是人工规则和固定权重；Storage Cleanup 仍由应用进程驱动，没有独立任务队列；生产环境还需要继续完善端到端监控、告警、性能压测和数据库备份恢复演练。

这些限制不会影响当前课程设计和小规模使用，但如果后续面向更多真实用户，优先级会高于继续堆叠页面功能。
