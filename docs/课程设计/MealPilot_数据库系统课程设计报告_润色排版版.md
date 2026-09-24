# 武汉科技大学计算机科学与技术学院

## 数据库系统课程设计报告

### 题目：基于微信小程序的家庭膳食管理与菜谱推荐系统设计与实现

| 项目 | 内容 |
|---|---|
| 学生姓名 | ____________________ |
| 学号 | ____________________ |
| 班级 | ____________________ |
| 指导教师 | ____________________ |
| 完成日期 | 2026 年 9 月 |

---

## 说明

本文按照《数据库系统课程设计》任务书要求整理，内容以目前已经部署运行的 MealPilot（饭有谱）版本为准。报告重点说明系统的需求分析、数据库设计、主要业务实现和数据处理方法。系统功能模块图、E-R 图、总体架构图以及运行截图暂以占位方式保留，后续统一补充到对应位置。

## 目录

1. 需求分析
2. 概念结构设计
3. 逻辑结构设计
4. 开发工具
5. 具体实现
6. 总结
7. 附录 A：主要 API
8. 附录 B：数据库验收要点

---

# 一、需求分析

## 1.1 项目背景与意义

家庭每天都要面对“吃什么”这个问题，但真正做决定时，并不只是从菜谱列表里随便挑一道菜。家庭成员可能有不同口味，有人需要忌口，有些菜最近刚吃过，做饭时间也有限。随着这些信息逐渐积累，单纯记录菜谱已经不能很好地解决家庭日常配餐的问题。

MealPilot（饭有谱）的设计出发点，就是把这些原本分散的信息放到同一个数据体系中管理。系统以家庭为核心，把用户、成员、菜谱、食材、标签、菜单、偏好、忌口、推荐和反馈等数据建立明确的关系。这样，数据库不只是负责保存信息，还能够为后续的菜单安排、推荐筛选和统计分析提供依据。

在实际实现中，系统既包含常见的增、删、改、查，也会根据家庭忌口、成员偏好、历史菜单、营养信息和菜谱标签进一步处理数据，再生成推荐结果和统计结果。这也是本项目与普通“菜谱展示”程序最主要的区别。

## 1.2 设计任务与目标

本次设计希望完成一个能够真正运行的家庭膳食管理系统，而不是只完成若干相互独立的数据库表和页面。围绕这一目标，主要完成以下工作：

1. 建立以家庭为数据边界的关系数据库，能够清楚表示用户、家庭成员、菜谱、食材、标签、菜单、推荐和反馈之间的联系。
2. 完成微信登录、首次资料完善和 JWT 会话管理，使用户身份与昵称、头像等资料相互独立。
3. 完成家庭创建、邀请码加入、成员管理、管理员转移、退出、解散和恢复等完整流程。
4. 完成菜谱、食材明细和标签管理，并通过事务保证多表写入时的数据一致性。
5. 记录家庭成员的忌口和菜品类别偏好，并让这些数据真正参与推荐。
6. 按日期和餐次维护家庭菜单，避免同一家庭同一天同一餐次出现重复菜单。
7. 设计一套可解释的规则推荐流程，根据菜单结构生成组合并进行多维评分，返回最多三套候选方案。
8. 记录成员对菜品的评分和文字反馈，并提供 7 天、30 天范围的家庭饮食统计。
9. 使用主键、外键、唯一约束、检查约束、事务以及应用层家庭边界校验共同保证数据完整性。
10. 将后端、MySQL 和对象存储部署到云端，使系统能够在微信小程序中完整运行。

## 1.3 用户角色与数据边界

系统中的家庭成员分为 `admin` 和 `member` 两种角色。一个处于正常状态的家庭只保留一个管理员，其他成员均为普通成员。管理员负责家庭名称、邀请码、成员移除和管理员转移等家庭级操作；普通成员主要使用菜谱、菜单、推荐、偏好和忌口等业务功能，并可以维护自己创建的菜谱。

数据库设计中最重要的边界是 Family。前端不会通过任意传入 `family_id` 来决定访问范围，而是由后端根据 JWT 中的用户身份查找当前有效的 `family_members` 记录，再确定真正的 `family_id`。之后菜谱、菜单、推荐、标签和统计等查询都在这个家庭范围内执行。这样做可以避免用户仅凭猜测其他记录 ID 就访问到别的家庭数据。

## 1.4 功能需求

系统最终实现的功能可以概括为以下八部分：

1. **身份与个人资料**：微信登录、会话恢复、首次头像昵称完善、退出登录和账号注销。
2. **家庭与成员管理**：创建家庭、邀请码加入、修改家庭名称、刷新邀请码、管理员转移、成员退出或移除，以及家庭解散和恢复。
3. **菜谱、食材与标签**：菜谱查询、搜索、分类、新增、编辑和软删除；维护菜谱食材用量；使用系统标签和家庭自定义标签。
4. **菜单管理**：按日期和早餐、午餐、晚餐维护菜单，支持手动添加或移除菜品，并在日历中显示已有菜单的日期。
5. **忌口与偏好**：记录每名家庭成员的忌口食材以及荤菜、素菜、汤、主食四类偏好。
6. **菜谱推荐**：根据人数、准备时间、菜单结构和标签偏好生成完整菜单组合，并结合家庭数据进行评分和筛选。
7. **反馈与统计**：成员可以对菜单项进行 1～5 星评价并填写反馈，系统可以汇总近期菜单数量、菜品数量、平均评分和热门菜谱。
8. **媒体文件管理**：头像和菜谱封面保存在 CloudBase 私有 Storage 中，数据库只保存稳定的 File ID，展示时再由后端换取临时访问地址。

> **图 1-1 系统功能模块图（后续补充）**

## 1.5 非功能需求

除了功能本身，系统在实现时还考虑了几项长期运行需要满足的要求。生产环境关闭开发登录，微信密钥、JWT 密钥、数据库密码和 CloudBase API Key 都只保存在服务端；涉及多个数据表的操作尽量放在同一事务中，避免只写入一半数据；后端按 Route、Service、Middleware 和 Recommendation 等模块拆分，便于后续维护。

推荐批次会保留当时的请求参数、候选分数和推荐理由，家庭解散也不会立即清空所有数据，而是先进入归档状态并保留恢复期。这些设计主要是为了让系统在出现异常时仍然有迹可循，而不是只追求“功能能跑通”。

---

# 二、概念结构设计

## 2.1 核心实体

从业务流程来看，MealPilot 的数据并不是围绕单一的“菜谱”展开，而是围绕“家庭中的人如何共同使用菜谱和菜单”展开。因此在概念设计阶段，将用户身份、家庭成员关系、菜谱内容、推荐过程和实际菜单分别建模。

