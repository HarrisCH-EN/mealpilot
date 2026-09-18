# 当前数据库审计报告

审计日期：2026-09-16（Asia/Shanghai）  
审计对象：当前业务数据库 `mealpilot` 及其运行时 Schema。
测试数据库：`mealpilot_test`，仅供 Real MySQL Integration 使用。

本报告替代 `DATABASE_AUDIT_REPORT_V1.md` 作为当前数据库说明。V1 保留为 2026-09-06 的历史快照。

## 1. Schema 状态

当前 `database/01_schema.sql` 定义 19 张 InnoDB 表，统一使用 utf8mb4；`families.invite_code` 使用 ASCII `ascii_bin`，保证数字和大小写字母按区分大小写处理；`family_members.role` 支持 `owner`、`admin`、`member`。

新库初始化顺序：

1. `database/00_create_user.sql`
2. `database/01_schema.sql`
3. `database/02_seed.sql`（本地演示数据按需执行）

旧库升级顺序：`04_recommendation_refactor_r1.sql` → `05_recommendation_run_nullable_legacy.sql` → `06_recipe_tag_metadata_backfill.sql` → `07_remove_cuisine_tags.sql` → `08_tag_system_v1.sql` → `09_family-admin-role.sql` → `10_family-invite-code.sql`。后端 `npm run db:migrate` 目前负责家庭角色和邀请码列的幂等校正，不能替代 `04`～`08` 的历史迁移。

## 2. `mealpilot` 当前行数

以下数据来自只读脚本 [scripts/archive/database-readonly-audit.js](/E:/Database_Design/scripts/archive/database-readonly-audit.js)，本轮未执行删除、清空或更新。

| 表 | 行数 | 当前判断 |
| --- | ---: | --- |
| users | 3 | 用户及全局头像/用户名 |
| families | 1 | 当前家庭 |
| family_members | 3 | 家庭成员和角色 |
| ingredients | 53 | 基础食材 |
| ingredient_seasons | 0 | 预留的季节关系，当前无数据 |
| recipes | 48 | 菜谱目录 |
| recipe_ingredients | 103 | 菜谱食材关系 |
| tag_definitions | 12 | 10 个系统标签和自定义标签 |
| recipe_tags_legacy | 140 | 标签迁移保留的历史归档 |
| recipe_tags | 30 | 当前标签关系 |
| member_category_preferences | 4 | 成员分类偏好 |
| member_ingredient_restrictions | 4 | 成员忌口 |
| recommendation_runs | 65 | 推荐运行历史 |
| recommendation_items | 60 | 旧推荐兼容数据 |
| recommendation_candidates | 138 | canonical 推荐候选 |
| recommendation_candidate_items | 606 | 候选菜品关系 |
| menus | 17 | 菜单历史 |
| menu_items | 45 | 菜单项历史 |
| menu_feedback | 0 | 当前没有评分记录 |

## 3. 完整性检查

只读检查结果全部为 0：外键孤儿、菜谱/菜单/推荐/反馈跨家庭关系、创建者家庭不一致、一个用户多个 active 家庭关系、空白家庭名称。上传目录中已引用的头像和菜谱封面均可找到，另有 3 个未被数据库引用的文件，尚未删除，等待人工确认。

## 4. 业务约束

- 同一用户同一时刻最多一个 active 家庭关系。
- Owner/Admin 可管理家庭名称、邀请码和成员；普通成员可读取和复制邀请码。
- Owner 可把创建者身份原子移交给同家庭 active 成员；旧 Owner 变为普通成员后可以退出。
- 管理员刷新邀请码后，旧邀请码立即失效。
- 数据库约束负责主键、外键、唯一性、范围和级联；家庭边界与角色授权由服务端负责。

## 5. 待审核清理项

以下内容只做识别，未执行删除：3 个孤儿上传文件、推荐/菜单历史记录、`recipe_tags_legacy` 归档、空的 `ingredient_seasons` 和 `database/03_queries.sql`。清理前应先按家庭、用户和时间导出清单并确认用途。
