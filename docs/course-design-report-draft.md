# 《基于微信小程序的家庭膳食管理与菜谱推荐系统设计与实现》

> 当前版本说明：本文已同步至 2026-09-16 代码基线。当前实现以全局强制登录、全局 User 资料、Owner/Admin/Member 家庭角色、6 位大小写敏感邀请码和 19 张数据库表为准；课程报告正文中的历史方案差异以本文后续修订内容和 [CURRENT_VERSION.md](/E:/Database_Design/docs/CURRENT_VERSION.md) 为准。

## 一、需求分析

### 1.1 项目背景与意义

随着家庭生活节奏加快，家庭成员在菜谱选择、食材管理和每日菜单安排方面面临着重复决策和信息分散等问题。传统的菜谱记录方式通常只能保存菜品信息，难以同时表达家庭成员关系、饮食限制、口味偏好、菜单安排和用餐反馈，也难以利用已有数据生成具有解释性的推荐结果。

本系统面向家庭膳食管理场景，使用微信小程序作为用户操作端，以家庭作为业务数据的基本隔离边界，围绕菜谱、食材、菜单和推荐建立关系数据库。系统不仅提供数据的增加、查询、修改和删除，还通过推荐评分、饮食限制过滤、口味偏好聚合和用餐反馈统计对数据进行进一步加工，体现关系数据库在实际应用中的完整性约束、事务处理和聚合分析能力。

### 1.2 系统设计目标

系统设计目标如下：

1. 建立能够表示用户、家庭、成员、菜谱、食材、菜单、推荐和反馈等对象及其联系的关系数据库。
2. 实现菜谱从创建、编辑、展示到软删除的完整管理过程，并保存菜谱与食材之间的用量关系。
3. 实现按日期和餐次管理家庭菜单，保证同一家庭的同一日期和餐次只有一个菜单。
4. 根据家庭成员的饮食限制和分类偏好生成可解释的菜谱推荐结果。
5. 通过主键、外键、唯一约束、检查约束和事务保证数据的一致性。
6. 通过微信小程序提供简洁的操作界面，并为无家庭、无数据、加载中和请求失败等状态提供相应反馈。

### 1.3 功能需求分析

#### 1.3.1 用户与家庭管理

系统支持正式微信登录和开发环境登录。未登录用户只能停留在登录页，登录成功后进入推荐页；退出登录或 Token 失效后回到登录页。用户登录后可以创建家庭，也可以通过邀请码加入已有家庭。家庭成员具有 owner、admin 和 member 三种角色，并具有 active 和 left 两种状态。普通成员可以读取和复制邀请码，Owner/Admin 可以修改家庭名称、刷新邀请码和管理成员，Owner 可以向 active 成员移交创建者身份。当前系统约束同一用户在同一时刻最多具有一个有效家庭成员关系；没有有效家庭关系的用户仍可以创建家庭或加入家庭，但不能访问家庭业务数据。

#### 1.3.2 菜谱管理

家庭成员可以在所属家庭内创建、查看、编辑和软删除菜谱。菜谱信息包括名称、分类、描述、制作步骤、烹饪时间、难度、份数、封面和食材明细。菜谱与食材之间通过关联关系保存用量和备注。已删除菜谱不再进入新的菜单和推荐，但历史菜单中的关联仍然保留，并按照系统的动态引用规则展示。

#### 1.3.3 菜单管理

菜单由家庭、日期和餐次共同确定。用户可以选择日期和早餐、午餐或晚餐，手动添加菜谱，也可以将推荐结果应用到菜单。用户可以记录 MenuItem 备注、删除 MenuItem 关系和对 MenuItem 进行反馈。同一道菜重复加入同一菜单时不产生重复关系，也不覆盖已有备注；删除最后一个 MenuItem 后，空菜单仍然保留。

#### 1.3.4 饮食限制与口味偏好

饮食限制以家庭成员和食材为粒度保存，属于硬约束。当前家庭所有有效成员的限制取并集，菜谱只要含有其中任一种受限食材，就从本次推荐候选集中排除。

口味偏好以家庭成员和菜品分类为粒度保存，取值范围为 1～5，属于软偏好。未设置某一分类偏好的成员按中性值 3 参与当前家庭的平均计算。偏好只影响推荐排序，不直接排除菜谱。

#### 1.3.5 菜谱推荐

用户可以提交用餐人数、期望准备时间、日期、餐次、菜单结构和本次会话偏好。系统先检查当前家庭及成员状态，过滤已删除菜谱和违反饮食限制的菜谱，再结合家庭偏好、食材与方法多样性、营养、季节和近期新颖度生成多个 Candidate。推荐结果保存得分和原因，并可以选择 Candidate 应用到菜单；旧推荐请求仍保留兼容路径。

#### 1.3.6 用餐反馈与统计

有效家庭成员可以对菜单中的菜谱进行 1～5 分评分，并填写不超过 200 个字符的可选评论。同一成员对同一 MenuItem 最多保存一条反馈，重复提交时更新原记录。系统根据菜单和反馈数据统计菜单数量、菜单项数量、热门菜谱及平均评分，为用户提供家庭用餐情况概览。

### 1.4 系统功能模块

系统功能可以划分为认证与全局账号资料、家庭管理、菜谱与食材管理、菜单管理、推荐管理、家庭限制与偏好管理、反馈与统计七个模块。各模块通过家庭成员关系与当前家庭边界关联起来；用户名和头像属于全局 User 资料，在多个家庭相关页面共用。

`【图1-1 系统功能模块图，此处后补】`

### 1.5 非功能需求

