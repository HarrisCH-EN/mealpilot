# 饭有谱交付前全面审计报告

审计日期：2026-09-16（Asia/Shanghai）  
审计范围：后端接口、业务逻辑、数据库结构与业务数据、小程序页面与交互契约、测试体系、依赖安全、上线配置。  
审计原则：本轮不删除旧代码、迁移、测试数据、业务数据或上传文件；所有清理项只做识别，等待审核。

本报告是 2026-09-16 的交付审计快照；当前功能说明和后续文档同步以 [CURRENT_VERSION.md](/E:/Database_Design/docs/CURRENT_VERSION.md) 为准。本轮已确认业务数据库为 `mealpilot`，集成测试库为 `mealpilot_test`。

## 1. 结论摘要

当前版本的本地代码与测试门禁已完成本轮修复；生产发布仍需要真实 HTTPS API 地址、微信合法域名和开发者工具/真机验收。

已通过的部分：

- Backend Direct：196/196 通过。
- Real MySQL Integration：46/46 通过，使用独立的 `mealpilot_test`，没有写入业务库 `mealpilot`。
- JavaScript 语法检查：后端与小程序共 119 个 JavaScript 文件通过。
- 数据库只读完整性检查：外键孤儿、跨家庭关系、重复 active 家庭关系、空家庭名称均为 0。
- `npm audit --registry=https://registry.npmjs.org --omit=dev --audit-level=moderate`：0 vulnerabilities。
- 可见 WXML 事件与页面 handler 的静态契约检查通过，没有发现明显的“按钮绑定了不存在的方法”。

尚未通过的部分：

- MiniProgram：147/147 通过；标签管理、推荐页和洞察范围按钮测试口径已按当前设计更新。
- 微信开发者工具真实点击式 E2E/截图审计没有完成：桌面上存在微信开发者工具窗口，但 TCP 端口 21746 当前没有监听，当前自动化控制层也没有暴露可操作的原生窗口。因此不能把本轮结果描述为“已完成全部实机交互测试”。
- 当前小程序配置仍是 `development`，API 指向 `127.0.0.1:3000`，生产地址仍是 placeholder。
- 后端 `db:migrate` 已按顺序记录并执行数据库 `04` 到 `10` 的历史迁移，并支持隔离新版标签结构与重复执行。

建议交付状态：

> 本地代码与测试：通过；生产部署：等待真实环境配置与实机验收；数据库清理：等待审核。

## 2. 测试证据

### 2.1 后端测试

执行命令：

```powershell
cd E:\Database_Design\server
npm test
```

结果：

| 套件 | 数量 | 通过 | 失败 | 备注 |
|---|---:|---:|---:|---|
| Backend Direct | 196 | 196 | 0 | 不连接业务 MySQL，包含路由、服务、事务、并发、Schema、认证、配置、迁移入口和洞察范围测试 |
| Backend Real MySQL Integration | 46 | 46 | 0 | 连接独立 `mealpilot_test`，真实执行约束、事务、并发、家庭隔离、推荐、标签、反馈、上传 |

真实集成测试执行时设置了：

```powershell
$env:MYSQL_TEST_DATABASE = 'mealpilot_test'
$env:PHASE_1C_ALLOW_DB_WRITES = '1'
npm run test:integration
```

集成测试 runner 会 DROP/CREATE/清理 `mealpilot_test`。这是测试库范围内的预期行为，没有触碰 `MYSQL_DATABASE=mealpilot`。

### 2.2 小程序测试

执行命令：

```powershell
cd E:\Database_Design\miniprogram
node scripts/run-tests.js
```

结果：147 项，147 通过，0 失败，0 skipped。

本轮已将测试断言更新为当前设计：默认标签只读文案、时间刻度指针结构、偏好抽屉标题和当前推荐首页文案；同时保留 API、候选切换、candidateId Apply 等行为契约。

### 2.3 静态检查

