# Database Audit Report v1

审计范围：`database/00_create_user.sql`、`database/01_schema.sql`、`database/02_seed.sql`、`database/03_queries.sql`，全部后端数据库访问代码、相关小程序 API/状态代码，以及 `server/test`、`miniprogram/test` 中与数据契约有关的测试。

审计时间：2026-09-06（Asia/Shanghai）。

边界：本轮只读。未修改 SQL、JS、WXML/WXSS、测试或数据库；未执行 Seed、初始化、迁移、DELETE/TRUNCATE/UPDATE。数据库验证只使用了 SELECT 和 information_schema 查询。

## 一、当前数据库总览

当前实库计数：`users=2`、`families=1`、`family_members=1`、`ingredients=53`、`recipes=48`、`recipe_ingredients=103`、`menus=8`、`menu_items=18`；`ingredient_seasons`、`member_category_preferences`、`member_ingredient_restrictions`、`recommendation_runs`、`recommendation_items`、`menu_feedback` 均为 0。当前只有 1 个家庭和 1 个 active 成员；另有 1 个尚未加入家庭的用户。

| 表 | 业务意义 | 主键 | 外键 | UNIQUE | CHECK | DEFAULT / 自动时间 | 后端读写 | Seed | 核心 / 状态 |
|---|---|---|---|---|---|---|---|---:|---|
| `users` | 微信/OpenID 用户 | `id` | 无 | `openid` | 无 | 昵称、头像、created/updated | 读写 | 1 行逻辑写入；实库 2 | 核心，活跃 |
| `families` | 家庭、邀请码、所有者 | `id` | `owner_user_id→users` | `invite_code` | 无 | created/updated | 读写 | 1 | 核心，活跃 |
| `family_members` | 用户加入家庭、角色、状态 | `id` | family、user | `(family_id,user_id)` | 无 | role/status/joined_at | 读写 | 1 | 核心，活跃 |
| `ingredients` | 全局食材与每 100g 营养值 | `id` | 无 | `name` | 营养值 ≥ 0 | 营养值 0；created_at | 读；Seed 写 | 53 | 核心支撑，活跃 |
| `ingredient_seasons` | 食材适宜月份 | `(ingredient_id,month)` | ingredient | 主键 | month 1–12 | 无 | 无 | 0 | 死表/未接入 |
| `recipes` | 家庭菜谱基本信息 | `id` | family、author member | 无 | cook/difficulty/servings 范围 | servings、cover/status、created/updated | 读写 | 48 | 核心，活跃 |
| `recipe_ingredients` | 菜谱—食材多对多及克数 | `(recipe_id,ingredient_id)` | recipe、ingredient | 主键 | amount_grams > 0 | note='' | 读写 | 103 | 核心，活跃 |
| `member_category_preferences` | 成员对四类菜的 1–5 偏好 | `(member_id,category)` | member | 主键 | score 1–5 | score=3 | 无 | 0 | 半接入/实际死表 |
| `member_ingredient_restrictions` | 成员忌口食材及原因 | `(member_id,ingredient_id)` | member、ingredient | 主键 | 无 | reason='忌口' | 仅推荐读取 | 0 | 半接入，当前无数据 |
| `recommendation_runs` | 一次推荐的条件、总分、耗时 | `id` | family、creator member | 无 | people 1–12、limit 10–480 | created_at | 写入；apply 读取 | 0 | 代码已接通，当前为空 |
| `recommendation_items` | 推荐批次中的菜谱、分数、理由 | `id` | run、recipe | `(run_id,recipe_id)` | 无 | 无 | 写入；apply 读取 | 0 | 代码已接通，当前为空 |
| `menus` | 某家庭某日某餐次的菜单头 | `id` | family、creator member、optional run | `(family,date,meal)` | 无 | status、created/updated | 读写 | 0；实库 8 | 核心，活跃 |
| `menu_items` | 菜单中的菜谱、来源、备注 | `id` | menu、recipe | `(menu_id,recipe_id)` | 无 | source='manual'、note=''、created_at | 读写 | 0；实库 18 | 核心，活跃 |
| `menu_feedback` | 成员对菜单项评分和评价 | `id` | menu item、member | `(menu_item_id,member_id)` | rating 1–5 | comment=''、created_at | 仅 insights 读取 | 0 | 半接入/无写 API |

补充：所有业务表为 InnoDB。除显式索引外，MySQL 为外键自动建立了辅助索引。`ON UPDATE` 均为 `NO ACTION`；删除策略见第十三部分。

## 二、逐表字段审计

以下以 Schema 为准，并标明当前真实代码是否使用。

### Table: users

| 字段 | 类型 | NULL | 默认值 | PK/FK | 业务意义 | 实际代码是否使用 |
|---|---|---|---|---|---|---|
| `id` | BIGINT UNSIGNED AUTO_INCREMENT | NO | — | PK | 用户 ID | 是，认证、关联 |
| `openid` | VARCHAR(64) | NO | — | UNIQUE | 微信身份标识 | 是，登录和 Token |
| `display_name` | VARCHAR(40) | NO | 微信用户 | — | 昵称 | 是 |
| `avatar_url` | VARCHAR(500) | NO | `''` | — | 头像 | 是，查询/家庭成员展示 |
| `created_at` | DATETIME | NO | CURRENT_TIMESTAMP | — | 创建时间 | Schema/DB 自动维护，业务未读取 |
| `updated_at` | DATETIME | NO | CURRENT_TIMESTAMP | — | 更新时间 | 登录更新时使用；未对外返回 |

### Table: families

| 字段 | 类型 | NULL | 默认值 | PK/FK | 业务意义 | 实际代码是否使用 |
|---|---|---|---|---|---|---|
| `id` | BIGINT UNSIGNED AUTO_INCREMENT | NO | — | PK | 家庭 ID | 是 |
| `name` | VARCHAR(40) | NO | — | — | 家庭名称 | 是 |
| `invite_code` | CHAR(6) | NO | — | UNIQUE | 加入邀请码 | 是 |
| `owner_user_id` | BIGINT UNSIGNED | NO | — | FK→users.id | 所有者账号 | 创建、返回；权限主要依赖 member.role |
| `created_at` | DATETIME | NO | CURRENT_TIMESTAMP | — | 创建时间 | 未直接读取 |
| `updated_at` | DATETIME | NO | CURRENT_TIMESTAMP ON UPDATE | — | 更新时间 | 未直接读取 |

### Table: family_members

| 字段 | 类型 | NULL | 默认值 | PK/FK | 业务意义 | 实际代码是否使用 |
|---|---|---|---|---|---|---|
| `id` | BIGINT UNSIGNED AUTO_INCREMENT | NO | — | PK | 家庭成员关系 ID | 是，membership/member_id |
| `family_id` | BIGINT UNSIGNED | NO | — | FK→families.id | 所属家庭 | 是 |
| `user_id` | BIGINT UNSIGNED | NO | — | FK→users.id | 登录用户 | 是 |
| `role` | ENUM(owner,member) | NO | member | — | 角色 | 是；只有 owner/member，没有 admin |
| `nickname` | VARCHAR(40) | NO | — | — | 家庭内昵称 | 是 |
| `status` | ENUM(active,left) | NO | active | — | 成员状态 | 是，认证只取 active |
| `joined_at` | DATETIME | NO | CURRENT_TIMESTAMP | — | 加入时间 | 未直接读取 |