| **实体**                         | **职责**                                                                |
|----------------------------------|-------------------------------------------------------------------------|
| User 用户                        | 保存微信 OpenID、昵称、头像等全局身份资料。                             |
| Family 家庭                      | 系统核心租户，维护家庭名称、邀请码、唯一管理员和生命周期。              |
| FamilyMember 家庭成员            | 连接 User 与 Family，并记录角色、家庭内昵称和成员状态。                 |
| Ingredient 食材                  | 全局基础数据，保存每100g营养值；可关联季节月份。                        |
| Recipe 菜谱                      | 属于某一家庭，由家庭成员创建，包含分类、步骤、难度、份数、封面等。      |
| TagDefinition 标签               | 分为全局系统标签和家庭自定义标签；通过 RecipeTag 与菜谱建立多对多关系。 |
| Preference / Restriction         | 记录成员类别偏好和食材忌口，是推荐的重要输入。                          |
| RecommendationRun 推荐批次       | 保存一次推荐请求及其上下文；一个批次可对应最多三套候选菜单。            |
| RecommendationCandidate 推荐候选 | 一套完整菜单组合；候选项记录每道菜的槽位、分数和理由。                  |
| Menu 菜单                        | 家庭在某一天某一餐次的实际菜单。                                        |
| MenuItem 菜单项                  | 连接菜单与菜谱，记录来源和备注。                                        |
| MenuFeedback 用餐反馈            | 家庭成员对某个菜单项的一次评分与评论。                                  |
| StorageCleanupJob 存储清理任务   | 协调数据库生命周期与 CloudBase Storage 文件删除。                       |

## 2.2 实体联系

主要实体之间的联系如下：

1. 一个 User 通过 `family_members` 与 Family 建立成员关系；当前业务规则限制一个用户同时最多存在一个 active Family。
2. 一个 Family 可以包含多个 FamilyMember，但只有一个 active admin；`families.admin_user_id` 记录当前管理员用户。
3. 一个 Family 可以拥有多条 Recipe、Menu、RecommendationRun，以及本家庭创建的自定义 TagDefinition。
4. Recipe 与 Ingredient 是多对多关系，由 `recipe_ingredients` 记录具体食材及用量；Ingredient 与月份的关系由 `ingredient_seasons` 表示。
5. Recipe 与 TagDefinition 是多对多关系，由 `recipe_tags` 建立关联；`recipe_tags_legacy` 仅用于保存旧版标签关系。
6. FamilyMember 可以有多条菜品类别偏好，并可以通过 `member_ingredient_restrictions` 关联多种忌口食材。
7. 一个 RecommendationRun 可以保存多套 RecommendationCandidate，每套候选再通过 `recommendation_candidate_items` 关联具体菜谱。
8. 一个 Family 在同一天、同一餐次最多对应一个 Menu；Menu 与 Recipe 通过 `menu_items` 建立关系。
9. 一个 MenuItem 可以收到多名成员的反馈，但同一成员对同一 MenuItem 只保留一条 Feedback。
10. 家庭进入最终清理阶段时，需要删除的 Storage File ID 会写入 `storage_cleanup_jobs`，使数据库清理和文件清理可以分开执行。

> **图 2-1 系统总体 E-R 图（后续补充）**

## 2.3 关键业务约束

概念设计中有一类约束只靠单个外键并不能完全表达，那就是“引用对象必须属于同一个家庭”。例如 `recipes.created_by_member_id` 的外键可以保证这个成员记录存在，却不能单独保证该成员一定属于 `recipes.family_id` 对应的家庭。因此，数据库负责保证“引用对象存在”，后端还要继续校验“引用对象属于当前家庭”。

另一个需要特别处理的问题是历史数据。菜谱被用户删除后，历史菜单和历史推荐中仍然可能引用它，因此系统对 Recipe 使用软删除，而不是直接物理删除。家庭解散也采用类似思路：先改为 `archived` 并保留 30 天恢复时间，超过恢复期后再执行真正的清理。这样既保留了历史语义，也给误操作留下了恢复空间。

---

# 三、逻辑结构设计

## 3.1 关系模式总体设计

本系统数据库采用 MySQL InnoDB，共设计 20 张业务表，建立 29 条外键关系。设计时尽量把不同含义的数据拆分到独立实体表中，再通过外键和关联表表达联系。例如菜谱与食材、菜谱与标签、菜单与菜谱都没有直接把多个值拼成字符串保存，而是采用规范的多对多关联结构。

推荐模块中使用了少量 JSON 字段，例如 `score_breakdown`、`menu_structure` 和 `session_preferences`。这些字段保存的是“一次推荐发生时的上下文快照”，后续需要原样回看，因此适合以整体形式保存；用户、家庭、菜谱等核心业务数据仍然使用关系结构，不依赖 JSON 代替表关系。

## 3.2 数据表结构

以下表结构与当前 `database/01_schema.sql` 保持一致。为了便于查看，每张表列出主要字段、类型以及关键约束。

### 3.2.1 users —— 微信身份用户与全局资料

| **字段**     | **类型**        | **键/约束**                | **说明**                         |
|--------------|-----------------|----------------------------|----------------------------------|
| id           | BIGINT UNSIGNED | PK, AUTO_INCREMENT         | 用户主键                         |
| openid       | VARCHAR(64)     | NOT NULL, UNIQUE           | 微信 OpenID，正式身份唯一标识    |
| display_name | VARCHAR(40)     | NOT NULL, DEFAULT 微信用户 | 展示昵称                         |
| avatar_url   | VARCHAR(500)    | NOT NULL, DEFAULT 空串     | 当前语义为稳定 CloudBase File ID |
| created_at   | DATETIME        | DEFAULT CURRENT_TIMESTAMP  | 创建时间                         |
| updated_at   | DATETIME        | 自动更新时间               | 更新时间                         |

### 3.2.2 families —— 家庭租户、管理员和生命周期

| **字段**      | **类型**                  | **键/约束**                             | **说明**           |
|---------------|---------------------------|-----------------------------------------|--------------------|
| id            | BIGINT UNSIGNED           | PK, AUTO_INCREMENT                      | 家庭主键           |
| name          | VARCHAR(40)               | NOT NULL                                | 家庭名称           |
| invite_code   | CHAR(6) ASCII             | NOT NULL, UNIQUE, ascii_bin             | 大小写敏感邀请码   |
| admin_user_id | BIGINT UNSIGNED           | FK → users.id, NULL, ON DELETE SET NULL | 当前唯一管理员用户 |
| status        | ENUM('active','archived') | DEFAULT active                          | 家庭生命周期状态   |
| disbanded_at  | DATETIME                  | NULL                                    | 解散时间           |
| purge_after   | DATETIME                  | NULL, INDEX                             | 归档数据可清理时间 |
| created_at    | DATETIME                  | DEFAULT CURRENT_TIMESTAMP               | 创建时间           |
| updated_at    | DATETIME                  | 自动更新时间                            | 更新时间           |

### 3.2.3 family_members —— 家庭成员关系与角色

| **字段**            | **类型**               | **键/约束**                   | **说明**                         |
|---------------------|------------------------|-------------------------------|----------------------------------|
| id                  | BIGINT UNSIGNED        | PK, AUTO_INCREMENT            | 成员关系主键                     |
| family_id           | BIGINT UNSIGNED        | FK → families.id, CASCADE     | 所属家庭                         |
| user_id             | BIGINT UNSIGNED        | FK → users.id, NULL, SET NULL | 对应用户，注销后允许保留历史成员 |
| role                | ENUM('admin','member') | DEFAULT member                | 单管理员角色模型                 |
| nickname            | VARCHAR(40)            | NOT NULL                      | 家庭内成员名称                   |
| status              | ENUM('active','left')  | DEFAULT active                | 成员状态                         |
| joined_at           | DATETIME               | DEFAULT CURRENT_TIMESTAMP     | 加入时间                         |
| (family_id,user_id) | —                      | UNIQUE                        | 避免同一用户重复加入同一家庭     |