- 后端与小程序 JavaScript：119 个，`node --check` 全部通过。
- WXML 可见事件 handler：已有测试覆盖，当前通过。
- `git diff --check`：通过；只有工作区既有的换行格式提示，没有发现空白错误。
- `npm audit`：0 vulnerabilities。

## 3. API 与功能覆盖

后端目前静态注册了 45 个业务 API route，另有 `/api/health` 健康检查；上传目录还提供静态文件访问。

覆盖情况：

| 模块 | 覆盖结论 |
|---|---|
| 微信登录、开发登录、JWT、`/auth/me` | Direct 测试通过；正式微信 provider 的错误映射有测试 |
| 用户名更新、头像上传 | Direct 测试通过；隔离 MySQL 测试覆盖头像文件与用户记录 |
| 创建家庭、加入家庭、家庭查询 | Direct/家庭管理测试通过 |
| 家庭重命名 | Direct 测试通过，管理员权限覆盖 |
| 邀请码读取、6 位大小写数字字母生成、管理员刷新、旧码失效 | Direct 测试通过 |
| 角色设置、管理员/普通成员边界、移交创建者、离开和移除成员 | Direct 测试通过 |
| 菜谱、食材、菜谱食材关系、软删除、封面上传 | Direct + Real MySQL Integration 通过 |
| 菜单、菜单项、重复添加、并发、跨家庭隔离 | Direct + Real MySQL Integration 通过 |
| 推荐旧兼容路径、canonical Generate、候选、Apply、过期和限制重校验 | Direct + Real MySQL Integration 通过 |
| 忌口、偏好、标签 | Direct + Real MySQL Integration 通过 |
| 评分、洞察 | Direct + Real MySQL Integration 通过 |

覆盖边界：

- 真实 MySQL Integration 主要覆盖业务数据链路；认证/家庭管理部分更多依赖 Direct 的模拟数据库/路由测试，尚未在真实测试库中把每一条家庭管理 HTTP route 逐条跑一遍。
- 小程序测试是 Node source-level/纯函数/页面契约测试，不等于微信开发者工具真机点击测试。
- 未能在端口 21746 上进行截图、页面跳转、输入框、弹窗、剪贴板和真实微信 API 的自动化操作。

## 4. 已确认的交互问题与风险

### P0：生产配置仍未切换

当前 `miniprogram/config.js` 的 `activeEnvironment` 仍为 `development`，开发 API 为 `http://127.0.0.1:3000/api`；production 仍是 `https://replace-with-your-api.example.com/api`。

上线前必须：

- 写入真实 HTTPS API 地址。
- 设置微信后台 request 合法域名。
- 关闭生产环境开发登录。
- 重新编译并在开发者工具和真机确认登录、头像、图片、家庭接口。

相关文件：[miniprogram/config.js](/E:/Database_Design/miniprogram/config.js:3)、[server/src/config.js](/E:/Database_Design/server/src/config.js:23)。

### P0：后端生产开发登录保护已修复

`server/src/config.js` 现在在 `NODE_ENV=production` 且 `DEV_AUTH_ENABLED=true` 时直接启动失败；本地 development 配置仍可使用开发登录。

### P0：迁移入口已串联完整历史迁移

`server/src/scripts/migration-runner.js` 现在按 `04` 到 `10` 顺序执行，使用 `schema_migrations` 记录 checksum/status，并使用 MySQL advisory lock 防止并发迁移。对已使用新版 `recipe_tags(recipe_id, tag_id)` 的库，旧字段回填/删除迁移会记录为 skipped。首次和重复执行已在 `mealpilot_test` 验证。

### P1：上传请求 401 处理已统一

`uploadFile` 和 `uploadAvatar` 现在共用认证上传封装：401 时重新认证并只重试一次，恢复失败则清理会话并回到登录页。

### P1：菜单和菜谱页旧数据残留已修复

菜单页和菜谱页现在在每次重新请求前清空旧集合；对应回归测试覆盖了菜单卡片、总数和菜谱列表。