1. **数据安全性**：未认证请求返回 401；无有效家庭关系返回 403；同家庭中权限不足返回 403；其他家庭的资源统一返回 404，以避免泄露资源存在性。
2. **数据完整性**：Recipe 与 RecipeIngredient 的创建和编辑必须在同一事务中完成；推荐应用过程使用事务；数据库唯一约束作为并发场景的最终防线。
3. **操作幂等性**：重复加入菜单、重复保存偏好、重复评分和重复删除等操作具有稳定结果，不产生重复关系或未处理的数据库错误。
4. **可维护性**：系统采用 Express REST API 和显式 SQL，保持模块边界清晰，不引入与课程设计规模不相称的复杂架构。
5. **可复现性**：项目提供数据库初始化脚本、种子数据、环境变量说明和测试命令，能够在满足运行环境条件的情况下完成安装和启动。

### 1.6 用户角色与业务边界

| 用户状态 | 主要权限 |
| --- | --- |
| 未登录用户 | 不能访问受保护的家庭业务接口 |
| 已登录但没有有效家庭关系的用户 | 可以查看账号资料、创建家庭和通过邀请码加入家庭 |
| Owner | 使用家庭业务功能，维护当前家庭所有有效成员的饮食限制和口味偏好，并可改名、刷新邀请码、管理成员和移交创建者身份 |
| Admin | 使用家庭业务功能，可改名、刷新邀请码、管理成员；不能移交创建者身份 |
| 普通有效成员 | 使用当前家庭业务功能，维护自己的饮食限制和口味偏好，并可读取和复制邀请码 |
| 已离开成员 | 保留历史关系和历史数据，不再编辑限制、偏好或新增反馈 |

所有 Recipe、Menu、RecommendationRun、MenuItem 和成员级配置都必须与当前用户的有效家庭关系一致。任何跨家庭的实体访问或引用均视为非法业务关系。

### 1.7 数据处理需求

本系统的数据处理主要包括以下内容：

- 通过 JOIN、LEFT JOIN、COUNT、AVG 和 GROUP BY 对菜单使用情况和反馈进行统计。
- 对当前家庭有效成员的限制进行集合合并，完成推荐候选集的硬过滤。
- 对有效成员的分类偏好进行平均聚合，未设置值使用中性值 3。
- 按照菜单结构、家庭与会话偏好、食材和方法多样性、营养、季节及近期新颖度计算 Candidate 得分，并将准备时间作为优先排序与超时提示依据。
- 通过事务和唯一约束处理菜谱写入、推荐应用、菜单创建及重复关系写入。

## 二、概念结构设计

### 2.1 实体识别

系统包含以下实体和关联实体：

| 实体或关联实体 | 主要作用 |
| --- | --- |
| User | 保存用户登录身份、用户名和全局头像 |
| Family | 保存家庭名称、6 位邀请码和所有者 |
| FamilyMember | 表示用户与家庭的成员关系、owner/admin/member 角色和状态 |
| Ingredient | 保存全局食材参考信息 |
| IngredientSeason | 表示食材与月份的季节关系 |
| Recipe | 保存家庭菜谱主信息 |
| RecipeIngredient | 表示菜谱与食材的多对多关系及用量 |
| MemberCategoryPreference | 表示成员与菜品分类的偏好关系 |
| MemberIngredientRestriction | 表示成员与食材的限制关系 |
| Menu | 表示家庭某日期某餐次的菜单 |
| MenuItem | 表示菜单与菜谱的关系、来源和备注 |
| RecommendationRun | 表示一次推荐运行及其输入和汇总结果 |
| RecommendationCandidate | 表示一次推荐运行中的可应用候选菜单及其排名、得分和理由 |
| RecommendationCandidateItem | 表示候选菜单中的槽位与菜谱关系、分数和理由 |
| MenuFeedback | 表示成员对菜单项的评分和评论 |

### 2.2 实体之间的联系与基数

| 联系 | 基数 | 说明 |
| --- | --- | --- |
| User—FamilyMember | 1:N | 一个用户可以通过成员关系记录与家庭关联；应用层限制同一时刻只有一个有效家庭关系 |
| Family—FamilyMember | 1:N | 一个家庭包含多个成员 |
| User—Family | 间接 M:N | 通过 FamilyMember 表达用户与家庭的联系，当前版本不开放家庭切换 |
| Family—Recipe | 1:N | 一个家庭可以拥有多个菜谱，一个菜谱只属于一个家庭 |
| Recipe—Ingredient | M:N | 通过 RecipeIngredient 表达，并保存用量和备注 |
| Ingredient—IngredientSeason | 1:N | 一个食材可以对应多个季节月份 |
| FamilyMember—CategoryPreference | 1:N | 一个成员对每个分类最多有一条偏好 |
| FamilyMember—Ingredient | M:N | 通过 MemberIngredientRestriction 表达成员级食材限制 |
| Family—Menu | 1:N | 一个家庭可以拥有多个日期和餐次的菜单 |
| Menu—Recipe | M:N | 通过 MenuItem 表达，同一菜单中同一菜谱只能出现一次 |
| Family—RecommendationRun | 1:N | 一个家庭可以产生多次推荐运行 |
| RecommendationRun—Recipe | M:N | 通过 RecommendationCandidateItem 保存候选菜单中的推荐结果；历史旧 Run 可通过 RecommendationItem 兼容 |
| MenuItem—MenuFeedback | 1:N | 一个菜单项可以接受多个成员的反馈，同一成员最多一条 |
| User—Family(owner) | 1:N/角色约束 | Family 保存 owner_user_id，FamilyMember 保存 owner 角色；admin/member 权限保存在 FamilyMember.role |

### 2.3 E-R 模型说明

FamilyMember、RecipeIngredient、MenuItem、RecommendationCandidateItem、MemberCategoryPreference、MemberIngredientRestriction 和 MenuFeedback 都是具有独立关系属性的关联实体。例如，RecipeIngredient 除了连接 Recipe 和 Ingredient，还保存 `amount_grams` 和 `note`；MenuItem 除了连接 Menu 和 Recipe，还保存来源和菜单备注；RecommendationCandidateItem 还保存候选槽位、菜谱得分和原因。旧 RecommendationItem 作为历史兼容关系保留。