### Table: ingredients

| 字段 | 类型 | NULL | 默认值 | PK/FK | 业务意义 | 实际代码是否使用 |
|---|---|---|---|---|---|---|
| `id` | BIGINT UNSIGNED AUTO_INCREMENT | NO | — | PK | 食材 ID | 是 |
| `name` | VARCHAR(60) | NO | — | UNIQUE | 食材名称 | 是 |
| `calories_per_100g` | DECIMAL(8,2) | NO | 0 | — | 每 100g 热量 | API 返回 `calories`；推荐未使用 |
| `protein_per_100g` | DECIMAL(8,2) | NO | 0 | — | 每 100g 蛋白质 | API 返回 `protein`；推荐未使用 |
| `fat_per_100g` | DECIMAL(8,2) | NO | 0 | — | 每 100g 脂肪 | API 返回 `fat`；推荐未使用 |
| `carbohydrate_per_100g` | DECIMAL(8,2) | NO | 0 | — | 每 100g 碳水 | API 返回 `carbohydrate`；推荐未使用 |
| `created_at` | DATETIME | NO | CURRENT_TIMESTAMP | — | 创建时间 | 未直接读取 |

### Table: ingredient_seasons

| 字段 | 类型 | NULL | 默认值 | PK/FK | 业务意义 | 实际代码是否使用 |
|---|---|---|---|---|---|---|
| `ingredient_id` | BIGINT UNSIGNED | NO | — | PK、FK→ingredients.id | 食材 | 无代码引用 |
| `month` | TINYINT UNSIGNED | NO | — | PK | 适宜月份 1–12 | 无代码引用 |

结论：Schema 中存在，但当前业务代码未使用；Seed 未写入。

### Table: recipes

| 字段 | 类型 | NULL | 默认值 | PK/FK | 业务意义 | 实际代码是否使用 |
|---|---|---|---|---|---|---|
| `id` | BIGINT UNSIGNED AUTO_INCREMENT | NO | — | PK | 菜谱 ID | 是 |
| `family_id` | BIGINT UNSIGNED | NO | — | FK→families.id | 菜谱所属家庭 | 是，所有列表/详情/推荐隔离 |
| `created_by_member_id` | BIGINT UNSIGNED | NO | — | FK→family_members.id | 创建者 | 是，编辑/删除权限 |
| `title` | VARCHAR(80) | NO | — | — | 菜名 | 是 |
| `category` | ENUM(荤菜,素菜,汤,主食) | NO | — | — | 菜品分类 | 是 |
| `description` | TEXT | NO | — | — | 简介 | 是 |
| `steps` | TEXT | NO | — | — | 步骤文本，以换行分隔 | 是 |
| `cook_minutes` | SMALLINT UNSIGNED | NO | — | — | 烹饪分钟数 | 是 |
| `difficulty` | TINYINT UNSIGNED | NO | — | — | 难度 1–5；UI 实际展示 1–3 | 是 |
| `servings` | TINYINT UNSIGNED | NO | 2 | — | 份量 1–12 | 是 |
| `cover_url` | VARCHAR(500) | NO | `''` | — | 封面路径 | 是，映射为 `coverUrl` |
| `status` | ENUM(active,deleted) | NO | active | — | 软删除状态 | 是，列表/详情/推荐过滤 active |
| `created_at` | DATETIME | NO | CURRENT_TIMESTAMP | — | 创建时间 | 未直接读取 |
| `updated_at` | DATETIME | NO | CURRENT_TIMESTAMP ON UPDATE | — | 更新时间 | 列表排序使用 |

### Table: recipe_ingredients

| 字段 | 类型 | NULL | 默认值 | PK/FK | 业务意义 | 实际代码是否使用 |
|---|---|---|---|---|---|---|
| `recipe_id` | BIGINT UNSIGNED | NO | — | PK、FK→recipes.id | 菜谱 | 是 |
| `ingredient_id` | BIGINT UNSIGNED | NO | — | PK、FK→ingredients.id | 食材 | 是 |
| `amount_grams` | DECIMAL(8,2) | NO | — | — | 用量，统一按克 | 是，API 映射 `amountGrams` |
| `note` | VARCHAR(80) | NO | `''` | — | 处理/用量备注 | 是 |

### Table: member_category_preferences

| 字段 | 类型 | NULL | 默认值 | PK/FK | 业务意义 | 实际代码是否使用 |
|---|---|---|---|---|---|---|
| `member_id` | BIGINT UNSIGNED | NO | — | PK、FK→family_members.id | 成员 | 无业务 API |
| `category` | ENUM(荤菜,素菜,汤,主食) | NO | — | PK | 类别 | 无业务 API |
| `preference_score` | TINYINT UNSIGNED | NO | 3 | — | 1–5 偏好分 | 推荐未查询；评分逻辑默认 70 |

结论：Schema 中存在，但当前业务代码未使用；Seed 未写入。

### Table: member_ingredient_restrictions

| 字段 | 类型 | NULL | 默认值 | PK/FK | 业务意义 | 实际代码是否使用 |
|---|---|---|---|---|---|---|
| `member_id` | BIGINT UNSIGNED | NO | — | PK、FK→family_members.id | 成员 | 推荐查询使用，UI 不维护 |
| `ingredient_id` | BIGINT UNSIGNED | NO | — | PK、FK→ingredients.id | 忌口食材 | 推荐查询使用 |
| `reason` | VARCHAR(100) | NO | 忌口 | — | 忌口原因 | 无 API 返回/写入 |

### Table: recommendation_runs

| 字段 | 类型 | NULL | 默认值 | PK/FK | 业务意义 | 实际代码是否使用 |
|---|---|---|---|---|---|---|
| `id` | BIGINT UNSIGNED AUTO_INCREMENT | NO | — | PK | 推荐批次 | 是 |
| `family_id` | BIGINT UNSIGNED | NO | — | FK→families.id | 家庭 | 是 |
| `created_by_member_id` | BIGINT UNSIGNED | NO | — | FK→family_members.id | 发起人 | 是 |
| `menu_date` | DATE | NO | — | — | 目标日期 | 是，API `menuDate` |
| `meal_type` | ENUM(breakfast,lunch,dinner) | NO | — | — | 目标餐次 | 是，API `mealType` |
| `people_count` | TINYINT UNSIGNED | NO | — | — | 用餐人数 | 是，API `peopleCount` |
| `max_cook_minutes` | SMALLINT UNSIGNED | NO | — | — | 最大耗时 | 是，API `maxCookMinutes` |
| `mode` | ENUM(balanced,healthy,quick) | NO | — | — | 推荐模式 | 是 |
| `total_score` | DECIMAL(6,2) | NO | — | — | 总分 | 是 |
| `total_cook_minutes` | SMALLINT UNSIGNED | NO | — | — | 总耗时 | 是 |
| `score_breakdown` | JSON | NO | — | — | 分项分数 | 是 |
| `created_at` | DATETIME | NO | CURRENT_TIMESTAMP | — | 批次时间 | 未直接查询历史 |