### P1：小程序过期契约已更新

当前小程序测试 147/147 通过；新增洞察范围按钮的内容宽度契约测试也已通过。

## 5. 数据库只读审计

审计脚本位于：[test/database-readonly-audit.js](/E:/Database_Design/test/database-readonly-audit.js)。它只执行 `SELECT`、`information_schema` 查询和本地上传目录读取，不做 INSERT、UPDATE、DELETE、DROP 或 TRUNCATE。

### 5.1 当前业务库计数

当前连接到 `mealpilot`，结果如下：

| 表 | 行数 | 结论 |
|---|---:|---|
| users | 3 | 活跃用户资料 |
| families | 1 | 当前家庭 |
| family_members | 3 | 家庭成员关系 |
| ingredients | 53 | 演示/基础食材 |
| ingredient_seasons | 0 | 表存在，但当前没有数据 |
| recipes | 48 | 菜谱目录 |
| recipe_ingredients | 103 | 菜谱食材关系 |
| tag_definitions | 12 | 10 个系统标签 + 当前自定义标签 |
| recipe_tags_legacy | 140 | 迁移保留的旧标签归档 |
| recipe_tags | 30 | 当前标签关系 |
| member_category_preferences | 4 | 成员类别偏好 |
| member_ingredient_restrictions | 4 | 成员忌口 |
| recommendation_runs | 65 | 历史推荐批次 |
| recommendation_items | 60 | 旧推荐项 |
| recommendation_candidates | 138 | canonical 候选 |
| recommendation_candidate_items | 606 | canonical 候选菜项 |
| menus | 17 | 历史菜单头 |
| menu_items | 45 | 历史菜单项 |
| menu_feedback | 0 | 当前没有评分数据 |

所有已存在业务表均为 InnoDB，默认表排序规则为 `utf8mb4_0900_ai_ci`。`families.invite_code` 的列结构已使用 ASCII case-sensitive 规则。

### 5.2 完整性检查

本轮只读查询结果全部为 0：

- family member 外键孤儿。
- recipe ingredient 外键孤儿。
- menu item 外键孤儿。
- feedback 外键孤儿。
- 菜谱作者与菜谱家庭不一致。
- 菜单创建成员与菜单家庭不一致。
- 菜单项菜谱跨家庭。
- 推荐项菜谱跨家庭。
- candidate item 菜谱跨家庭。
- feedback 成员与菜单家庭不一致。
- 一个用户同时属于多个 active 家庭。
- 空白家庭名称。

### 5.3 上传文件

服务器上传目录共有 33 个文件，其中 30 个被用户头像或菜谱 `cover_url` 引用，0 个引用文件缺失，发现 3 个未被数据库引用的文件：

- `/uploads/avatars/86c4a588-1494-43b4-b8e3-527fb9fc894c.jpg`
- `/uploads/recipes/0408d057-426f-431d-be4d-f589cac134d1.jpg`
- `/uploads/recipes/509891ce-21eb-4655-82f8-1d1bb98d6bad.jpg`

它们可能是上传后保存成功但后续资料/菜谱保存失败留下的孤儿文件，也可能是人工测试遗留。当前不删除，等审核确认。

## 6. 数据库垃圾与清理候选

以下项目不能直接等同于垃圾：

| 项目 | 当前判断 | 处理建议 |
|---|---|---|
| `recommendation_runs=65`、候选和候选菜项 | 很可能包含开发/手动测试产生的业务记录，但也可能是演示历史 | 按用户、家庭、创建时间确认后再归档或删除；不要直接清空 |
| `menus=17`、`menu_items=45` | 可能是演示菜单或真实测试数据 | 先导出清单和业务确认，再按家庭/日期处理 |
| `recipe_tags_legacy=140` | 这是标签迁移故意保留的历史归档，不是普通垃圾 | 保留至少一个回滚/核对周期；确认新标签数据完整后再制定归档策略 |
| `ingredient_seasons=0` | 空表且当前推荐代码没有有效业务数据依赖 | 若产品不做时令推荐，可列为未启用结构；不要在未确认前删除表 |
| `menu_feedback=0` | 空表，但 Feedback API 已实现 | 不是垃圾，保留 |
| 3 个孤儿上传文件 | 明确是数据库未引用文件，但来源不明 | 先在报告中人工确认，之后可以单独删除并记录 |
| `database/03_queries.sql` | 手工查询脚本，不是运行时依赖 | 可移到归档目录，不建议现在删除 |