历史菜单采用动态引用方式：MenuItem 保存 recipe_id，菜谱后续修改后，历史菜单读取菜谱的最新内容。菜谱软删除后，历史 MenuItem 仍保留，但已删除菜谱不能重新加入新菜单，也不能进入新的推荐。

`【图2-1 系统总体 E-R 图，此处后补：标注实体、主键、外键以及 1:1、1:N、M:N 基数】`

## 三、逻辑结构设计

### 3.1 数据库总体说明

数据库采用 MySQL 8.0+ 的 InnoDB 存储引擎和 utf8mb4 字符集，共设计 19 张表，分别承担身份、家庭、成员、基础食材、菜谱、标签、菜单、推荐和反馈等数据的存储任务。以下表结构以 `database/01_schema.sql` 为准。新建数据库直接使用完整 Schema；既有数据库按 `04_recommendation_refactor_r1.sql`、`05_recommendation_run_nullable_legacy.sql`、`06_recipe_tag_metadata_backfill.sql`、`07_remove_cuisine_tags.sql`、`08_tag_system_v1.sql`、`09_family-admin-role.sql`、`10_family-invite-code.sql` 的顺序升级。

符号说明：PK 为主键，FK 为外键，UQ 为唯一约束，CK 为检查约束，NN 为非空，DF 为默认值，AI 为自增。

### 3.2 用户、家庭与成员关系

#### 3.2.1 users

| 字段 | 类型 | 约束和默认值 | 说明 |
| --- | --- | --- | --- |
| id | BIGINT UNSIGNED | PK, AI | 用户标识 |
| openid | VARCHAR(64) | NN, UQ | 微信用户标识 |
| display_name | VARCHAR(40) | NN, DF `微信用户` | 展示名称 |
| avatar_url | VARCHAR(500) | NN, DF 空串 | 头像地址 |
| created_at | DATETIME | NN, DF CURRENT_TIMESTAMP | 创建时间 |
| updated_at | DATETIME | NN, DF CURRENT_TIMESTAMP, ON UPDATE | 更新时间 |

#### 3.2.2 families

| 字段 | 类型 | 约束和默认值 | 说明 |
| --- | --- | --- | --- |
| id | BIGINT UNSIGNED | PK, AI | 家庭标识 |
| name | VARCHAR(40) | NN | 家庭名称 |
| invite_code | CHAR(6) | NN, UQ, ASCII `ascii_bin` | 区分大小写的邀请码 |
| owner_user_id | BIGINT UNSIGNED | NN, FK→users.id | 所有者用户 |
| created_at/updated_at | DATETIME | NN，时间默认值和更新值 | 时间信息 |

#### 3.2.3 family_members

| 字段 | 类型 | 约束和默认值 | 说明 |
| --- | --- | --- | --- |
| id | BIGINT UNSIGNED | PK, AI | 成员关系标识 |
| family_id | BIGINT UNSIGNED | NN, FK→families.id, ON DELETE CASCADE | 所属家庭 |
| user_id | BIGINT UNSIGNED | NN, FK→users.id, ON DELETE CASCADE | 对应用户 |
| role | ENUM('owner','admin','member') | NN, DF `member` | 家庭角色 |
| nickname | VARCHAR(40) | NN | 家庭内昵称 |
| status | ENUM('active','left') | NN, DF `active` | 成员状态 |
| joined_at | DATETIME | NN, DF CURRENT_TIMESTAMP | 加入时间 |

约束为 `UNIQUE(family_id,user_id)`，并建立 `idx_member_user_status(user_id,status)`。有效成员关系的单一性、所有者不能直接离开、管理员权限和创建者移交等规则由应用层保证。邀请码由服务端生成 6 位数字/大小写字母组合，管理员刷新时在事务中替换家庭当前邀请码，旧值立即失效。

### 3.3 基础食材与季节

#### 3.3.1 ingredients

| 字段 | 类型 | 约束和默认值 | 说明 |
| --- | --- | --- | --- |
| id | BIGINT UNSIGNED | PK, AI | 食材标识 |
| name | VARCHAR(60) | NN, UQ | 食材名称 |
| calories | DECIMAL(8,2) | NN, DF 0, CK >=0 | 热量参考值 |
| protein | DECIMAL(8,2) | NN, DF 0, CK >=0 | 蛋白质参考值 |
| fat | DECIMAL(8,2) | NN, DF 0, CK >=0 | 脂肪参考值 |
| carbohydrate | DECIMAL(8,2) | NN, DF 0, CK >=0 | 碳水化合物参考值 |
| created_at | DATETIME | NN, DF CURRENT_TIMESTAMP | 创建时间 |

#### 3.3.2 ingredient_seasons

| 字段 | 类型 | 约束和默认值 | 说明 |
| --- | --- | --- | --- |
| ingredient_id | BIGINT UNSIGNED | PK 部分字段, FK→ingredients.id, CASCADE | 食材 |
| month | TINYINT UNSIGNED | PK 部分字段, CK 1～12 | 月份 |

主键为 `(ingredient_id,month)`，用于防止同一食材同一月份重复记录。

### 3.4 菜谱及食材明细

#### 3.4.1 recipes

| 字段 | 类型 | 约束和默认值 | 说明 |
| --- | --- | --- | --- |
| id | BIGINT UNSIGNED | PK, AI | 菜谱标识 |
| family_id | BIGINT UNSIGNED | NN, FK→families.id, CASCADE | 所属家庭 |
| created_by_member_id | BIGINT UNSIGNED | NN, FK→family_members.id, RESTRICT | 创建成员 |
| title | VARCHAR(80) | NN | 菜名 |
| category | ENUM('荤菜','素菜','汤','主食') | NN | 菜谱分类 |
| description | TEXT | NN | 菜谱描述 |
| steps | TEXT | NN | 制作步骤 |
| cook_minutes | SMALLINT UNSIGNED | NN, CK 1～360 | 烹饪时间 |
| difficulty | TINYINT UNSIGNED | NN, CK 1～5 | 难度 |
| servings | TINYINT UNSIGNED | NN, DF 2, CK 1～12 | 份数 |
| cover_url | VARCHAR(500) | NN, DF 空串 | 封面相对路径 |
| status | ENUM('active','deleted') | NN, DF `active` | 菜谱状态 |
| created_at/updated_at | DATETIME | NN，时间默认值和更新值 | 时间信息 |

