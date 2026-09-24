# MealPilot 架构分析（代码基线 `da1ca21`）

分析日期：2026-09-24。先阅读工作区 README，再核对当前 `main` 对应的客户端、Backend、数据库 Schema、上传与推荐代码。README 的工作区版本尚有未提交改动，且仍把代码基线写成 `17ccf14`；下文以 Git `da1ca21` 和实际源码为准。此分析描述**代码架构**，不把部署配置或真机验收推定为已完成。

- [交互式系统总览](./mealpilot-architecture.html) · [可编辑 JSON 规格](./mealpilot-architecture.json)
- [交互式图片上传时序](./mealpilot-upload-sequence.html) · [可编辑 JSON 规格](./mealpilot-upload-sequence.json)

## 1. 总体判断

MealPilot 是原生微信小程序、CloudBase 云托管上的 Express API、MySQL 和 CloudBase Storage 组成的家庭配餐系统。小程序有两类生产传输：普通 JSON 数据通过 `wx.cloud.callContainer` 到 `mealpilot-api`；图片先通过 `wx.cloud.uploadFile` 进入 Storage 的 `staging/`，再由 Backend 在 commit 阶段下载、验真并写入正式路径。开发环境仍使用 localhost 的 `wx.request` 和 multipart `wx.uploadFile`。[客户端配置](../../miniprogram/config.js) · [传输封装](../../miniprogram/utils/http-client.js) · [上传路由](../../server/src/routes/uploads.js)

CloudBase 传输负责到达服务；业务身份仍由 `wx.login → code2Session → OpenID → JWT` 建立。受保护 API 在 Express 读取 Bearer Token，再按当前 `family_members` 记录限定家庭范围。Storage File ID 是持久引用，临时 HTTPS URL 只用于展示。[微信认证服务](../../server/src/services/wechat-auth-service.js) · [认证中间件](../../server/src/middleware/authenticate.js) · [媒体 URL 服务](../../server/src/services/media-url-service.js)

## 2. 分层与责任

| 层 | 职责 | 代码依据 |
| --- | --- | --- |
| 小程序页面与 API 门面 | 页面调用 `request`、`uploadAvatar`、`uploadFile`；页面不处理容器细节 | [api.js](../../miniprogram/utils/api.js)、[auth-runtime.js](../../miniprogram/utils/auth-runtime.js) |
| 传输与会话 | 生产 `callContainer` + `X-WX-SERVICE`；开发 HTTP；Bearer JWT、401 共用重认证并最多重试一次 | [config.js](../../miniprogram/config.js)、[http-client.js](../../miniprogram/utils/http-client.js)、[auth-service.js](../../miniprogram/utils/auth-service.js) |
| Express 边界 | `/api` 路由，认证、家庭角色、参数校验与统一错误返回 | [app.js](../../server/src/app.js)、[authenticate.js](../../server/src/middleware/authenticate.js) |
| 业务服务 | 家庭、菜谱、菜单、反馈、标签、偏好、忌口，以及确定性规则推荐 | [路由目录](../../server/src/routes)、[推荐引擎](../../server/src/services/recommendation/menu-recommendation-engine.js) |
| MySQL | 业务实体、家庭关系、推荐运行与候选、Storage 清理任务；事务保证相关写入一致 | [01_schema.sql](../../database/01_schema.sql)、[recommendation-run-service.js](../../server/src/services/recommendation-run-service.js) |
| Storage 与生命周期 | staging 验货、正式文件、临时 URL、旧头像与家庭文件清理 | [uploads.js](../../server/src/routes/uploads.js)、[cloud-storage-service.js](../../server/src/services/cloud-storage-service.js)、[family-lifecycle-service.js](../../server/src/services/family-lifecycle-service.js) |

`database/01_schema.sql` 当前定义 **20 张表、29 条外键**。`users`、`families`、`family_members` 是身份和租户边界；菜谱、菜单、成员限制及推荐结果均带家庭或成员关系。管理员检查同时核对成员角色和 `families.admin_user_id`，避免两处管理员状态不一致。[Schema](../../database/01_schema.sql) · [家庭中间件](../../server/src/middleware/authenticate.js)

## 3. 关键请求链

### 微信登录与普通业务

1. 小程序启动时，只有 cloud transport 才调用 `wx.cloud.init`；主动登录用 `wx.login` 取得 code。[app.js](../../miniprogram/app.js) · [wechat-auth.js](../../miniprogram/utils/wechat-auth.js)
2. `httpClient.request('/auth/wechat-login')` 归一化为 `/api/auth/wechat-login`，交给 `callContainer`。Backend 用 code2Session 得到 OpenID，查/建用户并签发 JWT。[http-client.js](../../miniprogram/utils/http-client.js) · [auth-service.js](../../server/src/services/auth-service.js)
3. 后续请求携带 `Authorization: Bearer <JWT>`；认证中间件查当前用户，家庭中间件查唯一 active 家庭成员关系。数据库查询继续按 `family_id` 限定。[authenticate.js](../../server/src/middleware/authenticate.js) · [recipes.js](../../server/src/routes/recipes.js)
4. 401 由客户端复用同一个重认证 Promise，原请求最多自动重试一次；无法恢复时清理会话。[http-client.js](../../miniprogram/utils/http-client.js)