### Table: recommendation_items

| 字段 | 类型 | NULL | 默认值 | PK/FK | 业务意义 | 实际代码是否使用 |
|---|---|---|---|---|---|---|
| `id` | BIGINT UNSIGNED AUTO_INCREMENT | NO | — | PK | 推荐项 ID/排序 | 是，apply ORDER BY |
| `recommendation_run_id` | BIGINT UNSIGNED | NO | — | FK→recommendation_runs.id | 批次 | 是 |
| `recipe_id` | BIGINT UNSIGNED | NO | — | FK→recipes.id | 推荐菜谱 | 是 |
| `dish_score` | DECIMAL(6,2) | NO | — | — | 单菜得分 | 是 |
| `reason_text` | VARCHAR(500) | NO | — | — | 推荐理由 | 是，持久化但无历史读取 API |

### Table: menus

| 字段 | 类型 | NULL | 默认值 | PK/FK | 业务意义 | 实际代码是否使用 |
|---|---|---|---|---|---|---|
| `id` | BIGINT UNSIGNED AUTO_INCREMENT | NO | — | PK | 菜单 ID | 是 |
| `family_id` | BIGINT UNSIGNED | NO | — | FK→families.id | 家庭 | 是 |
| `created_by_member_id` | BIGINT UNSIGNED | NO | — | FK→family_members.id | 创建者 | 是 |
| `recommendation_run_id` | BIGINT UNSIGNED | YES | NULL | FK→recommendation_runs.id | 来源推荐批次 | apply 使用；手动为空 |
| `menu_date` | DATE | NO | — | — | 菜单日期 | 是 |
| `meal_type` | ENUM(breakfast,lunch,dinner) | NO | — | — | 早餐/午餐/晚餐 | 是 |
| `status` | ENUM(active,completed) | NO | active | — | 菜单状态 | 读取；无更新 API |
| `created_at` | DATETIME | NO | CURRENT_TIMESTAMP | — | 创建时间 | 未直接读取 |
| `updated_at` | DATETIME | NO | CURRENT_TIMESTAMP ON UPDATE | — | 更新时间 | 未直接读取 |

### Table: menu_items

| 字段 | 类型 | NULL | 默认值 | PK/FK | 业务意义 | 实际代码是否使用 |
|---|---|---|---|---|---|---|
| `id` | BIGINT UNSIGNED AUTO_INCREMENT | NO | — | PK | 菜单项 ID | 是 |
| `menu_id` | BIGINT UNSIGNED | NO | — | FK→menus.id | 菜单 | 是 |
| `recipe_id` | BIGINT UNSIGNED | NO | — | FK→recipes.id | 菜谱 | 是 |
| `source` | ENUM(manual,recommendation) | NO | manual | — | 添加来源 | 读取；普通 API 默认 manual；apply 写 recommendation |
| `note` | VARCHAR(200) | NO | `''` | — | 菜单项备注 | 读取/写入；重复添加不覆盖 |
| `created_at` | DATETIME | NO | CURRENT_TIMESTAMP | — | 添加时间 | 未直接返回 |

### Table: menu_feedback

| 字段 | 类型 | NULL | 默认值 | PK/FK | 业务意义 | 实际代码是否使用 |
|---|---|---|---|---|---|---|
| `id` | BIGINT UNSIGNED AUTO_INCREMENT | NO | — | PK | 评价 ID | 仅 Schema |
| `menu_item_id` | BIGINT UNSIGNED | NO | — | FK→menu_items.id | 被评价菜 | insights join 使用 |
| `member_id` | BIGINT UNSIGNED | NO | — | FK→family_members.id | 评价成员 | insights 只间接使用 rating |
| `rating` | TINYINT UNSIGNED | NO | — | — | 1–5 评分 | insights AVG 使用 |
| `comment` | VARCHAR(200) | NO | `''` | — | 文字评价 | 无代码 |
| `created_at` | DATETIME | NO | CURRENT_TIMESTAMP | — | 评价时间 | 无代码 |

## 三、当前真实 ER 关系

### 1. 数据库真实 FK

```text
users
  ├──< families.owner_user_id
  └──< family_members.user_id

families
  ├──< family_members.family_id
  ├──< recipes.family_id
  ├──< recommendation_runs.family_id
  └──< menus.family_id

family_members
  ├──< recipes.created_by_member_id
  ├──< member_category_preferences.member_id
  ├──< member_ingredient_restrictions.member_id
  ├──< recommendation_runs.created_by_member_id
  ├──< menus.created_by_member_id
  └──< menu_feedback.member_id

ingredients
  ├──< ingredient_seasons.ingredient_id
  ├──< recipe_ingredients.ingredient_id
  └──< member_ingredient_restrictions.ingredient_id

recipes
  ├──< recipe_ingredients.recipe_id
  ├──< recommendation_items.recipe_id
  └──< menu_items.recipe_id

recommendation_runs
  ├──< recommendation_items.recommendation_run_id
  └──< menus.recommendation_run_id

menus
  └──< menu_items.menu_id

menu_items
  └──< menu_feedback.menu_item_id
```

删除规则：family→members/recipes/runs/menus 为 CASCADE；recipe→recipe_ingredients 为 CASCADE；menu→menu_items 为 CASCADE；run→recommendation_items 为 CASCADE；recipe→menu_items/recommendation_items 为 RESTRICT；ingredient→recipe_ingredients 为 RESTRICT、→restrictions/seasons 为 CASCADE；menu→recommendation_run 为 SET NULL。

### 2. 仅代码层逻辑关联，数据库未强制

- `recipes.family_id` 与 `recipes.created_by_member_id` 没有复合 FK，数据库允许菜谱属于家庭 A、作者 member 属于家庭 B。
- `menus.family_id` 与 `menus.created_by_member_id` 没有复合 FK，数据库允许创建者来自另一个家庭。
- `menu_items.recipe_id` 只校验 recipe 存在，不校验 recipe.family_id = menu.family_id。当前 `POST /menus/items` 也没有先验证菜谱归属。
- `recommendation_items.recipe_id` 只校验 recipe 存在，不校验 recipe 与 recommendation_runs 属于同一家庭。
- `menus.recommendation_run_id` 只校验批次存在，不校验批次家庭与菜单家庭一致。
- `menu_feedback.member_id` 只校验 member 存在，不校验评价者与被评价菜单属于同一家庭。
- `family.owner_user_id` 与 family_members 中的 owner 角色没有数据库一致性约束。

### 3. 理论上有关联，但当前完全未实现