### 3.2.4 storage_cleanup_jobs —— 对象存储异步清理任务

| **字段**        | **类型**                       | **键/约束**                      | **说明**                 |
|-----------------|--------------------------------|----------------------------------|--------------------------|
| id              | BIGINT UNSIGNED                | PK, AUTO_INCREMENT               | 任务主键                 |
| file_id         | VARCHAR(500)                   | NOT NULL, UNIQUE                 | 待删除 CloudBase File ID |
| kind            | ENUM('avatar','family_recipe') | NOT NULL                         | 文件类型                 |
| attempts        | TINYINT UNSIGNED               | DEFAULT 0                        | 失败重试次数             |
| next_attempt_at | DATETIME                       | DEFAULT CURRENT_TIMESTAMP, INDEX | 下次允许重试时间         |
| created_at      | DATETIME                       | DEFAULT CURRENT_TIMESTAMP        | 任务创建时间             |

### 3.2.5 ingredients —— 全局基础食材与营养信息

| **字段**              | **类型**        | **键/约束**               | **说明**     |
|-----------------------|-----------------|---------------------------|--------------|
| id                    | BIGINT UNSIGNED | PK, AUTO_INCREMENT        | 食材主键     |
| name                  | VARCHAR(60)     | NOT NULL, UNIQUE          | 食材名称     |
| calories_per_100g     | DECIMAL(8,2)    | CHECK ≥ 0                 | 每100g热量   |
| protein_per_100g      | DECIMAL(8,2)    | CHECK ≥ 0                 | 每100g蛋白质 |
| fat_per_100g          | DECIMAL(8,2)    | CHECK ≥ 0                 | 每100g脂肪   |
| carbohydrate_per_100g | DECIMAL(8,2)    | CHECK ≥ 0                 | 每100g碳水   |
| created_at            | DATETIME        | DEFAULT CURRENT_TIMESTAMP | 创建时间     |

### 3.2.6 ingredient_seasons —— 食材与适宜月份关系

| **字段**      | **类型**         | **键/约束**                      | **说明** |
|---------------|------------------|----------------------------------|----------|
| ingredient_id | BIGINT UNSIGNED  | PK(FK) → ingredients.id, CASCADE | 食材     |
| month         | TINYINT UNSIGNED | PK, CHECK 1~12                   | 月份     |

### 3.2.7 recipes —— 家庭菜谱主表

| **字段**                | **类型**                        | **键/约束**                      | **说明**         |
|-------------------------|---------------------------------|----------------------------------|------------------|
| id                      | BIGINT UNSIGNED                 | PK, AUTO_INCREMENT               | 菜谱主键         |
| family_id               | BIGINT UNSIGNED                 | FK → families.id, CASCADE, INDEX | 所属家庭         |
| created_by_member_id    | BIGINT UNSIGNED                 | FK → family_members.id, RESTRICT | 创建者成员关系   |
| title                   | VARCHAR(80)                     | NOT NULL                         | 菜名             |
| category                | ENUM('荤菜','素菜','汤','主食') | NOT NULL                         | 分类             |
| description             | TEXT                            | NOT NULL                         | 描述             |
| steps                   | TEXT                            | NOT NULL                         | 制作步骤         |
| cook_minutes            | SMALLINT UNSIGNED               | CHECK 1~360                      | 烹饪时间         |
| difficulty              | TINYINT UNSIGNED                | CHECK 1~5                        | 难度             |
| servings                | TINYINT UNSIGNED                | CHECK 1~12, DEFAULT 2            | 份数             |
| cover_url               | VARCHAR(500)                    | DEFAULT 空串                     | 稳定封面 File ID |
| status                  | ENUM('active','deleted')        | DEFAULT active                   | 软删除状态       |
| created_at / updated_at | DATETIME                        | 自动时间                         | 创建与更新时间   |

### 3.2.8 recipe_ingredients —— 菜谱与食材多对多关联

| **字段**      | **类型**        | **键/约束**                       | **说明** |
|---------------|-----------------|-----------------------------------|----------|
| recipe_id     | BIGINT UNSIGNED | PK(FK) → recipes.id, CASCADE      | 菜谱     |
| ingredient_id | BIGINT UNSIGNED | PK(FK) → ingredients.id, RESTRICT | 食材     |
| amount_grams  | DECIMAL(8,2)    | CHECK \> 0                        | 使用克数 |
| note          | VARCHAR(80)     | DEFAULT 空串                      | 备注     |

### 3.2.9 tag_definitions —— 系统标签与家庭自定义标签定义

| **字段**                | **类型**                  | **键/约束**                            | **说明**                           |
|-------------------------|---------------------------|----------------------------------------|------------------------------------|
| id                      | BIGINT UNSIGNED           | PK, AUTO_INCREMENT                     | 标签主键                           |
| family_id               | BIGINT UNSIGNED           | FK → families.id, NULL, CASCADE        | 系统标签为空，自定义标签绑定家庭   |
| kind                    | ENUM('system','custom')   | NOT NULL                               | 标签类型                           |
| code                    | VARCHAR(40)               | NULL                                   | 系统标签稳定代码                   |
| name                    | VARCHAR(40)               | NOT NULL                               | 显示名称                           |
| normalized_name         | VARCHAR(40)               | NOT NULL                               | 规范化名称                         |
| status                  | ENUM('active','inactive') | DEFAULT active                         | 状态                               |
| created_by_member_id    | BIGINT UNSIGNED           | FK → family_members.id, NULL, RESTRICT | 自定义标签创建者                   |
| created_at / updated_at | DATETIME                  | 自动时间                               | 创建与更新时间                     |
| scope rule              | CHECK                     | system/custom 作用域互斥               | 保证系统标签与家庭标签字段组合合法 |

### 3.2.10 recipe_tags_legacy —— 旧标签关系归档

| **字段**    | **类型**        | **键/约束**               | **说明**     |
|-------------|-----------------|---------------------------|--------------|
| recipe_id   | BIGINT UNSIGNED | 复合 PK                   | 历史菜谱ID   |
| tag_type    | VARCHAR(40)     | 复合 PK                   | 历史标签类型 |
| tag_value   | VARCHAR(40)     | 复合 PK                   | 历史标签值   |
| archived_at | DATETIME        | DEFAULT CURRENT_TIMESTAMP | 归档时间     |

### 3.2.11 recipe_tags —— 当前菜谱与标签关系

| **字段**  | **类型**        | **键/约束**                                  | **说明** |
|-----------|-----------------|----------------------------------------------|----------|
| recipe_id | BIGINT UNSIGNED | PK(FK) → recipes.id, CASCADE                 | 菜谱     |
| tag_id    | BIGINT UNSIGNED | PK(FK) → tag_definitions.id, RESTRICT, INDEX | 标签     |

### 3.2.12 member_category_preferences —— 成员类别偏好

| **字段**         | **类型**                        | **键/约束**                         | **说明** |
|------------------|---------------------------------|-------------------------------------|----------|
| member_id        | BIGINT UNSIGNED                 | PK(FK) → family_members.id, CASCADE | 成员     |
| category         | ENUM('荤菜','素菜','汤','主食') | PK                                  | 菜品分类 |
| preference_score | TINYINT UNSIGNED                | CHECK 1~5, DEFAULT 3                | 偏好分数 |

### 3.2.13 member_ingredient_restrictions —— 成员食材忌口