索引为 `idx_recipe_family_category(family_id,category,status)`。Recipe 的封面路径格式由应用层校验，数据库字段负责保存合法的相对路径字符串。

#### 3.4.2 recipe_ingredients

| 字段 | 类型 | 约束和默认值 | 说明 |
| --- | --- | --- | --- |
| recipe_id | BIGINT UNSIGNED | 复合 PK, FK→recipes.id, CASCADE | 菜谱 |
| ingredient_id | BIGINT UNSIGNED | 复合 PK, FK→ingredients.id, RESTRICT | 食材 |
| amount_grams | DECIMAL(8,2) | NN, CK >0 | 用量 |
| note | VARCHAR(80) | NN, DF 空串 | 食材备注 |

### 3.5 成员偏好与饮食限制

#### 3.5.1 member_category_preferences

字段为 `member_id`、`category`、`preference_score`。主键为 `(member_id,category)`，member_id 外键引用 family_members 并在删除成员关系时级联删除；preference_score 非空、默认值为 3，检查范围为 1～5。category 与 Recipe 的分类枚举保持一致。

#### 3.5.2 member_ingredient_restrictions

字段为 `member_id`、`ingredient_id`、`reason`。主键为 `(member_id,ingredient_id)`；member_id 外键引用 family_members 并级联删除，ingredient_id 外键引用 ingredients 并级联删除；reason 非空，默认值为 `忌口`。该表表达成员与食材之间的多对多限制关系。

### 3.6 推荐运行与推荐结果

#### 3.6.1 recommendation_runs

| 字段 | 类型 | 约束和默认值 | 说明 |
| --- | --- | --- | --- |
| id | BIGINT UNSIGNED | PK, AI | 推荐运行标识 |
| family_id | BIGINT UNSIGNED | NN, FK→families.id, CASCADE | 所属家庭 |
| created_by_member_id | BIGINT UNSIGNED | NN, FK→family_members.id, RESTRICT | 生成成员 |
| menu_date | DATE | NN | 目标日期 |
| meal_type | ENUM('breakfast','lunch','dinner') | NN | 餐次 |
| people_count | TINYINT UNSIGNED | NN, CK 1～12 | 用餐人数 |
| max_cook_minutes | SMALLINT UNSIGNED | 可空；兼容旧推荐请求 | 旧版最大烹饪时间 |
| max_prep_minutes | SMALLINT UNSIGNED | 可空；CK 10～480 | canonical 推荐的期望准备时间 |
| mode | ENUM('balanced','healthy','quick') | 可空；兼容旧推荐请求 | 旧版推荐模式 |
| total_score | DECIMAL(6,2) | 可空 | 旧版汇总得分 |
| total_cook_minutes | SMALLINT UNSIGNED | 可空 | 旧版总烹饪时间 |
| score_breakdown | JSON | 可空 | 旧版得分分解或兼容快照 |
| menu_structure | JSON | 可空 | canonical 菜单结构请求快照 |
| session_preferences | JSON | 可空 | canonical 本次会话偏好快照 |
| created_at | DATETIME | NN, DF CURRENT_TIMESTAMP | 创建时间 |

索引为 `idx_recommendation_family_date(family_id,menu_date)`。新推荐的候选结果分别保存在 `recommendation_candidates` 和 `recommendation_candidate_items` 中；候选排名、槽位和关系均由唯一约束保证，旧的 `recommendation_items` 继续用于历史数据兼容。

#### 3.6.2 recommendation_items

字段包括 `id`、`recommendation_run_id`、`recipe_id`、`dish_score` 和 `reason_text`。recommendation_run_id 外键引用 recommendation_runs 并级联删除，recipe_id 外键引用 recipes 并限制删除；`UNIQUE(recommendation_run_id,recipe_id)` 保证同一推荐运行不会重复保存同一道菜。

### 3.7 菜单与菜单项

#### 3.7.1 menus

menus 包含 `id`、`family_id`、`created_by_member_id`、可空的 `recommendation_run_id`、`menu_date`、`meal_type`、`status`、`created_at` 和 `updated_at`。family_id 外键级联删除，created_by_member_id 外键限制删除，recommendation_run_id 外键采用 `ON DELETE SET NULL`。status 为 active 或 completed，默认 active。`UNIQUE(family_id,menu_date,meal_type)` 保证菜单槽位唯一。

#### 3.7.2 menu_items

menu_items 包含 `id`、`menu_id`、`recipe_id`、`source`、`note` 和 `created_at`。menu_id 外键级联删除，recipe_id 外键限制删除；source 为 manual 或 recommendation，默认 manual；note 非空，默认空串。`UNIQUE(menu_id,recipe_id)` 保证同一菜单中同一菜谱不重复。

菜单项删除只删除关联关系，不删除 Menu 或 Recipe；删除最后一个菜单项后，空菜单继续保留。当前版本没有提供整张菜单删除接口和 completed 状态业务流程。

### 3.8 用餐反馈

menu_feedback 包含 `id`、`menu_item_id`、`member_id`、`rating`、`comment` 和 `created_at`。menu_item_id 和 member_id 均为非空外键，删除关系时级联删除；rating 非空，检查范围为 1～5；comment 非空，默认空串，长度为 200；`UNIQUE(menu_item_id,member_id)` 保证同一成员对同一菜单项最多一条反馈。

### 3.9 主键、外键、唯一和检查约束

数据库层的实体完整性由各表主键保证。参照完整性由外键及相应的 CASCADE、RESTRICT 和 SET NULL 策略保证。用户定义完整性主要通过以下约束体现：菜谱分类、成员角色和状态、菜单餐次、推荐模式采用 ENUM；营养值不能为负；月份范围为 1～12；菜谱时间、难度和份数处于规定范围；食材用量必须大于 0；偏好和评分范围为 1～5。