- `ingredient_seasons` 未参与时令计算。
- `member_category_preferences` 未参与评分，也无维护 API。
- `menu_feedback` 无新增/修改/删除评价 API。
- “家庭成员但本人不登录”没有结构支持：`family_members.user_id` 必须 NOT NULL 且必须引用 users。
- 推荐界面中的口味/饮食限制是本机页面状态，不对应成员/食材记录。

## 四、Seed 数据审计

`02_seed.sql` 的静态记录数与安全 SELECT 结果一致。脚本本身含有 `DELETE FROM recipe_ingredients WHERE recipe_id BETWEEN 1 AND 48`，本轮未执行该脚本。

| 表 | Seed 条数 | 数据类型 | 是否覆盖核心业务 | 备注 |
|---|---:|---|---|---|
| `users` | 1 | 演示账号 | 是 | 幂等按 openid 更新；实库另有 1 个 `demo-user` |
| `families` | 1 | 演示家庭 | 是 | 幂等按 invite_code 更新名称 |
| `family_members` | 1 | owner 成员 | 是 | 只有登录用户成员 |
| `ingredients` | 53 | 全局食材/营养值 | 是 | 名称唯一，全部被关系引用 |
| `recipes` | 48 | 14 荤、13 素、10 汤、11 主食 | 是 | id 1–48，全部 active |
| `recipe_ingredients` | 103 | 菜谱用料关系 | 是 | 48 道菜各 2–3 条 |
| `ingredient_seasons` | 0 | — | 否 | 时令表为空 |
| `member_category_preferences` | 0 | — | 否 | 偏好表为空 |
| `member_ingredient_restrictions` | 0 | — | 否 | 忌口表为空 |
| `recommendation_runs` | 0 | — | 否 | 当前实库也为 0 |
| `recommendation_items` | 0 | — | 否 | 当前实库也为 0 |
| `menus` | 0 | — | 否 | 当前实库 8 条，来自应用操作 |
| `menu_items` | 0 | — | 否 | 当前实库 18 条，来自应用操作 |
| `menu_feedback` | 0 | — | 否 | 无评价 API |

## 五、重点：Recipe → Ingredient

1. Seed 菜谱 48 条，实库 active 菜谱 48 条。
2. Seed 食材 53 条，实库 53 条。
3. Seed 关系 103 条，实库 103 条。
4. 无食材 Recipe：实库 0 条；每道菜至少 2 条，最多 3 条。
5. 未被使用 Ingredient：实库 0 条；53 个食材全部被引用。
6. 重复关系：结构上不允许，`PRIMARY KEY(recipe_id, ingredient_id)`；实库重复对 0 条。
7. 用量只存 `amount_grams DECIMAL(8,2)`，API 映射为 `amountGrams`。没有 unit、amount、amountGrams 数据库列，无法表达勺、个、适量等非克单位。
8. 详情 API 会查询并返回 `ingredientId/name/amountGrams/note`。
9. 创建 Recipe 会插入主表，然后逐条插入 `recipe_ingredients`。
10. 编辑 Recipe 若传 ingredients，会先 DELETE 旧关系再逐条插入新关系；这不是事务，任一后续插入失败都会留下空关系或部分关系。
11. 删除 Recipe API 是软删除：只更新 `recipes.status='deleted'`，不会删除 recipe_ingredients，也不会删除 menu_items。因此当前 API 删除后历史菜单关系仍保留。

### 发现

- 【当前无孤立 Recipe】Seed 和实库都完整。
- 【当前无孤立 Ingredient】53 个食材都有 Recipe 使用。
- 【当前无重复关系】由复合主键保护。
- 【P0 风险】Recipe 创建/编辑的主表和关系表没有同一事务。创建主表成功、关系写入失败时会出现违反应用语义的无食材菜谱；编辑可能丢失原关系。
- 【P1 风险】直接 SQL 或未来接口可以把另一个家庭的 ingredient ID 写进 Recipe，虽然 ingredient 是全局表，当前业务可能接受全局食材；若未来食材也家庭化则需要明确归属。

## 六、重点：Menu 关系

1. `menus` 的粒度是“某家庭某一天某餐次”，由 `(family_id, menu_date, meal_type)` 唯一约束确定；不是“某家庭某一天”一条，也不是每个菜一条。
2. `mealType` 存在 `menus.meal_type`，`menu_items` 没有自己的餐次列。
3. `menu_items.menu_id → menus.id`，`menu_items.recipe_id → recipes.id`。
4. 同一天同餐次的重复 menu 由 `uq_menu_slot` 阻止。
5. 同一餐次重复同一 Recipe 由 `uq_menu_recipe(menu_id,recipe_id)` 阻止。
6. 后端 `addMenuItem` 依赖菜单唯一键的 `ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)` 获取已有菜单 ID。
7. 重复加入同一道菜时，服务先 SELECT；若存在则返回 `already-present`，不插入第二条，也不覆盖原 note。`applyRecommendationRun` 同样跳过已有项并保留原数据。
8. 普通 `POST /menus/items` 未传 source，数据库默认 `manual`；推荐 apply 才写 `recommendation`。当前实库 18 个 menu_items 的 source 均为 `manual`，其中若干 note 文本为“来自今日推荐”，说明历史演示数据不是推荐批次来源。
9. 删除 menu item 只删除关系；其 `menu_feedback` 会因 FK CASCADE 一并删除。不会删除 Recipe。
10. 当前没有删除整张 Menu、清空餐次、标记完成、修改 note 的 API。
11. Recipe API 删除是软删除，不影响历史 menu_items；若执行物理 DELETE，`menu_items.recipe_id` 的 RESTRICT 会阻止删除已进菜单的 Recipe，保护关系。

### Menu 风险

- 【P0】`POST /menus/items` 只按当前家庭创建 menu，但没有校验 `recipeId` 属于当前家庭；数据库的单列 FK 只保证 Recipe 存在，允许跨家庭菜单项。
- 【P1】服务采用“先 SELECT、后 INSERT”，并发重复请求可能在 SELECT 均为空后由 UNIQUE 抛出冲突；当前测试只覆盖串行 mocked flow。
- 【P1】`GET /menus` 不限制 `r.family_id` 或 `r.status`；一旦存在跨家庭 menu item，可能返回其他家庭菜谱，且软删除菜谱仍可在历史菜单中显示。
- 【P1】`insights` 的 popular 查询把 `m.family_id=?` 放在 LEFT JOIN 条件中，但 `COUNT(mi.id)` 没有按 m 是否匹配计数；在多家庭且存在跨家庭 menu item 时，热度可能串家庭。

## 七、Family / Member 模型