旧 `sh.run.tcloudbase.com` 地址仍保留在生产 `apiBaseUrl`，目前用于历史 `/uploads/...` 值的展示兼容；普通生产 API 和新图片上传不使用它。历史数据若仍有这种相对路径，显示环节仍可能依赖旧地址。[config.js](../../miniprogram/config.js) · [api.js](../../miniprogram/utils/api.js)

### 图片上传

`httpClient.upload()` 对页面保持原接口。生产链路为 `POST prepare`（JWT/Family 决定 staging 路径并登记 24 小时清理任务）→ `wx.cloud.uploadFile`（文件字节直达 Storage）→ `POST commit`（核对 JWT 范围、UUID 和 prepare 记录，`downloadFile` 取 Buffer，检查不超过 5 MB 及 JPEG/PNG/WebP magic bytes，写正式路径，返回 File ID/临时 URL）。头像 commit 更新 `users.avatar_url` 并尝试删除旧头像；菜谱封面 commit 返回正式 File ID，菜谱保存时才写入 `recipes.cover_url`。开发链路继续使用 multipart 上传。[http-client.js](../../miniprogram/utils/http-client.js) · [uploads.js](../../server/src/routes/uploads.js) · [cloud-storage-service.js](../../server/src/services/cloud-storage-service.js) · [recipe-form](../../miniprogram/pages/recipe-form/index.js)

### 推荐与生命周期

`POST /recommendations` 的当前菜单结构请求在家庭事务内校验偏好与标签、加载本家庭候选菜谱、按忌口和低评分做硬过滤，再生成结构化候选、评分并持久化；Apply 前再次校验候选与家庭归属。既有旧参数分支仍在路由中，不能把推荐模型概括成单一新接口。[menus.js](../../server/src/routes/menus.js) · [menu-recommendation-engine.js](../../server/src/services/recommendation/menu-recommendation-engine.js) · [recommendation-run-service.js](../../server/src/services/recommendation-run-service.js)

家庭解散走归档与到期清理。服务启动时运行一次、随后每小时运行生命周期清理；到期的 `storage_cleanup_jobs` 删除 Storage 文件，失败按退避策略重试。准备过但未上传的 staging File ID 可在清理时按“文件不存在”完成任务。[server.js](../../server/src/server.js) · [family-lifecycle-service.js](../../server/src/services/family-lifecycle-service.js)

## 4. 当前边界与风险

1. **线上 Storage 写权限未完成路径隔离。** 2026-09-24 对 `cloud1-d1gvr0mwv39a12cbd` 控制台的只读检查显示仍选中“仅创建者及管理员可读写”，尚未启用 staging-only 规则。客户端因此可以自行选择正式目录路径；[菜谱封面校验](../../server/src/routes/recipes.js)只核对当前家庭正式路径前缀，不能证明该 File ID 经 commit 验货。图中描绘的 `staging → final` 是**正常业务流程**，不能替代 Storage 规则的实际隔离。
2. **大小上限在 Backend 下载后才核对。** [downloadBuffer](../../server/src/services/cloud-storage-service.js)调用 SDK 的 `downloadFile` 返回 Buffer 后检查长度；在客户端写规则未限制大小前，恶意上传可能先占用 Storage 和 Backend 下载内存。
3. **文件清理存在覆盖范围差异。** prepare 登记的 staging File ID 有 24 小时任务；客户端绕开 prepare 自选 staging 路径不会登记任务。封面 commit 成功、用户放弃保存菜谱时，正式文件也没有对应菜谱记录或清理任务。[uploads.js](../../server/src/routes/uploads.js) · [recipe-form](../../miniprogram/pages/recipe-form/index.js)
4. **旧图片兼容与测试债务。** 历史 `/uploads/...` 值仍可走旧公网 URL；后端直接测试中一项旧断言要求 `miniprogram/assets/recipes/` 的图片存在，但 `main` 未追踪该目录，应按真实资源分发策略修复测试与历史展示数据。[api.js](../../miniprogram/utils/api.js) · [recipe-images.test.js](../../server/test/recipe-images.test.js)

上述第一项是发布安全门槛；此文档和图表没有修改线上规则、服务部署或数据。规则表达式应在控制台验证新建对象的身份与大小语义，并用真机分别核验 staging 成功、正式目录拒写、超 5 MB 拒写、Backend 正式写入和旧图展示。

## 5. 验证范围

同一代码提交 `da1ca21` 的最近一次直接测试结果：小程序 **204/204 通过**；后端 **264/265 通过**，失败的是上述旧图片资源断言。图表生成后仅新增本目录文档，没有修改业务代码；未运行真实设备上的完整图片链，也未把测试通过等同于线上规则验收。

两个 HTML 均按 Archify `showcase` 交付：各自静态检查 **9/9，0 错误、0 警告**；自动浏览器检查在 1440×900、1600×1000、1920×1080、2048×1320 下无桌面溢出，并生成浅色和深色截图。截图供人工审阅，不能充当线上功能测试。