应用层业务完整性与数据库层约束相互补充：当前用户的家庭边界、有效成员、角色权限、已删除菜谱不可新增、推荐应用的再次校验、Menu/Recipe 的跨家庭引用检查，以及跨家庭资源的 404 语义由服务端负责。数据库约束本身不承担跨表家庭一致性判断，因此不能用数据库字段约束代替应用层授权校验。

### 3.10 删除策略与历史数据

用户、家庭和成员关系的部分级联行为由数据库提供，但当前版本不提供家庭删除功能。Ingredient 不提供业务删除，recipe_ingredients 对 Ingredient 使用 RESTRICT，避免破坏仍被使用的菜谱。Recipe 使用软删除；历史 MenuItem 保留并允许展示同家庭已删除菜谱的最新可读取信息。RecommendationRun 保留，不提供删除。MenuItem 与其 Feedback 的关系使用现有外键级联，因此删除 MenuItem 时对应反馈也会按 Schema 行为处理。

### 3.11 索引设计

| 索引或约束 | 主要用途 |
| --- | --- |
| users.openid UQ | 按登录标识查找用户 |
| families.invite_code UQ | 按邀请码加入家庭 |
| family_members(family_id,user_id) UQ | 家庭成员关系去重 |
| family_members(user_id,status) | 查询用户有效成员关系 |
| recipes(family_id,category,status) | 家庭菜谱分类和状态筛选 |
| recommendation_runs(family_id,menu_date) | 查询家庭日期推荐 |
| menus(family_id,menu_date,meal_type) UQ | 菜单槽位唯一和并发防重 |
| menu_items(menu_id,recipe_id) UQ | 菜单项幂等和并发防重 |
| 偏好/限制复合主键 | 成员关系查询和重复防止 |
| menu_feedback(menu_item_id,member_id) UQ | 反馈 UPSERT 和重复防止 |

## 四、开发工具

### 4.1 开发环境与技术工具

| 类别 | 工具或技术 | 版本 | 用途 |
| --- | --- | --- | --- |
| 小程序开发工具 | 微信开发者工具 | 本地安装版本需现场记录 | 小程序编译、调试和运行 |
| 客户端开发 | WXML、WXSS、JavaScript | 随微信开发者工具 | 页面结构、样式和交互逻辑 |
| 服务端运行环境 | Node.js | 24.14.0（README 记录） | 运行 Express 服务 |
| Web 服务框架 | Express | 5.x（以 package.json 为准） | REST API 和中间件 |
| 数据库 | MySQL | 8.0.45（README 记录） | 关系数据存储、约束和事务 |
| 数据库连接 | mysql2/promise | 3.24.3 | 连接池、参数化 SQL 和事务 |
| 身份认证 | jsonwebtoken | 9.0.3 | 登录状态令牌签发与校验 |
| 配置管理 | dotenv | 16.6.1 | 读取环境变量 |

### 4.2 数据库初始化

数据库初始化脚本位于 `database/` 目录，建议按以下顺序执行：

1. `00_create_user.sql`：创建数据库和应用连接用户并进行授权。
2. `01_schema.sql`：创建 19 张表、约束和索引；其中已包含标签、canonical Recommendation、Candidate 和 CandidateItem 结构，并启用 admin 角色与区分大小写的邀请码。
3. `02_seed.sql`：插入演示家庭、食材、菜谱和菜谱食材关系。
4. `03_queries.sql`：提供分类统计和热门菜谱查询示例。
5. 已有旧数据库如需升级，按 `04_recommendation_refactor_r1.sql`、`05_recommendation_run_nullable_legacy.sql`、`06_recipe_tag_metadata_backfill.sql`、`07_remove_cuisine_tags.sql` 顺序执行；其中 06 仅 insert-only 补齐现有 Recipe 的口味、饮食和烹饪方法标签，07 清理已废弃的菜系标签并收窄标签类型，新数据库不重复执行这些增量脚本。

项目使用 InnoDB 和 utf8mb4，以支持事务和中文业务数据。密码等敏感配置不写入本文，运行时应通过环境变量提供。

## 五、具体实现

### 5.1 系统运行结构

小程序端通过 REST API 发送请求，服务端入口加载运行配置、数据库连接池、身份认证中间件、业务路由和静态上传目录。受保护请求先校验 JWT，再读取当前用户和有效家庭成员关系；路由和服务层完成请求参数、权限、家庭边界及业务规则校验；数据库层使用参数化 SQL、事务和约束完成持久化；操作结果重新返回小程序并展示。

`【图5-1 系统总体架构图，此处后补】`

### 5.2 用户登录与家庭操作

用户登录后，系统根据令牌中的用户标识查询 users 和当前有效的 family_members。没有有效成员关系时，系统返回空的当前家庭状态，允许用户继续创建家庭或加入家庭。创建家庭时，在事务中写入 families 和 owner 成员关系；加入家庭时，根据邀请码定位家庭并检查当前用户是否已经属于有效家庭。小程序的全局认证闸门保证未登录用户只能看到登录页；用户名和头像通过 User 资料接口更新，并在设置、账号管理和家庭成员页面共用。

家庭管理按 owner、admin、member 分权。Owner/Admin 可以修改家庭名称、刷新邀请码和管理成员；普通成员可以读取、复制邀请码。Owner 可以将创建者身份原子地移交给同家庭 active 成员，移交后原 Owner 变为 member；邀请码刷新使用事务和唯一约束，旧邀请码立即失效。

系统不会从多条有效成员关系中随机选择家庭。如果数据库中出现同一用户多条有效成员关系，系统将其视为数据冲突并返回通用服务端错误，不向用户暴露其他家庭的详细信息。

### 5.3 菜谱创建、编辑与删除