| **字段**      | **类型**        | **键/约束**                         | **说明** |
|---------------|-----------------|-------------------------------------|----------|
| member_id     | BIGINT UNSIGNED | PK(FK) → family_members.id, CASCADE | 成员     |
| ingredient_id | BIGINT UNSIGNED | PK(FK) → ingredients.id, CASCADE    | 忌口食材 |
| reason        | VARCHAR(100)    | DEFAULT 忌口                        | 原因     |

### 3.2.14 recommendation_runs —— 推荐请求与上下文快照

| **字段**                         | **类型**                           | **键/约束**                      | **说明**             |
|----------------------------------|------------------------------------|----------------------------------|----------------------|
| id                               | BIGINT UNSIGNED                    | PK, AUTO_INCREMENT               | 推荐批次             |
| family_id                        | BIGINT UNSIGNED                    | FK → families.id, CASCADE, INDEX | 家庭                 |
| created_by_member_id             | BIGINT UNSIGNED                    | FK → family_members.id, RESTRICT | 发起成员             |
| menu_date                        | DATE                               | NOT NULL                         | 目标日期             |
| meal_type                        | ENUM('breakfast','lunch','dinner') | NOT NULL                         | 餐次                 |
| people_count                     | TINYINT UNSIGNED                   | CHECK 1~12                       | 用餐人数             |
| max_cook_minutes                 | SMALLINT UNSIGNED                  | NULL, CHECK 10~480               | 旧推荐最大烹饪时长   |
| max_prep_minutes                 | SMALLINT UNSIGNED                  | NULL, CHECK 10~480               | 当前推荐最大准备时长 |
| mode                             | ENUM('balanced','healthy','quick') | NULL                             | 旧推荐模式           |
| total_score / total_cook_minutes | 数值                               | NULL                             | 旧推荐汇总字段       |
| score_breakdown                  | JSON                               | NULL                             | 评分分解             |
| menu_structure                   | JSON                               | NULL                             | 菜单结构快照         |
| session_preferences              | JSON                               | NULL                             | 本次标签偏好快照     |
| created_at                       | DATETIME                           | DEFAULT CURRENT_TIMESTAMP        | 生成时间             |

### 3.2.15 recommendation_items —— 旧推荐结果明细（兼容）

| **字段**              | **类型**        | **键/约束**                          | **说明**         |
|-----------------------|-----------------|--------------------------------------|------------------|
| id                    | BIGINT UNSIGNED | PK, AUTO_INCREMENT                   | 明细主键         |
| recommendation_run_id | BIGINT UNSIGNED | FK → recommendation_runs.id, CASCADE | 推荐批次         |
| recipe_id             | BIGINT UNSIGNED | FK → recipes.id, RESTRICT            | 菜谱             |
| dish_score            | DECIMAL(6,2)    | NOT NULL                             | 单菜得分         |
| reason_text           | VARCHAR(500)    | NOT NULL                             | 解释文本         |
| (run,recipe)          | —               | UNIQUE                               | 同批次菜谱不重复 |

### 3.2.16 recommendation_candidates —— 当前推荐候选菜单

| **字段**               | **类型**          | **键/约束**                          | **说明**     |
|------------------------|-------------------|--------------------------------------|--------------|
| id                     | BIGINT UNSIGNED   | PK, AUTO_INCREMENT                   | 候选主键     |
| recommendation_run_id  | BIGINT UNSIGNED   | FK → recommendation_runs.id, CASCADE | 推荐批次     |
| candidate_rank         | TINYINT UNSIGNED  | CHECK 1~3, UNIQUE(run,rank)          | 候选排名     |
| estimated_prep_minutes | SMALLINT UNSIGNED | NOT NULL                             | 预计准备时间 |
| total_score            | DECIMAL(6,2)      | NOT NULL                             | 综合分       |
| score_breakdown        | JSON              | NOT NULL                             | 多维评分分解 |
| reason_text            | VARCHAR(500)      | DEFAULT 空串                         | 候选解释     |

### 3.2.17 recommendation_candidate_items —— 候选菜单中的菜谱槽位

| **字段**                    | **类型**                        | **键/约束**                                    | **说明**     |
|-----------------------------|---------------------------------|------------------------------------------------|--------------|
| recommendation_candidate_id | BIGINT UNSIGNED                 | PK(FK) → recommendation_candidates.id, CASCADE | 候选菜单     |
| recipe_id                   | BIGINT UNSIGNED                 | PK(FK) → recipes.id, RESTRICT                  | 菜谱         |
| slot_no                     | TINYINT UNSIGNED                | UNIQUE(candidate,slot), CHECK ≥1               | 候选中的位置 |
| category                    | ENUM('荤菜','素菜','汤','主食') | NOT NULL                                       | 槽位类别     |
| dish_score                  | DECIMAL(6,2)                    | NOT NULL                                       | 单菜得分     |
| reason_text                 | VARCHAR(500)                    | DEFAULT 空串                                   | 单菜推荐理由 |

### 3.2.18 menus —— 按家庭、日期、餐次组织的菜单

| **字段**                        | **类型**                           | **键/约束**                                 | **说明**                     |
|---------------------------------|------------------------------------|---------------------------------------------|------------------------------|
| id                              | BIGINT UNSIGNED                    | PK, AUTO_INCREMENT                          | 菜单主键                     |
| family_id                       | BIGINT UNSIGNED                    | FK → families.id, CASCADE                   | 家庭                         |
| created_by_member_id            | BIGINT UNSIGNED                    | FK → family_members.id, RESTRICT            | 创建者                       |
| recommendation_run_id           | BIGINT UNSIGNED                    | FK → recommendation_runs.id, NULL, SET NULL | 来源推荐批次                 |
| menu_date                       | DATE                               | NOT NULL                                    | 日期                         |
| meal_type                       | ENUM('breakfast','lunch','dinner') | NOT NULL                                    | 餐次                         |
| status                          | ENUM('active','completed')         | DEFAULT active                              | 菜单状态                     |
| created_at / updated_at         | DATETIME                           | 自动时间                                    | 创建与更新时间               |
| (family_id,menu_date,meal_type) | —                                  | UNIQUE                                      | 同家庭同日同餐次只有一个菜单 |

### 3.2.19 menu_items —— 菜单与菜谱关联

| **字段**            | **类型**                        | **键/约束**               | **说明**           |
|---------------------|---------------------------------|---------------------------|--------------------|
| id                  | BIGINT UNSIGNED                 | PK, AUTO_INCREMENT        | 菜单项主键         |
| menu_id             | BIGINT UNSIGNED                 | FK → menus.id, CASCADE    | 菜单               |
| recipe_id           | BIGINT UNSIGNED                 | FK → recipes.id, RESTRICT | 菜谱               |
| source              | ENUM('manual','recommendation') | DEFAULT manual            | 来源               |
| note                | VARCHAR(200)                    | DEFAULT 空串              | 备注               |
| created_at          | DATETIME                        | DEFAULT CURRENT_TIMESTAMP | 创建时间           |
| (menu_id,recipe_id) | —                               | UNIQUE                    | 同菜单同菜谱不重复 |

### 3.2.20 menu_feedback —— 成员对菜单项的反馈