1. User 与 FamilyMember 不是同一概念：User 是登录账号，FamilyMember 是该账号加入某家庭的成员关系。
2. Schema 允许一个 User 属于多个 Family，因为唯一键是 `(family_id,user_id)`；但当前 `currentMembership` 只取一个 active membership，加入 API 又在存在任一 active membership 时拒绝加入，因此应用行为只支持一个家庭。
3. 当前不允许没有 User 账号的 Member：`family_members.user_id NOT NULL` 且有 FK。
4. 角色只有 `owner`、`member`，没有 `admin`。权限字段是 `family_members.role`；菜谱编辑/删除由 owner 或本人 author 控制。
5. 创建家庭：事务内插入 families，再插入 owner family_member。加入家庭：查询邀请码后单独插入 member，未显式开启事务。
6. 删除 User：若其为 `families.owner_user_id`，owner FK 的 NO ACTION/RESTRICT 会阻止删除；若不是 owner，删除会 CASCADE family_members 及其偏好、忌口、评价，但若该 member 是 Recipe/Menu/Recommendation 的 creator，又会被这些 RESTRICT FK 阻止。
7. 删除 Family：CASCADE 删除 family_members、recipes、recommendation_runs、menus；进一步 CASCADE 删除 recipe_ingredients、recommendation_items、menu_items、feedback。属于高破坏性的家庭级历史删除。
8. 删除 Member 没有 API；物理删除会级联偏好/忌口/反馈，但可能被其创建过的 recipes/menus/recommendation_runs 的 RESTRICT 阻止。当前设计显然倾向将 member 标记为 `left` 而非物理删除。
9. 当前 owner_user_id 不保证一定存在对应的 owner member；代码创建流程保证，数据库本身不保证。

## 八、Preference / Restriction

| 问题 | 当前结论 |
|---|---|
| Preference 存在哪 | `member_category_preferences`，类别 ENUM + 1–5 分 |
| Restriction 存在哪 | `member_ingredient_restrictions`，member_id + ingredient_id + reason |
| 是否关联 Ingredient | Restriction 是；Preference 否 |
| 是否关联 Member | 两者都是 |
| 设置页是否写库 | 否。设置页只展示家庭/成员；推荐页的 taste/restriction 选项是本机页面草稿 |
| 推荐是否读 Preference | 否。推荐 SQL 没有查询 `member_category_preferences`，评分默认 `preferenceScore=70` |
| 推荐是否读 Restriction | 是。查询当前家庭 active members 的 restriction ingredient_id，并用 RecipeIngredient IDs 排除 |
| 时令是否真实 | 否。推荐把每道菜的 `seasonalMonths` 直接设为当前 month，未读 `ingredient_seasons` |
| 营养是否真实 | 否。推荐使用固定 `protein=10`，蔬菜按类别给简化值，未按克数和 ingredients 汇总 |

因此，数据库在“已经存在 restriction 行”的前提下可以回答“成员不能吃哪个 Ingredient”，也可以通过 recipe_ingredients 推导“哪些 Recipe 含该 Ingredient”；但当前没有维护 API，Seed 为空，UI 选择也不提交 ingredient/member ID。对当前可运行产品而言，这条链路是“数据库结构存在、读取断点已接、写入断点未接”。

## 九、完整性约束审计

### 已存在且合理

- 所有实体都有主键；所有关系表使用复合主键或唯一键阻止重复关系。
- OpenID、邀请码、Ingredient name 唯一。
- Recipe 用量、时间、难度、份量、偏好分、评分、人数、最大耗时有 CHECK。
- 关键父子关系有 FK；RecipeIngredient → Recipe CASCADE、Menu → MenuItem CASCADE、RecommendationRun → RecommendationItem CASCADE 符合关系表语义。
- Recipe → MenuItem / RecommendationItem RESTRICT，配合 Recipe 软删除可保留历史引用。
- 查询热点：recipes 的家庭/类别/状态索引、menus 的唯一槽位前缀、recipe_ingredients 双向索引、menu_items/menu_feedback 的唯一索引均存在。

### 问题分级

| 风险 | 分级 | 结论 |
|---|---|---|
| 跨家庭的 Recipe→Menu、Recipe→Recommendation、creator→family 关系只有代码假设 | P0 | 单列 FK 不能表达同一家庭约束；当前 API 的 menu item 写入已暴露入口 |
| Recipe 主表与 RecipeIngredient 子表创建/编辑不在事务中 | P0 | 可能出现无食材或部分食材菜谱 |
| Recommendation apply 不重新校验 Recipe active/家庭归属 | P0 | stale 或跨家庭 recommendation item 可能进入菜单；数据库只校验 ID 存在 |
| owner_user_id 与 family_members.owner 不强一致 | P1 | 数据库可出现“家庭所有者没有 active owner member” |
| User 可多家庭但 API 只支持一个，currentMembership LIMIT 1 | P1 | Schema 能表达的业务比 API 更宽，后续易出现权限歧义 |
| 成员物理删除受多处 RESTRICT 阻止，只有 status=left 可用 | P1 | 没有明确的成员生命周期 API |
| 家庭删除 CASCADE 菜谱、菜单、推荐历史 | P1 | 误删家庭会删除大量业务历史，且无恢复机制 |
| Ingredient 删除对 restriction 为 CASCADE | P1 | 未使用食材被删除时，忌口会静默消失 |
| `menu_feedback.member_id` 未校验同家庭 | P1 | 将来接入评价 API 时存在跨家庭写入风险 |
| Recommendation score / JSON 内容没有额外 CHECK | P1 | 应用异常或直接 SQL 可写入语义无效分值/结构 |
| Recommendation 忽略 Preference，seasonal score 全部伪当季 | P1 | 推荐结果与数据库设计目标不一致 |
| Keyword 使用 `%keyword%`，且 recipes 没有针对 `(family_id,status,updated_at)` 的查询优化索引 | P2 | 数据量扩大后列表/搜索性能可能下降 |
| README 仍描述 recipe_ingredients 未填充、推荐未写 runs、重复 menu 会更新 note | P2 | 文档与当前 Seed/代码状态不一致 |
| `/menus` 返回的 `menuDate` 未像 `/menus/dates` 一样统一归一化 | P2 | MySQL Date 序列化和小程序本地日期处理存在时区可读性风险 |

## 十、Schema / 后端 / 前端一致性

### 已确认的映射

- `cook_minutes → cookMinutes`、`cover_url → coverUrl`、`created_by_member_id → createdByMemberId` 在 Recipe 查询中显式别名。
- `ingredient_id → ingredientId`、`amount_grams → amountGrams` 在详情查询中显式别名。
- `menu_date → menuDate`、`meal_type → mealType`、`recipe_id → recipeId`、`menu_items.note → note` 在菜单查询中显式别名。
- 用户和 membership 的 `display_name`、`avatar_url`、`member_id`、`family_id`、`family_name`、`invite_code` 保持 snake_case，前端实际按这些名字读取，没有发现代码/Schema 不一致。
- 前端 Recipe 表单提交 camelCase，后端手工映射到 snake_case；没有发现 `amountGrams`/`amount_grams` 或 `coverUrl`/`cover_url` 的 P0 映射错误。

### 发现的行为不一致