用户在菜谱表单中填写名称、分类、描述、步骤、时间、难度、份数和食材明细，可选择上传封面。服务端确认当前家庭和有效成员后，校验所有食材真实存在、食材 ID 不重复、用量大于零，并在同一事务中写入 Recipe 和 RecipeIngredient。创建或编辑过程中任一步失败，事务回滚，保留操作前数据库状态。

删除菜谱时只将 status 改为 deleted。列表和新的推荐只读取 active 菜谱；历史菜单仍可保留对已删除菜谱的引用。封面文件保存在服务端上传目录，数据库只保存 `/uploads/recipes/<filename>` 形式的相对路径。

`【图5-2 菜谱列表和详情界面截图，此处后补】`

`【图5-3 菜谱创建/编辑、食材和封面界面截图，此处后补】`

**代码5-1 Recipe 事务写入核心代码**

以下片段均来自 `server/src/routes/recipes.js`；代码块中省略了同一文件中与事务演示无关的路由定义和参数校验。

```js
const created = await withTransaction(database, async (connection) => {
  await validateIngredientsExist(connection, request.body.ingredients)
  const [inserted] = await connection.execute(`INSERT INTO recipes (family_id, created_by_member_id, title, category, description, steps, cook_minutes, difficulty, servings, cover_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [request.membership.family_id, request.membership.member_id, String(request.body.title).trim(), request.body.category, request.body.description || '', request.body.steps || '', Number(request.body.cookMinutes), Number(request.body.difficulty), Number(request.body.servings || 2), request.body.coverUrl || ''])
  await saveIngredients(connection, inserted.insertId, request.body.ingredients)
  return inserted
})

// ...省略同一文件中的其他路由代码...