| **字段**                 | **类型**         | **键/约束**                     | **说明**                     |
|--------------------------|------------------|---------------------------------|------------------------------|
| id                       | BIGINT UNSIGNED  | PK, AUTO_INCREMENT              | 反馈主键                     |
| menu_item_id             | BIGINT UNSIGNED  | FK → menu_items.id, CASCADE     | 菜单项                       |
| member_id                | BIGINT UNSIGNED  | FK → family_members.id, CASCADE | 反馈成员                     |
| rating                   | TINYINT UNSIGNED | CHECK 1~5                       | 星级                         |
| comment                  | VARCHAR(200)     | DEFAULT 空串                    | 文字评价                     |
| created_at               | DATETIME         | DEFAULT CURRENT_TIMESTAMP       | 创建时间                     |
| (menu_item_id,member_id) | —                | UNIQUE                          | 每位成员对同菜单项仅一条反馈 |

## 3.3 主要关系与参照动作

外键的删除策略并没有全部使用同一种方式，而是根据业务含义分别采用 `CASCADE`、`RESTRICT` 和 `SET NULL`。需要随父记录一起清理的数据使用级联删除；仍被历史记录引用的数据采用限制删除；用户注销后仍希望保留的历史关系则允许把外键置空。

| **外键关系**                                            | **ON DELETE**                 | **设计含义**                                   |
|---------------------------------------------------------|-------------------------------|------------------------------------------------|
| families.admin_user_id → users.id                       | SET NULL                      | 管理员用户注销时保留已归档家庭记录。           |
| family_members.family_id → families.id                  | CASCADE                       | 家庭物理清理时级联清理成员关系。               |
| family_members.user_id → users.id                       | SET NULL                      | 账号注销后可保留历史成员记录。                 |
| recipes.family_id → families.id                         | CASCADE                       | 家庭清理时清理其菜谱。                         |
| recipes.created_by_member_id → family_members.id        | RESTRICT                      | 菜谱仍存在时不能删除其作者关系。               |
| recipe_ingredients → recipes / ingredients              | CASCADE / RESTRICT            | 删菜谱可清关系，存在菜谱引用时限制删食材。     |
| tag_definitions.family_id → families.id                 | CASCADE                       | 家庭自定义标签随家庭删除。                     |
| recipe_tags → recipes / tag_definitions                 | CASCADE / RESTRICT            | 删菜谱清关联，标签被引用时不可直接物理删除。   |
| recommendation_runs → families / family_members         | CASCADE / RESTRICT            | 推荐批次属于家庭并保留创建者引用。             |
| recommendation_candidates → recommendation_runs         | CASCADE                       | 推荐批次删除时删除候选。                       |
| recommendation_candidate_items → candidate / recipe     | CASCADE / RESTRICT            | 候选删除清明细，菜谱历史引用受保护。           |
| menus → families / family_members / recommendation_runs | CASCADE / RESTRICT / SET NULL | 兼顾家庭清理、作者历史与推荐来源可空。         |
| menu_items → menus / recipes                            | CASCADE / RESTRICT            | 菜单删除清菜单项，历史菜单存在时保护菜谱引用。 |
| menu_feedback → menu_items / family_members             | CASCADE / CASCADE             | 反馈依附菜单项和成员关系。                     |

## 3.4 数据完整性设计

数据库完整性主要从三个层面实现。首先是实体完整性。用户、家庭、菜谱、推荐批次、菜单等实体表都设置独立主键，多对多关系表则使用复合主键，例如 `recipe_ingredients(recipe_id, ingredient_id)`、`recipe_tags(recipe_id, tag_id)` 和 `member_ingredient_restrictions(member_id, ingredient_id)`，从结构上避免重复关系。

其次是参照完整性。当前 Schema 共包含 29 条外键，不同关系根据实际业务选择不同删除动作。家庭真正被物理清理后，其成员关系和家庭业务数据可以级联删除；菜谱作者、菜单创建者等具有历史责任含义的引用使用 `RESTRICT`；用户注销后，`family_members.user_id` 可以置空，从而保留“曾经存在过的成员关系”。

最后是用户定义完整性。系统通过 `ENUM`、`CHECK`、`UNIQUE` 和后端参数校验共同限制业务数据，例如菜谱难度只能为 1～5、份数只能为 1～12、反馈评分只能为 1～5、季节月份只能为 1～12，同一家庭同一天同一餐次也只能存在一个 Menu。数据库约束与接口校验同时存在，可以尽量减少非法数据进入核心表。

## 3.5 规范化与冗余控制

主体表结构按照第三范式的思路设计：用户、家庭、成员、菜谱、食材、标签、菜单和反馈分别保存各自实体属性，多对多关系拆分到独立关联表中，成员偏好和忌口也不会重复写进 `users` 或 `recipes`。

推荐模块中保留了一部分有意的冗余。例如候选菜单的 `reason_text` 和 `score_breakdown` 保存的是推荐发生当时的结果，如果每次查看历史推荐都重新计算，后续食材、标签或评分规则变化后就可能得到不同结果。因此这里选择保存快照，以换取历史结果的可追溯性。

`recipe_tags_legacy` 和 `recommendation_items` 主要承担旧版本兼容和历史数据保留作用，新的标签关系使用 `tag_definitions + recipe_tags`，新的推荐结果使用 `recommendation_runs + recommendation_candidates + recommendation_candidate_items`。

## 3.6 索引、唯一性与事务

数据库中几处约束和索引直接对应高频业务：

- `families.invite_code` 建立唯一索引，并使用 `ascii_bin` 保证邀请码大小写敏感。
- `recipes` 使用 `family_id + category + status` 组合索引，服务家庭内菜谱分类查询。
- `menus` 使用 `UNIQUE(family_id, menu_date, meal_type)`，从数据库层保证菜单槽位唯一。
- `recommendation_candidates` 使用 `UNIQUE(recommendation_run_id, candidate_rank)`，避免同一推荐批次出现重复候选排名。

事务主要用于“一个业务动作需要同时写多张表”的场景。例如创建或编辑菜谱需要同时更新菜谱主表、食材关系和标签关系；生成推荐要同时写推荐批次、候选和候选项；应用推荐要写菜单和菜单项；创建家庭时还要同时生成管理员成员和 48 道初始菜谱。任何一步失败都会回滚，避免出现只完成一部分的数据状态。

## 3.7 初始数据设计

全新数据库建立后先保留一组全局基础数据，包括 53 项食材、60 项食材季节映射和 10 个系统标签。此时用户、家庭、成员和家庭菜谱均为空。

当真实用户首次创建家庭时，Starter Recipe Service 会读取这些基础数据，在同一事务内为该家庭生成 48 道初始菜谱，并建立对应的食材和标签关系。系统菜谱图片没有打包进小程序，而是通过固定的 Storage 路径映射为稳定的 CloudBase File ID。这样既减小了小程序包体积，也避免不同家庭重复保存同一套初始图片。

---

# 四、开发工具

## 4.1 开发与运行环境