- Recipe PUT 没有像 POST 一样在应用层检查 category 白名单，非法值最终由 ENUM 拒绝，错误更可能表现为 500 而不是 400。
- 后端没有统一校验日期、餐次、推荐 mode 等 body 值；部分值由 ENUM/CHECK 拒绝，部分值由 JS 默认/降级处理。
- 前端限制 UI 的 label（素食、低脂、儿童餐等）没有对应 Ingredient ID 或数据库枚举，且提交推荐时只发送人数、时长、mode、日期、餐次。
- README 第 343 行描述重复加入会更新备注，但真实 `addMenuItem` 保留旧备注；README 第 386、390 行也落后于当前 recommendation run/apply 实现。

## 十一、死表和假业务关系分类

| 分类 | 表/关系 | 证据与说明 |
|---|---|---|
| A 活跃核心表 | users, families, family_members, recipes, recipe_ingredients, menus, menu_items | 前后端真实读写；实库有业务数据 |
| B 只读/支撑表 | ingredients | 后端 GET 和 Recipe 关联读取；写入主要来自 Seed |
| C Seed/演示数据 | users demo、families demo、48 recipes、53 ingredients、103 relations | 由 `02_seed.sql` 提供；菜单由应用操作产生 |
| D 半接入表 | member_ingredient_restrictions | 推荐读取已接通，但没有维护 API、Seed 和当前数据 |
| D 半接入表 | recommendation_runs、recommendation_items | 当前代码已生成/应用，但没有历史查询 API；当前实库为 0 |
| D 半接入表 | menu_feedback | insights 读取 rating，但没有任何评价写 API；当前为 0 |
| E 死表 | ingredient_seasons | 仅 Schema，推荐未读取，Seed 为空 |
| E 死表 | member_category_preferences | 仅 Schema，推荐未读取，Seed 为空 |
| F 逻辑存在但数据库未对应 | 口味标签、素食/低脂/儿童餐等推荐页限制草稿、登录无账号成员 | 当前仅前端状态或产品概念 |

## 十二、业务问题可回答性测试

| 问题 | 结论 | 数据库层原因 |
|---|---|---|
| Q1 番茄炒蛋包含哪些食材？ | 【当前可以】 | Recipe → RecipeIngredient → Ingredient FK 和详情 API 完整；实库有 2 条关系 |
| Q2 哪些菜包含花生？ | 【当前可以】 | 可按 `recipe_ingredients.ingredient_id` 反查；花生米为 seed ingredient，Recipe 19 有关系；暂无专门 API |
| Q3 2026-09-06 午餐有哪些菜？ | 【当前可以】 | menus 有 date/meal_type，menu_items 有 recipe FK；按槽位查询即可。当前实库该日期的实际数据应以 SELECT 为准 |
| Q4 这道菜是否已加入 2026-09-06 午餐？ | 【当前可以】 | menu slot + menu_items 唯一关系可判断；前端通过 GET menus 也能判断 |
| Q5 最近 7 天吃过哪些 Recipe？ | 【部分可以】 | 能查最近 7 天计划/菜单中的 Recipe，但没有“实际吃过”事件；completed 状态无写 API，feedback 也为空 |
| Q6 某家庭有哪些成员？ | 【当前可以】 | family_members 与 users 有 FK；当前 API 返回 active members。只能返回有登录账号的成员 |
| Q7 某成员有什么饮食限制？ | 【部分可以】 | Schema 可查 member→restriction→ingredient，但当前表为空且无维护 API |
| Q8 某成员不能吃的 Ingredient 对应哪些 Recipe？ | 【部分可以】 | 关系模型可完成 restriction→ingredient→recipe_ingredients→recipe；推荐读取只按全家庭 active restrictions 排除，当前没有数据/查询 API |
| Q9 删除 Recipe 后，历史 Menu 是否仍然完整？ | 【当前可以（按现有 API）】 | Recipe DELETE 是软删除；menu_items 保留。物理删除被 menu_items RESTRICT 阻止；但历史标题等不是快照，后续编辑会改变显示内容 |
| Q10 同一道 Recipe 能否重复加入同一餐次？ | 【当前可以判断且被禁止】 | `uq_menu_slot` + `uq_menu_recipe` 防止重复；服务返回 already-present 并保留旧 note |

## 十三、删除策略审计

| 删除对象 | 当前真实后果 | 数据库动作 | 业务风险 |
|---|---|---|---|
| `users.id = X` | 若是家庭 owner，删除被 families.owner FK 阻止；否则可能 CASCADE family_members、偏好、忌口、评价，但 creator RESTRICT 仍可能阻止 | owner NO ACTION；member user CASCADE；creator refs RESTRICT | P1：删除结果依赖其是否拥有/创建业务数据 |
| `families.id = X` | 删除 family_members、recipes、menus、recommendation_runs；连带关系表、menu_items、feedback、recommendation_items 删除 | 多处 CASCADE | P1：家庭级历史数据整体丢失，当前无 API 恢复 |
| `family_members.id = X` | 删除偏好、忌口、评价；若被 recipe/menu/recommendation run 引用则 RESTRICT | child preference/restriction/feedback CASCADE；creator RESTRICT | P1：物理删除不适合历史成员，当前应使用 status=left，但无 API |
| `recipes.id = X` | 当前 DELETE API 只设置 status=deleted；RecipeIngredient/menu_items/recommendation_items 保留 | 应用软删除；物理删除时 recipe_ingredients CASCADE、菜单/推荐引用 RESTRICT | P1：历史关系保留但无字段快照；硬删除由历史引用阻止 |
| `ingredients.id = X` | 被 RecipeIngredient 使用时删除被阻止；未使用时会 CASCADE 删除 seasons/restrictions | recipe_ingredients RESTRICT；seasons/restrictions CASCADE | P1：忌口可能静默消失；本轮实库所有 53 个均在使用 |
| `menus.id = X` | 无删除 Menu API；若物理删除，menu_items 和 feedback 删除 | menu_items/feedback 间接 CASCADE | P1：删除整日/餐次会损失历史；当前前端只删单个 menu_item |

特别结论：当前 Recipe 删除不会让历史 Menu 的关系消失；但 Family 级联删除会让 Recipe、Menu 和相关历史整体消失。`menus` 只保存 recipe_id，不保存标题/分类快照，因此“关系完整”不等于“历史内容不可变”。

## 十四、索引审计

### 当前全部索引（按表归纳）