async function withTransaction(database, work) {
  const connection = await database.getConnection()
  let started = false
  try {
    await connection.beginTransaction()
    started = true
    const result = await work(connection)
    await connection.commit()
    return result
  } catch (error) {
    if (started) await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}
```

该代码来自 `server/src/routes/recipes.js` 第 31～35、110～124 行。事务内先校验食材，再写入 recipes 主记录和 recipe_ingredients 关联记录；所有操作使用同一个 connection，全部成功后提交，异常时回滚并释放连接。涉及的数据库表为 `recipes`、`ingredients` 和 `recipe_ingredients`，体现了事务原子性、参照完整性和复合写入的一致性。

### 5.4 菜单创建与菜单项操作

用户选择日期和餐次后添加菜谱。系统首先确认菜谱存在、属于当前家庭且状态为 active，然后按家庭、日期和餐次查询或创建 Menu，再写入 MenuItem。数据库的菜单槽位唯一约束保证同一家庭同一日期同一餐次只有一个 Menu；菜单项唯一约束保证同一菜谱不会重复加入同一菜单。

首次加入成功后返回创建结果；重复加入时读取已有 MenuItem，返回已存在结果，并保留原有 note 和 source。并发请求发生唯一键冲突时，服务端重新读取已有记录，将数据库冲突转换为稳定的业务结果。删除菜单项只删除 MenuItem，菜单和菜谱均继续保留。

`【图5-4 菜单日期、餐次和菜单项操作界面截图，此处后补】`

**代码5-2 MenuItem 幂等添加核心代码**

```js
async function getOrCreateMenu(connection, familyId, memberId, menuDate, mealType) {
  try {
    return (await connection.execute(
      `INSERT INTO menus (family_id, created_by_member_id, menu_date, meal_type)
       VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
      [familyId, memberId, menuDate, mealType]
    ))[0]
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error
    const existing = await getExistingMenu(connection, familyId, menuDate, mealType)
    if (!existing) throw error
    return { insertId: existing.id }
  }
}

async function addMenuItemRecord({ connection, menuId, recipeId, note = '', source = 'manual' }) {
  const existing = await getExistingMenuItem(connection, menuId, recipeId)
  if (existing) return { menuId, itemId: existing.id, status: 'already-present', note: existing.note }
  try {
    const [created] = await connection.execute(
      'INSERT INTO menu_items (menu_id, recipe_id, source, note) VALUES (?, ?, ?, ?)',
      [menuId, recipeId, source, note]
    )
    return { menuId, itemId: created.insertId, status: 'created', note }
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error
    const existingAfterConflict = await getExistingMenuItem(connection, menuId, recipeId)
    if (!existingAfterConflict) throw error
    return { menuId, itemId: existingAfterConflict.id, status: 'already-present', note: existingAfterConflict.note }
  }
}
```

该代码来自 `server/src/services/menu-item-service.js` 第 31～43、54～69 行。系统利用 menus 的家庭、日期、餐次唯一约束和 menu_items 的 `(menu_id, recipe_id)` 唯一约束完成重复防止；重复关系或并发唯一键冲突会重新读取已有记录，返回 `already-present`，并保留原 note。涉及的数据库表为 `menus` 和 `menu_items`，体现了 UNIQUE、幂等性、并发冲突处理和关系数据保护。

### 5.5 饮食限制与口味偏好

用户在成员管理页面选择有效成员和食材，可以添加或删除饮食限制。服务端不信任客户端传入的家庭归属，先检查成员是否属于当前家庭且状态为 active，再检查食材是否真实存在。Owner 可以维护当前家庭其他有效成员，普通成员只能维护自己。

口味偏好以分类为选择项，界面使用“不喜欢、一般、喜欢”等易理解的语义，服务端保存与数据库约束一致的 1～5 分。保存采用 UPSERT，重复保存同一分类不会创建重复关系。未设置偏好的成员在推荐计算中按 3 分参与平均；已离开成员和其他家庭成员不参与计算。

### 5.6 菜谱推荐处理

用户提交推荐日期、餐次、用餐人数、期望准备时间、菜单结构和可选的本次会话偏好。服务端首先确定当前家庭，读取当前家庭 active Member 的 Restriction、Preference、Recipe、食材营养、受控标签、季节信息和近期使用记录。命中任意有效成员限制的菜谱直接排除；结构中某一类别容量不足时返回不可生成结果；其余候选再进入组合评分。

当前 canonical 推荐采用可解释的组合评分，不使用人工智能或机器学习。时间是 preferred preparation target，不是绝对硬上限；系统用最长烹饪时间加其余菜品时间的一半估算准备时间，优先排序 within-time 候选，必要时保留超时但可应用的候选。综合得分由六个因素组成：会话与家庭偏好 30、食材多样性 15、烹饪方法多样性 10、营养平衡 15、季节匹配 10、近期新颖度 20。家庭分类偏好由 active Member 平均得到，未设置项按中性值 3 参与，left Member 和其他家庭不参与。

准备时间估算公式为：`estimatedPrepMinutes = max(cook_minutes) + ceil((sum(cook_minutes) - max(cook_minutes)) × 0.5)`。该公式是对多道菜并行准备的可解释近似，准备时间不进入上述 weighted total，而用于时间内候选优先级和超时提示。营养中的 high-protein V1 是基于当前菜谱数据分布的相对阈值，代码阈值约为 61.32g，不代表医学或国家营养标准；缺少季节元数据时季节得分保持中性，不虚构当季理由。

推荐最多持久化三个 Candidate。每个 Candidate 保存排序、准备时间、总分、分项得分和理由；每个 CandidateItem 保存槽位、Recipe、菜品得分和理由。Recipe 标题、分类和封面遵循系统的 Dynamic Reference 规则，但 Apply 时会重新校验 Family、active 状态、当前限制和菜单结构。

`【图5-5 菜谱推荐处理流程图，此处后补】`

**代码5-3 Recommendation 核心评分代码**

```js
function weightedScore(parts) {
  return Math.round((parts.preference * MENU_SCORE_WEIGHTS.preference +
    parts.ingredientDiversity * MENU_SCORE_WEIGHTS.ingredientDiversity +
    parts.methodDiversity * MENU_SCORE_WEIGHTS.methodDiversity +
    parts.nutrition * MENU_SCORE_WEIGHTS.nutrition +
    parts.seasonal * MENU_SCORE_WEIGHTS.seasonal +
    parts.novelty * MENU_SCORE_WEIGHTS.novelty) / 100)
}

function evaluateMenuCandidate(recipes, context) {
  const preferences = context.preferences || {}
  const sessionPreference = scoreMenuPreferenceMatch(recipes, preferences)
  const familyPreference = scoreFamilyCategoryPreference(recipes, context.familyCategoryPreferenceScores || {})
  const nutrition = nutritionBalanceScore(recipes)
  const seasonal = preferences.seasonal ? averageSeasonalFit(recipes, context.targetMonth) : 50
  const parts = {
    preference: Math.round(sessionPreference.score * 0.8 + familyPreference.score * 0.2),
    ingredientDiversity: ingredientDiversityScore(recipes, context.commonIngredientIds),
    methodDiversity: methodDiversityScore(recipes),
    nutrition: nutrition.score,
    seasonal,
    novelty: calculateRecentNoveltyScore(recipes, context.recentUsage || {})
  }
  const time = getTimeMetadata(recipes, context.maxPrepMinutes)
  const reasonParts = ['满足指定菜单结构']
  if (parts.preference > 50) reasonParts.push('符合家庭与本次口味偏好')
  if (parts.seasonal > 50) reasonParts.push('季节匹配较好')
  if (parts.novelty === 100) reasonParts.push('近期菜谱重复较少')
  if (time.withinTimeLimit) reasonParts.push(`预计准备约 ${time.estimatedPrepMinutes} 分钟`)
  else reasonParts.push(time.timeWarning)
  // ...省略真实源码中 recipeScores 和返回对象的字段...
}
```

该代码来自 `server/src/services/recommendation/menu-evaluator.js` 的 `weightedScore` 和 `evaluateMenuCandidate`；候选集在 `server/src/services/recommendation/menu-recommendation-engine.js` 中先经过 `filterEligibleRecipes` 的 Restriction 与结构容量校验。代码使用 `MENU_SCORE_WEIGHTS` 对偏好、食材多样性、方法多样性、营养、季节和新颖度进行加权，并把 `maxPrepMinutes` 传给准备时间估算。涉及的业务数据来自 `recipes`、`recipe_ingredients`、`ingredients`、`recipe_tags`、`ingredient_seasons`、`family_members`、`member_ingredient_restrictions`、`member_category_preferences` 和近期菜单关系，体现了数据加工、规则评分、硬过滤和候选排序。

### 5.7 推荐结果应用到菜单

用户在推荐结果页面选择一个持久化 Candidate 应用。服务端在事务中再次验证 `runId + candidateId` 所属家庭、生成成员状态、Candidate Item 对应菜谱的家庭归属和 active 状态、当前 Restriction 以及菜谱分类是否仍符合生成时的结构。若任一菜谱已经失效或结构不再满足，整个操作回滚，不产生部分 MenuItem。验证通过后，系统复用对应日期和餐次的 Menu，并以 recommendation 来源加入菜谱；重复应用不会重复创建 MenuItem，也不会覆盖已有备注。历史旧 Run 仍可通过无请求体的兼容路径 Apply。

### 5.8 Feedback 与 Insights

用户在菜单项上选择 1～5 分并可填写短评。服务端以当前有效成员作为 feedback owner，不允许客户端自由指定成员。写入采用 UPSERT，重复评分更新原反馈；删除操作只删除当前成员的反馈关系，不改变 MenuItem、Menu 或 Recipe。

Insights 从当前家庭范围内读取真实数据，并支持 `days=7` 或 `days=30` 两个菜单日期范围，未传参数默认近 7 天。菜单数量通过菜单表统计，菜单项数量通过菜单项表统计，热门菜谱通过 Recipe、MenuItem 与 Menu 的连接和分组统计得到，平均评分通过 MenuFeedback 的 AVG 得到。查询使用家庭边界和菜单日期范围，不把未来菜单纳入统计。

**代码5-4 Insights 聚合查询核心代码**

```sql
SELECT r.id, r.title, r.category, COUNT(m.id) AS usedCount FROM recipes r LEFT JOIN menu_items mi ON mi.recipe_id = r.id LEFT JOIN menus m ON m.id = mi.menu_id AND m.family_id = ? AND m.menu_date BETWEEN DATE_SUB(CURDATE(), INTERVAL 6 DAY) AND CURDATE() WHERE r.family_id = ? AND r.status = 'active' GROUP BY r.id HAVING COUNT(m.id) > 0 ORDER BY usedCount DESC, r.title LIMIT 10

SELECT COUNT(DISTINCT m.id) AS menuCount, COUNT(mi.id) AS itemCount, COALESCE(AVG(f.rating), 0) AS averageRating FROM menus m LEFT JOIN menu_items mi ON mi.menu_id = m.id LEFT JOIN menu_feedback f ON f.menu_item_id = mi.id WHERE m.family_id = ? AND m.menu_date BETWEEN DATE_SUB(CURDATE(), INTERVAL 6 DAY) AND CURDATE()
```

以上 SQL 来自 `server/src/routes/menus.js` 的 `/insights` 路由，示例为近 7 天；近 30 天将 6 替换为 29。第一条查询通过 Recipe、MenuItem 和 Menu 的 LEFT JOIN 统计日期范围内的菜谱使用次数；第二条查询通过 Menu、MenuItem 和 MenuFeedback 的 LEFT JOIN 统计日期范围内的菜单数量、菜单项数量和平均评分。涉及的数据库表为 `recipes`、`menus`、`menu_items` 和 `menu_feedback`，体现了 JOIN、LEFT JOIN、COUNT、AVG、GROUP BY、HAVING、COALESCE 和 ORDER BY 等数据库查询知识点。

`【图5-6 Feedback 与 Insights 界面截图，此处后补】`

### 5.9 数据库查询示例

`database/03_queries.sql` 中包含以下查询：

1. 对 active 菜谱按 category 分组，统计每类菜谱数量和平均烹饪时间。
2. 对菜谱和菜单项进行 LEFT JOIN，统计每道菜被加入菜单的次数，并按使用次数排序。

这两类查询分别体现了 GROUP BY、COUNT、AVG、LEFT JOIN 和 ORDER BY。应用中的 Recommendation 和 Insights 在此基础上增加家庭边界、有效状态、反馈平均值和推荐结果写入等业务条件。

### 5.10 测试与验证

当前已执行的直接测试和静态检查结果如下：

| 测试项目 | 预期结果 | 实际结果 | 是否通过 |
| --- | --- | --- | --- |
| Backend direct tests | 所有直接测试通过 | 196 passed，0 failed | 通过 |
| Backend Real MySQL integration | 独立测试库约束、事务、并发和家庭隔离 | 46 passed，0 failed，使用 `mealpilot_test` | 通过 |
| Frontend tests | 页面契约和纯函数检查 | 147 passed，0 failed | 通过 |
| JavaScript syntax check | JavaScript 语法检查通过 | passed | 通过 |
| git diff --check | 不存在空白错误 | passed | 通过 |

## 六、总结

### 6.1 系统完成情况

本系统完成了家庭膳食管理和菜谱推荐的主要功能。系统以 FamilyMember 表表达用户与家庭的关系，以 RecipeIngredient、MenuItem、RecommendationCandidateItem 等关联实体表达多对多联系，以主键、外键、复合主键、唯一约束和检查约束维护数据库完整性。服务端通过事务、家庭边界校验、角色权限和并发幂等处理保证业务数据的一致性，小程序端提供了全局登录、账号资料、家庭管理、菜谱、菜单、推荐、忌口、偏好、标签、反馈和洞察入口。

### 6.2 系统特点与优点

1. **关系模型清晰**：实体与关联实体划分明确，能够直接转换为 E-R 图和关系模式。
2. **数据完整性较为完善**：数据库层约束与应用层业务校验相互补充，覆盖了实体、参照和用户定义完整性。
3. **推荐结果具有可解释性**：Restriction 负责硬过滤，Preference 负责软排序，评分由季节、营养、时间和模式等明确因素组成。
4. **事务和并发处理具有课程展示价值**：菜谱复合写入、推荐应用和菜单重复添加分别体现事务回滚、原子性和唯一约束的使用。
5. **数据处理不局限于增删改查**：Insights 使用多表连接和聚合函数输出家庭菜单与反馈统计。

### 6.3 系统不足与改进方向

当前版本仍有以下可以改进的方向：

1. 账号体系仍以当前微信登录和开发环境登录为主，刷新令牌、主动注销和多设备会话管理尚未展开。
2. 当前用户同一时刻只能有一个有效家庭关系，家庭切换和家庭删除尚未实现；Owner 转移和 Owner 离开约束已经实现。
3. 菜单 completed 状态尚未形成完整业务流程。
4. 推荐暂不使用用户长期行为进行学习，也未引入协同过滤、人工智能或复杂模型。
5. 封面文件采用服务端本地保存方式，云存储、生产环境部署、定期清理孤儿文件和监控备份仍可作为后续工程改进方向。

这些方向不影响当前系统的核心数据库课程设计目标，但在扩大使用范围时需要进一步进行需求分析和安全设计。

<!--
INTERNAL TODO:
- 补充正式封面信息：姓名、学号、班级、指导教师、提交日期。
- 绘制并插入图1-1 系统功能模块图。
- 绘制并插入图2-1 系统总体 E-R 图。
- 绘制并插入图5-1 系统总体架构图。
- 绘制并插入图5-5 菜谱推荐处理流程图。
- 补充菜谱、菜单、限制、偏好、推荐、Feedback 和 Insights 界面截图。
- 在提交前再次核对代码5-1 至代码5-4 的源码行号和版本。
- 确认微信开发者工具版本、现场数据库授权和小程序 API 地址。
-->