| **类别**       | **工具/技术**                          | **版本或说明**                               |
|----------------|----------------------------------------|----------------------------------------------|
| 微信小程序前端 | 微信原生小程序（WXML/WXSS/JavaScript） | 项目 compileType=miniprogram，style=v2       |
| 微信开发者工具 | 微信官方开发者工具                     | 具体客户端版本未写入仓库，答辩前可补实际版本 |
| 后端运行时     | Node.js                                | 24（Docker 基础镜像 node:24-alpine）         |
| Web 框架       | Express                                | 5.2.1                                        |
| 数据库驱动     | mysql2                                 | 3.24.3                                       |
| 参数校验       | zod                                    | 3.25.76                                      |
| JWT            | jsonwebtoken                           | 9.0.3                                        |
| 环境变量       | dotenv                                 | 16.6.1                                       |
| 跨域中间件     | cors                                   | 2.8.6                                        |
| 对象存储 SDK   | @cloudbase/node-sdk                    | 3.18.3                                       |
| 数据库         | MySQL                                  | 8.0+ / InnoDB / utf8mb4                      |
| 云平台         | 腾讯 CloudBase                         | 云托管 + 私有 Storage + 云数据库             |
| 容器           | Docker                                 | CloudBase 构建 Node 24 Alpine 镜像           |
| 版本控制       | Git / GitHub                           | 仓库 HarrisCH-EN/mealpilot                   |

## 4.2 后端主要依赖

后端使用 Node.js 24 作为运行环境，Express 负责 HTTP 接口，`mysql2` 负责数据库访问，`jsonwebtoken` 用于 JWT，会话参数和业务输入使用 `zod` 等方式校验。CloudBase Node SDK 负责对象存储相关操作。依赖版本由 `package-lock.json` 锁定，部署时通过 `npm ci --omit=dev` 安装生产依赖，减少“本地能运行、云端版本不一致”的问题。

## 4.3 部署支撑环境

生产后端服务名为 `mealpilot-api`，运行在腾讯 CloudBase 云托管。MySQL 保存结构化业务数据，CloudBase 私有 Storage 保存头像和菜谱封面。数据库只持久化稳定的 `cloud://` File ID，真正展示图片时再由后端调用 Storage SDK 生成临时 HTTPS URL 返回给小程序。

生产镜像使用的 Dockerfile 如下：

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

## 4.4 测试、版本控制与配置管理

项目通过 Git 和 GitHub 管理版本，生产部署以 `main` 分支为准。后端和小程序都保留了自动化测试，其中后端重点覆盖认证、家庭边界、事务、推荐和 Storage 等逻辑，小程序测试主要验证登录流程、页面状态和前端业务契约。涉及真实 MySQL 写入的集成测试使用独立测试库和显式写入开关，避免误操作生产数据库。

开发环境和生产环境分别配置。生产启动时会检查 JWT、微信登录和 CloudBase Storage 所需的关键环境变量，并强制关闭开发登录。密码、AppSecret 和 API Key 等敏感信息只存在于服务端环境变量中，不提交到 Git 仓库，也不会进入小程序包。

---

# 五、具体实现

## 5.1 系统运行流程

小程序启动后会先尝试恢复本地会话。如果没有有效 Token，则进入登录页；用户点击微信登录后，前端通过 `wx.login()` 获取临时 code，再交给后端调用微信 `code2Session` 换取 OpenID。后端根据 OpenID 查找或创建用户并签发 JWT。

对于第一次登录的用户，系统不会把“登录成功”和“资料已经完善”混为一件事。登录成功后，如果昵称或头像仍不完整，就进入资料完善页；资料保存完成并再次确认 `profileComplete=true` 后，才进入推荐、菜单、菜谱和设置等业务页面。

> **图 5-1 登录与首次资料完善运行截图（后续补充）**

## 5.2 微信登录与首次资料完善

登录流程采用“身份确认”和“资料完善”两步设计。OpenID 用来确定“是谁”，昵称和头像用来完善用户展示资料，因此昵称头像并不是 `code2Session` 成功的前提。后端通过 `isProfileComplete()` 判断昵称是否仍为默认值，以及头像 File ID 是否已经存在。

```javascript
function isProfileComplete(user) {
  const displayName = String(user && user.display_name || '').trim()
  const avatarFileId = String(user && user.avatar_url || '').trim()
  return !new Set(['', '微信用户']).has(displayName) && Boolean(avatarFileId)
}
```

用户选择头像后，前端拿到的只是本地临时路径，因此不能直接写入数据库。前端先调用 `/uploads/avatar` 上传文件，后端校验后保存到 CloudBase Storage，再把稳定 File ID 写入用户记录；昵称则通过 `/auth/profile` 更新。会话恢复、首次登录和 401 重新认证共用同一套 Auth Service 与 Route Guard，避免不同页面各写一套登录判断。

## 5.3 家庭与成员生命周期

创建家庭不是只插入一条 `families` 记录。后端会先开启事务并确认当前用户没有其他 active membership，然后创建家庭、创建 admin 成员关系，再初始化 48 道 Starter Recipe。只要其中一步失败，整个创建过程都会回滚。

家庭解散同样没有直接使用 `DELETE`。系统先把家庭改为 `archived`，记录解散时间和 30 天后的清理时间，并让当前成员关系退出。管理员在恢复期内可以恢复家庭；超过期限后，再由生命周期清理逻辑分批删除数据库数据，同时把需要删除的 Storage 文件加入 `storage_cleanup_jobs`。

```sql
UPDATE families
SET status = 'archived',
    disbanded_at = CURRENT_TIMESTAMP,
    purge_after = DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 30 DAY)
WHERE id = ? AND status = 'active';
```

## 5.4 菜谱、食材与标签事务

新增菜谱时，系统会先检查菜名、分类、烹饪时间、难度、份数、食材 ID、食材用量以及标签数量。真正写入数据库时，菜谱主表、食材关联和标签关联放在同一个事务中完成。如果某个食材不存在，或者标签不属于当前家庭，事务会整体回滚，不会留下“菜谱已经创建但没有完整明细”的数据。

菜谱删除采用软删除，只把 `status` 改为 `deleted`。菜谱列表、详情和推荐只读取 active 数据，而已经存在的历史 MenuItem 或 RecommendationCandidateItem 仍然可以继续引用原记录。权限上，普通成员只能修改和删除自己创建的菜谱，家庭管理员可以管理本家庭全部菜谱。

> **图 5-2 菜谱列表、详情和编辑页面运行截图（后续补充）**

## 5.5 菜单管理

菜单按“家庭 + 日期 + 餐次”组织。`menus` 表上的 `UNIQUE(family_id, menu_date, meal_type)` 从数据库层保证同一家庭在同一天的同一餐次只有一个菜单；`menu_items` 上的 `UNIQUE(menu_id, recipe_id)` 则避免同一道菜重复加入同一餐次。

前端日历需要知道哪些日期已有菜单，因此 `/menus/dates` 会按日期做 `GROUP BY`，只返回真正包含菜单项的日期。读取某天菜单时，后端会把 Menu、MenuItem、Recipe 和当前成员的反馈一起查询出来，再统一处理菜谱封面的临时访问 URL。

## 5.6 忌口与偏好

忌口信息记录在 `member_ingredient_restrictions` 中，`(member_id, ingredient_id)` 作为复合主键，可以直接避免同一成员重复添加同一种忌口食材。生成推荐时，系统会汇总当前家庭所有 active 成员的忌口；只要一道菜包含其中任意一种食材，就会在候选生成之前被排除。

类别偏好记录在 `member_category_preferences` 中，荤菜、素菜、汤和主食四类分别使用 1～5 分表示。计算家庭偏好时，对所有 active 成员求平均；某个成员没有设置某一类偏好时，按中性值 3 处理。这样既能利用已经填写的数据，也不会因为某人没有设置偏好就影响推荐流程。

## 5.7 可解释推荐算法