- `users`: PRIMARY(id)、uq_user_openid(openid)
- `families`: PRIMARY(id)、uq_family_invite_code(invite_code)、外键辅助索引(owner_user_id)
- `family_members`: PRIMARY(id)、uq_family_member(family_id,user_id)、idx_member_user_status(user_id,status)
- `ingredients`: PRIMARY(id)、uq_ingredient_name(name)
- `ingredient_seasons`: PRIMARY(ingredient_id,month)
- `recipes`: PRIMARY(id)、idx_recipe_family_category(family_id,category,status)、外键辅助索引(created_by_member_id)
- `recipe_ingredients`: PRIMARY(recipe_id,ingredient_id)、外键辅助索引(ingredient_id)
- `member_category_preferences`: PRIMARY(member_id,category)
- `member_ingredient_restrictions`: PRIMARY(member_id,ingredient_id)、外键辅助索引(ingredient_id)
- `recommendation_runs`: PRIMARY(id)、idx_recommendation_family_date(family_id,menu_date)、外键辅助索引(created_by_member_id)
- `recommendation_items`: PRIMARY(id)、uq_recommendation_recipe(recommendation_run_id,recipe_id)、外键辅助索引(recipe_id)
- `menus`: PRIMARY(id)、uq_menu_slot(family_id,menu_date,meal_type)、外键辅助索引(created_by_member_id/recommendation_run_id)
- `menu_items`: PRIMARY(id)、uq_menu_recipe(menu_id,recipe_id)、外键辅助索引(recipe_id)
- `menu_feedback`: PRIMARY(id)、uq_feedback_member_item(menu_item_id,member_id)

### 与真实查询对照

- 已存在且合理：RecipeIngredient 按 recipe 和按 ingredient 查询；MenuItem 按 menu/recipe 查询；菜单按 family+date 查询；限制按 member 主键前缀；推荐批次按 family+date 查询。
- 可能缺失：`recipes` 列表固定按 family、status，且按 updated_at 排序；现有 `(family_id,category,status)` 在无 category 时对 status/order 不理想。
- 可能缺失：标题 `%keyword%` 查询无法使用普通 B-tree 前缀索引；当前规模不大，属于 P2。
- 无明显冗余：复合唯一键同时承担查询前缀用途；外键自动索引与显式唯一键各有用途。
- 不建议本轮添加任何索引；需要先以真实数据量和 EXPLAIN 验证。

## 十五、测试覆盖审计

本轮运行结果：

- `server`: 15 tests passed。
- `miniprogram`: 56 tests passed。
- 合计 71 tests passed，0 failed。

已覆盖：健康检查、JWT、Schema 文本中的核心表/菜单唯一性、真实数据库的 48 Recipe/53 Ingredient/核心关系、封面映射、推荐纯函数、菜单日期 API 的 mock 行为、menu item 幂等分支、推荐 apply 的 mock 分支、前端日期/菜单 payload/Recipe 表单序列化、Recipe/菜单/推荐/家庭页面 API 契约和 UI 行为。

未覆盖的关键数据库行为：

- 未实际验证每个 FK、ON DELETE/ON UPDATE、CHECK、UNIQUE 的数据库行为。
- 未验证 Recipe 创建/编辑失败时的事务回滚、无食材/部分关系状态。
- 未验证真实数据库中的重复 MenuItem/重复 RecipeIngredient 冲突和并发行为。
- 未验证 Recipe 物理删除、Ingredient 删除、Member/User/Family 删除的完整级联/RESTRICT 后果。
- 未验证跨家庭 Recipe→Menu、Menu→Recipe、Recommendation→Recipe、Feedback→Member 隔离。
- 未验证 restriction→recipe 过滤的真实数据库链路；当前表为空。
- 未验证 Preference、Season、Feedback 的读写；当前无 API/数据。
- 未验证 recommendation_runs/items 的真实持久化及跨事务 rollback；当前实库为空。
- 未验证历史菜单在 Recipe 改名/软删除后的显示语义。

## 《数据库问题清单》

### P0

**ID: DB-001**  
模块：跨家庭关系 / `menu_items`  
问题：单列 FK 只校验 ID 存在，不校验 Recipe、Menu、Member、Family 的归属一致；`POST /menus/items` 可由当前家庭成员提交任意存在的 recipeId。  
影响：可写入跨家庭菜单项，造成数据隔离和业务语义错误。  
证据：`database/01_schema.sql` 中 `menu_items.recipe_id` 仅引用 `recipes(id)`；`server/src/services/menu-item-service.js` 直接插入 recipeId。  
建议方向：先确定家庭归属约束的目标，再统一加强 API 校验/Schema 约束。  
是否需要 Schema 变更：可能需要，取决于采用复合 FK 还是应用校验。  
是否需要 Seed 变更：否。  
是否需要 Backend 变更：是。

**ID: DB-002**  
模块：Recipe / `recipe_ingredients`  
问题：Recipe 主记录与子关系写入不在同一事务；编辑先删除旧关系，再逐条写新关系。  
影响：插入失败可能留下无食材菜谱、空关系或部分关系，直接破坏业务完整性。  
证据：`server/src/routes/recipes.js` 的 POST/PUT 使用 pool 直接执行，`saveIngredients` 逐条 INSERT。  
建议方向：把主表和关系同步纳入事务，并设计失败回滚测试。  
是否需要 Schema 变更：否。  
是否需要 Seed 变更：否。  
是否需要 Backend 变更：是。

**ID: DB-003**  
模块：Recommendation apply  
问题：apply 只校验推荐批次属于当前家庭，没有再次校验 recommendation item 的 Recipe 仍为 active 且属于同一家庭。  
影响：过期/被删除/跨家庭的推荐项可能进入菜单；数据库单列 FK 不能阻止。  
证据：`server/src/services/recommendation-run-service.js` 只按 runId/familyId 取批次和 recipe_id，随后直接 INSERT menu_items。  
建议方向：明确推荐快照语义后，在生成和 apply 两阶段都校验家庭与状态。  
是否需要 Schema 变更：可能需要。  
是否需要 Seed 变更：否。  
是否需要 Backend 变更：是。

### P1

**ID: DB-004**  
模块：家庭/成员一致性  
问题：`families.owner_user_id` 与 `family_members(role='owner')` 没有数据库一致性约束。  
影响：直接 SQL 或未来接口可产生没有 owner member 的家庭，导致权限/认证断裂。  
证据：Schema 只有 owner_user_id→users FK；owner member 由代码事务创建。  
建议方向：明确 owner 单一性和成员生命周期后再设计约束。  
是否需要 Schema 变更：可能需要。  
是否需要 Seed 变更：否。  
是否需要 Backend 变更：可能需要。

**ID: DB-005**  
模块：Preference / Restriction / Season  
问题：偏好无维护 API；前端限制/口味是本机草稿；推荐忽略 category preference 和 ingredient_seasons。  
影响：用户看到的偏好设置不进入数据库和推荐；时令理由不真实；restriction 当前永远为空。  
证据：`miniprogram/pages/recommend/index.wxml` 明示“保存为本机草稿，暂不影响本次推荐”；`menus.js` 只查询 restrictions；推荐把 seasonalMonths 设为当前 month。  
建议方向：先定义成员选择范围和 restriction 语义，再接 API、Seed 和推荐过滤。  
是否需要 Schema 变更：现有表基本够用，是否增加口味实体需另行决定。  
是否需要 Seed 变更：需要补最小可验证数据。  
是否需要 Backend 变更：是。

