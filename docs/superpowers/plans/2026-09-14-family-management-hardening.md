# Family management hardening implementation plan

## Context

家庭管理需要同时修复权限、数据库兼容、角色转移、页面状态和邀请码链路。实现必须兼容已有数据库和已有家庭数据，且所有权限判断继续以后端当前家庭关系为准。

## Decisions

- 普通 active 成员可以读取并复制当前家庭邀请码；成员管理接口仍只允许 owner/admin。
- 创建者通过专用接口把创建者身份转移给同一家庭的 active 成员；目标成为 owner，原 owner 降为 member，并同步更新 `families.owner_user_id`，使转移具备原子性。
- 邀请码使用密码学随机的 6 位数字/大小写字母组合，数据库使用区分大小写的 ASCII 排序规则；加入家庭不再强制转大写。
- 数据库升级脚本做幂等预检，自动补齐 `admin` 角色枚举和邀请码大小写敏感定义；启动批处理先执行升级再启动 API。
- 家庭页每次加载在发起请求前清空上一轮家庭数据，失败时只能展示错误态，不能继续展示旧家庭或旧成员。

## Tasks

1. Add failing backend tests for member invite access, sanitized current-family response, ownership transfer transaction, exact-case invite joining, generated-code format, and idempotent schema upgrade behavior.
2. Add failing mini-program tests for member invite copy UI, ownership-transfer action, and stale-family-data clearing on load failure.
3. Implement backend invite-code generation/validation, collision retry, member-readable invite endpoint, exact-case join behavior, and ownership-transfer route.
4. Implement idempotent family-management schema upgrade, migration SQL, npm command, and launcher integration.
5. Update family-management and settings pages so every family member can copy an invite, owners can transfer ownership, invite input preserves case, and failed loads clear rendered data.
6. Run targeted backend and mini-program tests, syntax checks, database/schema checks, and live API smoke checks against the configured local service.

## Verification

- Targeted route tests cover 200/403/409/404 boundaries and transaction state changes.
- Schema tests verify the base schema and both feature migrations.
- Mini-program tests verify the rendered controls and reset-state code paths.
- `git diff --check`, Node syntax checks, and the existing relevant test suites must pass before completion.