推荐模块是本系统中数据加工最集中的部分。它并不是直接从数据库随机抽几道菜，而是先根据家庭数据缩小候选范围，再按菜单结构生成完整组合，最后对组合评分。输入主要包括日期、餐次、人数、最大准备时间、菜单结构以及本次选择的标签。

推荐流程分为以下几个步骤：

1. **家庭范围过滤**：只读取当前家庭且状态为 active 的菜谱。
2. **忌口过滤**：剔除命中任意 active 家庭成员忌口食材的菜谱。
3. **低评分过滤**：如果当前成员曾对某道菜给出 2 星及以下评价，本次推荐不再把它放入候选池。
4. **分类容量检查**：根据结构要求检查荤菜、素菜、汤、主食数量是否足够。
5. **完整组合生成**：按结构递归组合菜谱，同一候选内不重复使用菜谱，原始候选最多生成 300 组。
6. **标签覆盖检查**：如果用户本次选择了标签，完整菜单需要覆盖这些标签要求。
7. **多维评分**：分别计算偏好、食材多样性、做法多样性、营养、季节性和近期重复度。
8. **质量窗口与探索**：先保留接近最高分的一批结果，再进行受控打散，避免每次都固定出现完全相同的组合。
9. **候选差异化**：优先选择相互之间菜谱重叠较少的方案，最终最多保留三套。
10. **持久化与应用**：保存推荐批次、候选及单菜理由；真正应用到菜单前，再检查最新忌口、菜谱状态和菜单结构。

综合评分权重如下：

| 评分维度 | 权重 | 说明 |
|---|---:|---|
| Preference | 30 | 本次标签偏好与家庭类别偏好 |
| Ingredient Diversity | 15 | 不同菜之间非公共食材的差异程度 |
| Method Diversity | 10 | 烹饪方式的多样性 |
| Nutrition | 15 | 蛋白质、脂肪和碳水供能比例的平衡程度 |
| Seasonal | 10 | 季节匹配维度；当前主链路保持中性值，兼容逻辑可参与计算 |
| Novelty | 20 | 根据最近 7 天菜单历史减少重复菜谱 |

总分计算为：

```text
totalScore = round(
  preference * 30%
  + ingredientDiversity * 15%
  + methodDiversity * 10%
  + nutrition * 15%
  + seasonal * 10%
  + novelty * 20%
)
```

准备时间没有简单把所有菜的烹饪时间相加，而是假设家庭做饭时一部分步骤可以并行，因此使用下面的估算方式：

```text
estimatedPrepMinutes = longestCookMinutes
  + ceil((sumCookMinutes - longestCookMinutes) * 0.5)
```

对于近期重复，目标日期之前 3 天内出现过的菜谱扣 20 分，4～7 天内出现过的菜谱扣 8 分，超过 7 天则不再扣分。这样，历史菜单和用餐反馈会真正影响下一次推荐，而不是只作为展示数据存在。

> **图 5-3 推荐条件、候选结果与“换一组”页面截图（后续补充）**

## 5.8 用餐反馈与统计分析

`menu_feedback` 使用 `UNIQUE(menu_item_id, member_id)` 保证同一成员对同一菜单项只有一条反馈；评分范围同时受到数据库 `CHECK` 和接口参数校验限制。成员给出的低评分还会在后续推荐中发挥作用，因此反馈不仅用于展示，也是推荐输入的一部分。

家庭洞察支持 7 天和 30 天两个时间范围，通过聚合查询计算菜单数量、菜单项数量、平均评分和热门菜谱。这里直接使用了 `COUNT`、`COUNT DISTINCT`、`AVG`、`GROUP BY`、`HAVING` 和 `ORDER BY` 等数据库操作。

```sql
SELECT COUNT(DISTINCT m.id) AS menuCount,
       COUNT(mi.id) AS itemCount,
       COALESCE(AVG(f.rating), 0) AS averageRating
FROM menus m
LEFT JOIN menu_items mi ON mi.menu_id = m.id
LEFT JOIN menu_feedback f ON f.menu_item_id = mi.id
WHERE m.family_id = ? AND <date_range>;
```

## 5.9 CloudBase 私有对象存储

云托管容器的本地磁盘不适合作为长期文件存储，因此头像和菜谱封面统一上传到 CloudBase 私有 Storage。`users.avatar_url` 和 `recipes.cover_url` 虽然沿用了早期的字段名称，但当前保存的实际上是稳定的 `cloud://` File ID。读取数据时，后端再批量换取临时 HTTPS URL 返回给小程序。

文件路径也按照业务范围划分：Starter Recipe 使用 `system/recipes/`，用户头像使用 `users/<userId>/avatars/`，家庭菜谱封面使用 `families/<familyId>/recipes/`。当账号或家庭进入清理阶段时，只把符合对应路径边界的文件加入 `storage_cleanup_jobs`，降低误删其他用户文件的风险。

## 5.10 完整性、并发与错误处理

系统没有把所有一致性问题都交给某一层处理，而是把责任分开：数据库负责主键、外键、唯一性和数值范围；事务负责多表操作的原子性；应用层负责家庭边界、角色权限、推荐结果有效性以及 Storage 路径等数据库难以单独表达的规则。

几个典型处理包括：

- 创建家庭前锁定用户记录，减少并发情况下重复创建 active Family 的可能。
- 数据库迁移脚本和家庭生命周期清理分别使用 MySQL advisory lock，避免多个实例同时处理同一类任务。
- Menu 和 MenuItem 使用唯一约束处理重复提交。
- HTTP 错误统一返回 JSON，生产环境对关键配置执行启动前检查。
- 微信 `code2Session` 会区分无效 code、AppID/AppSecret 配置错误和上游不可用，且 `session_key` 始终只留在服务端。

## 5.11 数据库重建与生产部署

本版本上线时系统仍处于测试阶段，没有需要保留的正式用户数据，因此数据库没有继续沿用旧库逐步迁移，而是直接按最新 Schema 重建。新的 `01_schema.sql` 一次建立 20 张业务表，再导入全局基础食材、季节映射和系统标签；示例用户和示例家庭清理完成后，再检查表数量、29 条外键、关键字段、基础数据以及孤儿记录。

生产代码部署到 CloudBase 云托管，小程序的 production 配置指向 HTTPS API。后端日常运行使用低权限数据库业务账号，只负责正常 CRUD；建库、建表等 DDL 操作使用单独的数据库管理权限。生产环境设置 `NODE_ENV=production`、`DEV_AUTH_ENABLED=false`，同时要求微信登录、JWT 和 Storage 相关配置完整。

## 5.12 测试与验收

项目目前包含 47 个后端测试文件和 23 个小程序测试文件，覆盖认证、资料完善、家庭生命周期、家庭数据隔离、菜谱事务、标签、菜单并发、反馈、推荐算法、推荐应用前二次校验、Storage 合约以及生产配置等内容。涉及真实 MySQL 写入的集成测试 使用独立测试库，并通过显式开关避免误写生产库。

数据库重建完成后，静态验收结果为 20 张业务表、29 条外键，基础数据包括 53 项食材、60 项季节映射和 10 个系统标签，示例用户和示例家庭均已清理。后续使用真实微信账号创建家庭时，还需要继续验证 用户、家庭、管理员成员关系和 48 道初始菜谱 是否能够通过正常接口链路一次生成。