**ID: DB-006**  
模块：历史删除  
问题：Family CASCADE 会删除菜谱、菜单、推荐及关系；物理删除 Member/User 又受到复杂 RESTRICT/CASCADE 组合影响。  
影响：家庭历史可能整体丢失；删除账号行为不可预测且没有恢复 API。  
证据：`01_schema.sql` 的 family→recipes/menus/runs 为 CASCADE，creator 引用为 RESTRICT。  
建议方向：先决定“家庭删除是否允许、历史是否保留、成员是否只离开不删除”。  
是否需要 Schema 变更：可能需要。  
是否需要 Seed 变更：否。  
是否需要 Backend 变更：需要删除/离开策略 API 后再定。

**ID: DB-007**  
模块：菜单/洞察数据隔离  
问题：`GET /menus` 和 popular insights 查询没有完整地以 recipe/menu 家庭归属作过滤。  
影响：发生跨家庭脏关系后，可能显示或统计其他家庭的菜谱。  
证据：`menus.js` 菜单查询只按 `m.family_id`，insights 使用 LEFT JOIN 条件配合 `COUNT(mi.id)`。  
建议方向：统一所有关联查询的家庭边界，补多家庭隔离测试。  
是否需要 Schema 变更：不一定。  
是否需要 Seed 变更：否。  
是否需要 Backend 变更：是。

**ID: DB-008**  
模块：历史语义  
问题：MenuItem 只保存 recipe_id，不保存菜名/分类快照；Recipe 编辑会改变历史菜单显示内容。  
影响：关系仍存在，但历史记录不再是当时的内容快照。  
证据：`menu_items` 无 title/category 快照字段，菜单 GET 实时 JOIN recipes。  
建议方向：先明确历史菜单是动态引用还是不可变快照。  
是否需要 Schema 变更：若需要快照则需要。  
是否需要 Seed 变更：视方案而定。  
是否需要 Backend 变更：视方案而定。

**ID: DB-009**  
模块：并发一致性  
问题：普通 addMenuItem 先查重再插入，不是单语句幂等写入。  
影响：并发重复加入时可能暴露 UNIQUE 冲突。  
证据：`menu-item-service.js` 先 SELECT menu_items，再 INSERT。  
建议方向：基于唯一键设计真正的幂等写入，并补并发/冲突测试。  
是否需要 Schema 变更：否，已有 UNIQUE。  
是否需要 Seed 变更：否。  
是否需要 Backend 变更：是。

### P2

**ID: DB-010**  
模块：查询性能  
问题：Recipe 列表按 family/status 后按 updated_at 排序，现有索引不是最优覆盖；标题 contains 搜索无法用普通前缀索引。  
影响：大数据量时列表与搜索变慢。  
证据：`recipes.js` 使用 `WHERE family_id=? AND status='active' ... ORDER BY updated_at DESC` 及 `title LIKE '%...%'`。  
建议方向：使用真实 EXPLAIN 和数据量评估后再决定索引/搜索方案。  
是否需要 Schema 变更：可能需要。  
是否需要 Seed 变更：否。  
是否需要 Backend 变更：可能需要。

**ID: DB-011**  
模块：文档一致性  
问题：README 与当前实现不一致，仍写 recipe_ingredients 未填充、recommendation runs 未写入、重复加入会覆盖 note。  
影响：后续开发和验收依据错误。  
证据：README 7.7、7.8、8 节与当前 Seed/代码/实库计数冲突。  
建议方向：完成 Schema/Backend 决策后统一更新文档。  
是否需要 Schema 变更：否。  
是否需要 Seed 变更：否。  
是否需要 Backend 变更：否。

**ID: DB-012**  
模块：日期契约  
问题：`/menus/dates` 显式归一化 SQL Date，`/menus` 未做同样处理。  
影响：跨时区环境下前端可能收到 ISO datetime 而非 YYYY-MM-DD。  
证据：`menus.js` 的 normalizeSqlDate 只用于 dates endpoint。  
建议方向：统一 API 日期序列化契约并补时区测试。  
是否需要 Schema 变更：否。  
是否需要 Seed 变更：否。  
是否需要 Backend 变更：是。

## 《Phase 1 Recommended Next Steps》

1. 先冻结跨家庭边界与历史语义：确定 Recipe/Menu/Recommendation/Feedback 的家庭归属校验，以及 Recipe 删除后历史要保持“动态引用”还是“快照”。
2. 修复 Recipe 主表与 `recipe_ingredients` 的事务一致性，并补失败回滚、空关系和重复关系测试。
3. 修复 MenuItem 与 Recommendation apply 的家庭/active 状态校验，补多家庭隔离测试。
4. 明确 Family/User/Member 删除与离开策略，尤其是 owner、left member、历史 creator 的处理。
5. 决定 Preference、Restriction、Season 的真实产品语义；再接维护 API、最小 Seed 和推荐计算，避免先改表后返工。
6. 为 recommendation_runs/items、menu_feedback 补真实数据库持久化/回滚/查询测试；不要只依赖 mocked connection。
7. 统一日期、枚举、错误码和 snake_case/camelCase API 契约，并同步修正文档。
8. 最后根据真实数据规模运行 EXPLAIN，评估 Recipe 列表排序、菜单日期、推荐候选和搜索索引。

## 结尾总结

| 问题 | 结论 |
|---|---|
| 1. 当前数据库是否已属于“业务数据库” | 是。核心 User/Family/Member/Recipe/Ingredient/Menu 链路已真实运行，且实库已有 48 Recipe、103 用料关系、8 Menu、18 MenuItem；但偏好、时令、评价仍未形成完整闭环 |
| 2. 最大 3 个结构问题 | 跨家庭关系未由 DB/API 完整强制；Recipe 子表同步无事务；Family/Member owner 与生命周期约束不完整 |
| 3. 最大 3 个数据问题 | preference/restriction/season/feedback/recommendation 历史全为空；当前 menu_items 只有 manual source，推荐历史未形成；当前实库存在一个无家庭成员的登录用户 |
| 4. 最大 3 个完整性风险 | 跨家庭 menu/recommendation 关系；Recipe 无食材/部分关系；Family/User/Member 删除的 CASCADE/RESTRICT 组合可能造成数据丢失或无法删除 |
| 5. 最大 3 个代码/Schema 不一致 | 推荐页限制与数据库 restriction 不相连；推荐评分未使用偏好/时令/真实营养；菜单/推荐关联查询未统一校验家庭边界 |
| 6. 当前最值得先修的关系 | `family → recipe → recipe_ingredients → menu_items → menus` 的家庭边界和事务完整性 |
| 7. 是否需要新增表 | 当前阶段不应立即新增；先厘清已有半接入表和快照语义 |
| 8. 是否需要重构现有表 | 可能需要，但应在跨家庭约束、删除策略、历史快照决策后再定 |
| 9. 是否需要补 Seed | 需要补最小 Preference/Restriction/Season/Recommendation/Feedback 验证数据，但应在语义确认后实施 |
| 10. 是否适合进入 Phase 1B | 可以进入“方案确认/修复设计”型 Phase 1B；不建议直接进入大规模迁移或重构实现 |

**审计结论：本轮停止于报告，不实施任何修复。**