本轮没有执行任何数据库删除、数据清洗或文件删除。

## 7. 迭代旧代码、冗余代码和文档不一致

### 7.1 不建议现在删除的历史迁移

`database/04` 到 `database/10` 是数据库演进记录。即使当前 `01_schema.sql` 已包含部分最终结构，也不能在没有生产库版本表、备份和迁移策略的情况下直接删除历史脚本。

### 7.2 文档同步结果

本轮已将当前事实同步到本报告：Backend Direct 196/196、小程序 147/147、Real MySQL Integration 46/46；当前实现包含迁移版本记录、上传 401 恢复、菜单/菜谱旧数据清理和洞察范围筛选。

早期 plan/spec 和 `DATABASE_AUDIT_REPORT_V1.md` 仍作为历史记录保留，并已在目录或文件入口注明当前实现应以当前版本说明为准；不建议删除这些追溯材料。

### 7.3 `noop` handler 判断

菜谱、菜谱表单、忌口页中的 `noop` 是用于 bottom sheet 的 `catchtap/catchtouchmove` 事件拦截，不是死按钮，也没有发现对应可见交互按钮没有逻辑。

## 8. 部署上线前必须完成

### 必做

1. 已按最新设计更新并通过小程序测试契约。
2. 将小程序切换为生产 API 配置，替换 HTTPS placeholder。
3. 已增加后端生产启动保护，强制禁止 `DEV_AUTH_ENABLED=true`。
4. 已增加旧数据库有序迁移和版本记录入口。
5. 已统一 `wx.request` 与 `wx.uploadFile` 的 401 处理。
6. 已修复菜单/菜谱页普通请求失败后的旧数据展示风险。
7. 在微信开发者工具中完成真实点击验收，并在真机完成登录、家庭、头像、封面上传、邀请、邀请码刷新、菜单、菜谱、推荐、评分、退出登录链路。
8. 已在 `mealpilot_test` 完成 Direct + Integration 验证；依赖审计为 0 vulnerabilities。

### 生产运维建议

- 后端使用专用数据库账号，业务库和测试库隔离。
- 配置 HTTPS、微信 request 合法域名、上传目录权限、备份和恢复演练。
- 为 JWT secret、微信 AppSecret、数据库密码建立部署密钥管理，不写入仓库。
- 增加 API 日志、错误监控、慢查询监控和上传空间监控。
- 为推荐运行、菜单、上传文件建立保留策略和人工/自动归档策略。
- 生产环境不要执行 `db:init`；新库初始化和旧库迁移必须分开。

## 9. 本轮新增审计文件

- [只读数据库审计脚本](/E:/Database_Design/test/database-readonly-audit.js)
- [本报告](/E:/Database_Design/docs/reports/2026-09-16-release-audit.md)

## 10. 删除前待你审核的清单

请先确认以下内容，再决定是否需要我执行清理：

- 3 个孤儿上传文件是否删除。
- 业务库中的 65 条推荐批次、138 个候选、606 个候选菜项、17 个菜单和 45 个菜单项中，哪些是测试数据、哪些要保留。
- `recipe_tags_legacy` 是否继续保留为迁移归档。
- 空的 `ingredient_seasons` 是否属于未来功能预留。
- `database/03_queries.sql`、过期 README/交接文档、历史 plan/spec 是否归档或仅更新。

截至本报告完成时，没有执行任何上述删除动作。