> **图 5-4 家庭管理、菜单、反馈与统计页面截图（后续补充）**

## 5.13 核心约束示例

以 `menus` 表为例，可以同时看到实体完整性、参照完整性和业务完整性三类约束：

```sql
CREATE TABLE menus (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  family_id BIGINT UNSIGNED NOT NULL,
  created_by_member_id BIGINT UNSIGNED NOT NULL,
  menu_date DATE NOT NULL,
  meal_type ENUM('breakfast','lunch','dinner') NOT NULL,

  UNIQUE KEY uq_menu_slot (family_id, menu_date, meal_type),

  CONSTRAINT fk_menu_family
    FOREIGN KEY (family_id)
    REFERENCES families(id)
    ON DELETE CASCADE,

  CONSTRAINT fk_menu_member
    FOREIGN KEY (created_by_member_id)
    REFERENCES family_members(id)
    ON DELETE RESTRICT
) ENGINE=InnoDB;
```

其中，`id` 主键保证每条菜单记录有唯一身份；`family_id` 和 `created_by_member_id` 外键保证被引用记录真实存在；`meal_type` 的枚举和值域，以及 `(family_id, menu_date, meal_type)` 唯一键，则直接落实“同一家庭同一天同一餐次只有一个菜单”这一业务规则。菜谱、偏好、推荐和反馈表中的 `CHECK`、`UNIQUE` 约束也采用相同思路。

## 5.14 本章小结

具体实现过程中，真正需要反复处理的并不是某一个页面，而是不同数据之间如何保持一致。例如用户退出家庭后历史菜谱怎么办、家庭解散后是否允许恢复、推荐生成后基础数据变化了还能不能直接应用，这些问题都需要数据库结构、事务和应用逻辑共同配合。

最终，微信登录、家庭关系、菜谱与菜单、推荐、反馈以及对象存储已经形成一条完整的数据链。系统中的数据既可以被正常录入和维护，也会继续参与筛选、组合、评分和统计，这使数据库成为业务逻辑的一部分，而不仅仅是数据存放位置。

---

# 六、总结

## 6.1 设计成果

本次课程设计最终完成了一个可以实际部署运行的家庭膳食管理微信小程序。系统从最初的菜谱和菜单管理逐步扩展到用户身份、家庭成员、食材、标签、忌口、偏好、推荐、反馈和统计，最终形成 20 张业务表、29 条外键组成的关系数据库。

从功能上看，系统已经不只是完成菜谱的增删改查。家庭成员填写的忌口和偏好会影响推荐，历史菜单和评分也会改变后续候选结果，菜单使用情况还可以进一步汇总为 7 天或 30 天统计。数据库中的数据因此能够在后续业务中继续产生作用。

## 6.2 设计体会与主要特点

在实现过程中，我感受比较明显的一点是：表设计本身并不难，难的是当数据之间真正发生联系以后，怎样保证这些联系一直正确。例如菜谱属于哪个家庭、作者离开家庭后历史数据怎么保留、推荐结果应用之前需不需要重新检查忌口，这些问题都不能只靠页面层解决。

因此，本系统在设计上比较重视三件事。第一是家庭数据边界，核心业务数据都通过当前有效成员关系确定所属家庭；第二是完整性，能交给数据库的规则尽量使用主键、外键、唯一约束和检查约束实现，跨表操作则使用事务；第三是历史数据的可解释性，菜谱采用软删除、家庭采用归档恢复、推荐保存当时的候选分数和理由，避免后续无法理解旧数据。

推荐功能也没有采用难以说明来源的黑盒结果，而是把候选生成、硬过滤、评分和差异化选择拆成可检查的步骤。这样既方便调试，也能清楚说明某套菜单为什么会被推荐。

## 6.3 当前不足

目前系统仍然处于课程设计和小规模使用阶段，还有不少可以继续完善的地方。用户目前一次只能属于一个 active Family，不支持多个家庭之间自由切换；推荐权重仍然由人工规则设定，还没有根据长期使用数据自动学习；Storage Cleanup 依赖应用进程中的清理逻辑，尚未演化为独立任务队列。

另外，虽然已经有较多自动化测试，但真实设备上的端到端测试、云端监控、告警、性能压测和数据库备份恢复演练还不够完整。如果未来真的面向更多用户使用，这些工程能力会比继续增加页面功能更重要。

## 6.4 后续完善方向

后续可以在不破坏现有家庭数据边界的前提下继续扩展多家庭切换、更细的营养目标、长期行为学习、独立后台任务和系统监控等能力。随着真实使用数据增加，还可以进一步分析推荐采纳率、低评分菜谱、家庭菜单习惯等指标，用真实反馈调整推荐策略。

课程设计报告本身还需要补充系统功能模块图、总体 E-R 图、总体架构图以及登录、家庭管理、菜谱、推荐、菜单和统计等运行截图，使文档中的设计说明与实际界面一一对应。

---

# 附录 A：主要 API

| **模块**       | **主要接口**                                                                                                                                                                             |
|----------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Auth           | POST /auth/wechat-login；GET /auth/me；PATCH /auth/profile；DELETE /auth/account                                                                                                         |
| Family         | POST /families；POST /families/join；GET /families/current；DELETE /families/current；GET /families/recoverable；POST /families/:familyId/restore；POST /families/current/transfer-admin |
| Recipe         | GET/POST /recipes；GET/PUT/DELETE /recipes/:id；GET /ingredients                                                                                                                         |
| Tag            | GET/POST /tags；PUT/DELETE /tags/:id                                                                                                                                                     |
| Menu           | GET /menus；GET /menus/dates；POST /menus/items；DELETE /menus/items/:id                                                                                                                 |
| Recommendation | POST /recommendations；POST /recommendations/tag-availability；GET /recommendations/:id/candidates/:rank；POST /recommendations/:id/apply                                                |
| Preference     | GET/PUT/DELETE /family-members/:memberId/preferences/...；GET /families/current/preferences                                                                                              |
| Restriction    | GET/POST/DELETE /family-members/:memberId/restrictions/...；GET /families/current/restrictions                                                                                           |
| Feedback       | GET/PUT/DELETE /menu-items/:menuItemId/feedback                                                                                                                                          |
| Insights       | GET /insights?days=7\|30                                                                                                                                                                 |
| Upload         | POST /uploads/avatar；POST /uploads/recipe-cover                                                                                                                                         |

# 附录 B：数据库验收要点

数据库重建完成后，主要从结构、约束和基础数据三个方面进行验收：

| **检查项**                      | **期望结果**              |
|---------------------------------|---------------------------|
| 业务表数量                      | 20                        |
| 外键数量                        | 29                        |
| families.owner_user_id          | 不存在                    |
| families.admin_user_id          | 存在，可空，FK → users.id |
| family_members.role             | ENUM('admin','member')    |
| storage_cleanup_jobs            | 存在                      |
| 基础 ingredients                | 53                        |
| ingredient_seasons              | 60                        |
| system tags                     | 10                        |
| Demo users / families / recipes | 清理后为 0                |
| 孤儿外键关系检查                | 0 rows                    |
| 跨 Family 作者/创建者关系检查   | 0 rows                    |

静态结构检查完成后，还需要结合真实业务继续做动态验收，包括微信登录、资料完善、创建家庭、初始化 48 道 Starter Recipe、推荐生成、候选应用、菜单反馈和家庭洞察等完整流程。
