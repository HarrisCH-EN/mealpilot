# 饭有谱当前版本说明

更新时间：2026-09-16（Asia/Shanghai）

本文是当前实现的统一事实来源。代码行为、数据库结构和测试结果发生变化时，先更新本文，再同步 README、前端交接文档和课程报告。`docs/superpowers/` 下的 plan/spec 是迭代过程记录，保留原始方案和决策，不作为当前接口说明。

## 当前功能

- 全局强制登录：未登录、令牌缺失或令牌失效时只能停留在 `pages/login/index`；登录成功后进入推荐页。
- 正式微信登录：小程序 `wx.login`、服务端 `code2Session`、OpenID 映射和 JWT 会话。
- 开发登录：仅在开发配置且后端 `DEV_AUTH_ENABLED=true` 时显示，用于本地开发和自动化测试。
- 全局用户资料：用户名和头像由账号接口持久化，在设置、账号管理、家庭成员和成员忌口页面共用。
- 家庭管理：创建家庭、邀请码加入、家庭名称修改、成员列表、退出家庭和家庭权限展示。
- 家庭角色：`owner`、`admin`、`member`。普通成员可以查看和复制邀请码；管理员可以改名、刷新邀请码和管理成员；创建者可以向 active 成员移交创建者身份。
- 邀请码：密码学随机生成 6 位数字/大小写字母组合，数据库使用 ASCII 区分大小写；管理员刷新后旧码立即失效。
- 菜谱、食材、封面、标签、菜单、推荐、忌口、偏好、反馈和家庭洞察均使用真实后端接口和数据库持久化；洞察支持近 7 天和近 30 天筛选。

## 认证与页面入口

小程序启动时和业务页面进入时都会执行统一认证检查。登录页检测到已有有效会话会进入推荐页；退出登录会清理 Token、用户资料和家庭资料并 `reLaunch` 到登录页。业务页面不再展示“未登录”提示或业务内登录按钮。

登录成功但没有家庭的用户仍可以进入业务页中的家庭设置入口，创建家庭或输入邀请码加入家庭；“没有家庭”与“没有登录”是两个不同状态。

## 数据库边界

运行中的后端业务库是 `smart_meal`。`smart_meal_test` 只用于 Real MySQL Integration 测试，测试 runner 可以在该库内重建和清理数据，不应在生产环境使用。

当前 `database/01_schema.sql` 定义 19 张表，包含角色、大小写敏感邀请码、标签、推荐候选、菜单和反馈结构。新库使用 `00_create_user.sql`、`01_schema.sql` 和按需执行的 `02_seed.sql`；已有旧库必须按数据库演进顺序执行 `04`～`08`，再执行 `09_family-admin-role.sql`、`10_family-invite-code.sql` 或使用后端的 `npm run db:migrate` 完成家庭管理结构校正。`npm run db:migrate` 当前只负责家庭管理结构预检，不替代全部历史迁移。

## 主要接口

| 模块 | 当前接口范围 |
| --- | --- |
| 认证 | `POST /auth/wechat-login`、`POST /auth/dev-login`、`GET /auth/me`、`PATCH /auth/profile` |
| 头像 | `POST /uploads/avatar` |
| 家庭 | 创建、加入、当前家庭、改名、读取/刷新邀请码、退出、移交创建者、成员角色和移除 |
| 菜谱与标签 | 菜谱 CRUD、食材、封面上传、系统/自定义标签 CRUD |
| 菜单与推荐 | 菜单日期、菜单项、推荐生成、候选切换、推荐应用、洞察（`GET /insights?days=7|30`） |
| 成员设置 | 成员忌口、分类偏好、菜单反馈 |

完整路径和请求契约以 [README.md](/E:/Database_Design/README.md) 与 [FRONTEND_HANDOFF.md](/E:/Database_Design/docs/FRONTEND_HANDOFF.md) 为准。

数据库行数、完整性检查和待审核清理项见 [DATABASE_AUDIT_REPORT_V2.md](/E:/Database_Design/docs/DATABASE_AUDIT_REPORT_V2.md)。课程设计报告见 [Word 版报告](/E:/Database_Design/docs/基于微信小程序的家庭膳食管理与菜谱推荐系统_课程设计报告_最终排版版.docx)。

## 当前验证结果

| 验证项 | 结果 |
| --- | --- |
| Backend Direct | 196/196 通过 |
| Real MySQL Integration | 46/46 通过，使用 `smart_meal_test` |
| 小程序源代码测试 | 147/147 通过 |
| JavaScript 语法检查 | 后端 42 个文件、小程序非测试代码 21 个文件通过 |
| 业务库只读完整性 | 外键孤儿、跨家庭关系、重复 active 家庭关系、空家庭名称均为 0 |
| 微信开发者工具真实点击 E2E | 尚未完成；端口 21746 当前没有可用监听 |

当前自动化测试基线为全绿；微信开发者工具真实点击 E2E 仍需单独完成。

## 上线前仍需配置

需要替换小程序 production API placeholder、配置 HTTPS 和微信 request 合法域名，生产环境关闭开发登录，部署后端和 `smart_meal`，为上传目录、密钥、备份和监控建立生产配置，并完成开发者工具和真机的登录、家庭、头像、封面、菜单、推荐、反馈、退出登录验收。
