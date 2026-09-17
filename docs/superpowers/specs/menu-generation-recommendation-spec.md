# Recommendation Refactor Phase R0：当前系统审计与新推荐契约冻结

状态：R0 只读审计与规格冻结完成；本文件不代表 R1 已开始实施。

审计范围：当前 Backend、Frontend、Schema、Seed、现有测试和运行脚本。R0 不修改业务代码、Frontend、Schema、Seed、测试、README 或运行配置。

## 1. Current System Audit

### 1.1 当前真实生成链路

当前推荐入口是 `POST /api/recommendations`，实现位于 `server/src/routes/menus.js`。请求经过以下步骤：

1. 从当前 authenticated user 的 active membership 取得唯一 `family_id`。
2. 查询当前 Family 的 `active` Recipe，并通过 `recipe_ingredients` 聚合 Ingredient ID。
3. 查询当前 Family 所有 active Member 的 restriction union。
4. 查询当前 Family 所有 active Member 的 category preference，并由 `aggregateFamilyPreferences` 按 active member 平均值聚合，未设置值按 3 处理。
5. 通过 `buildRecommendation` 先排除命中 restriction 的 Recipe，再计算菜品得分。
6. 按 `peopleCount` 映射为固定类别结构，递归搜索一个不重复 Recipe 的最佳完整菜单。
7. 将一个结果作为一个 `recommendation_run` 持久化，并将每道菜写入 `recommendation_items`。
8. `POST /api/recommendations/:id/apply` 重新校验 Run、Recipe 和 Family 边界，然后在同一事务中写入 Menu/MenuItem。

因此，当前实现不是简单的“按分数取 Top-N Recipe”。它已经实现了“固定类别需求下的单个最优菜单组合搜索”，但仍然只有一个结果集，没有候选会话、换一组、候选级 Apply 或结构化 session preference。

### 1.2 当前真实评分模型

来源：`server/src/services/recommendation-service.js`。

当前 mode 权重为：

| mode | preference | nutrition | season | time |
| --- | ---: | ---: | ---: | ---: |
| `balanced` | 30 | 30 | 20 | 20 |
| `healthy` | 25 | 40 | 20 | 15 |
| `quick` | 30 | 15 | 20 | 35 |

当前因子：

- preference：`70 + (familyPreferenceScore - 3) * 8`；没有家庭偏好时按中性值 3，基准为 70。
- nutrition：`min(100, protein * 2 + vegetables * 20 + 35)`。
- season：当 `seasonalMonths` 包含目标月份时为 100，否则为 35。
- time：`max(0, 100 - round(cookMinutes / maxCookMinutes * 100) - (difficulty - 1) * 8)`。
- 总分：`round((season * seasonWeight + preference * preferenceWeight + nutrition * nutritionWeight + time * timeWeight) / 100)`。
- 菜品理由：季节说明、家庭类别偏好说明、烹饪时间说明。

当前 route 将每道候选 Recipe 映射为 `seasonalMonths: [目标月份]`，因此 route 路径下所有候选都会被判定为当季；同时 nutrition 使用固定代理值 `protein: 10`，以及按类别设置的 `vegetables` 值，并未从 `recipe_ingredients.amount_grams` 和 Ingredient 营养数据计算。这是当前真实实现限制，不应在报告或新契约中描述为已完成的真实季节/营养分析。

### 1.3 当前菜单组合与时间语义

- `peopleCount <= 2`：`荤菜 + 素菜 + 汤`。
- `peopleCount <= 4`：`荤菜 + 素菜 + 素菜 + 汤`。
- `peopleCount > 4`：`荤菜 + 荤菜 + 素菜 + 素菜 + 汤`。
- 同一组合内不允许重复 Recipe。
- 当前 `totalCookMinutes` 是所选 Recipe `cook_minutes` 的简单求和。
- 如果存在满足总和上限的组合，优先选择满足上限且分数最高的组合；如果没有满足上限的组合，仍返回最佳可用组合并附带超时警告。

这与新系统的“估算准备时间作为用户目标，并在必要时优雅超时回退”不同。新契约必须使用单独的 `maxPrepMinutes` 语义，不能静默把现有 `maxCookMinutes` 改名后假装语义相同。

### 1.4 当前 Frontend 行为

`miniprogram/pages/recommend/index.js` 当前发送：

```json
{
  "menuDate": "YYYY-MM-DD",
  "mealType": "dinner",
  "peopleCount": 2,
  "maxCookMinutes": 60,
  "mode": "balanced"
}
```

Frontend 展示单个 `recommendation.items` 数组、总烹饪时间、总分、理由和每道菜的 `item.score.reason`，并以 `runId` 对整批结果执行 Apply。当前不存在 candidate 切换或 candidateId。

Restriction 与 Preference 的摘要来自真实 API；页面不再维护一套声称会影响推荐、但只存在于 Page.data 的本地 restriction/preference 业务状态。

### 1.5 当前持久化行为

当前 `recommendation_runs` 保存一次生成结果的 Family、创建 Member、日期、餐次、人数、最大烹饪时间、mode、总分、总烹饪时间和 JSON score breakdown；`recommendation_items` 保存每个 Recipe 的 `dish_score` 和 `reason_text`。

当前持久化能力能够回答“这次生成的唯一菜单包含什么”，不能回答：

- 一次 session 有哪些候选组；
- 候选组之间如何换组；
- 某个候选组的结构槽位是什么；
- 用户 Apply 的是哪个 candidate；
- session 当时提交的 taste/dietary preference 是什么。

## 2. Current API Contract

### 2.1 生成请求

当前真实路径：`POST /api/recommendations`。

| 字段 | 当前状态 | 当前语义 |
| --- | --- | --- |
| `menuDate` | 可选，默认今天 | 目标菜单日期，必须是 date-only |
| `mealType` | 可选，默认 `dinner` | `breakfast` / `lunch` / `dinner` |
| `peopleCount` | 可选，默认 2 | 1–12 |
| `maxCookMinutes` | 可选，默认 90 | 10–480；当前用于总 `cook_minutes` 组合比较 |
| `mode` | 可选，默认 `balanced` | `balanced` / `healthy` / `quick` |
| `structure` | 不支持 | 当前无精确菜品结构输入 |
| `preferences` | 不支持 | 当前不接受 session 级 taste/dietary 输入 |
| `candidateId` / `candidateCount` | 不支持 | 当前一次只生成一个结果 |

当前 route 不信任客户端提供 Family、Member、Recipe 列表或 restriction。Family 与 active Member 来自认证上下文，候选 Recipe 与 preference/restriction 来自数据库。

### 2.2 生成响应

当前成功响应为 `200`，`data` 直接包含：

```json
{
  "ok": true,
  "data": {
    "runId": 1,
    "items": [
      {
        "id": 12,
        "title": "示例菜谱",
        "category": "荤菜",
        "cookMinutes": 20,
        "score": {
          "total": 82,
          "parts": {
            "season": 100,
            "preference": 78,
            "nutrition": 75,
            "time": 72
          },
          "reason": "主要食材当季；家庭更偏好荤菜；烹饪约 20 分钟"
        }
      }
    ],
    "totalCookMinutes": 42,
    "totalScore": 80,
    "withinTimeLimit": true,
    "timeOverageMinutes": 0,
    "timeWarning": "",
    "reason": "已优先选择符合设定时间的菜单。",
    "scoreBreakdown": {
      "season": 100,
      "preference": 78,
      "nutrition": 75,
      "time": 72
    }
  }
}
```

字段名以当前真实 route 和 Frontend 使用为准。新系统不能继续把 `items` 误解为多个候选组；新契约应改用明确的 `candidates`。

### 2.3 Apply 请求

当前真实路径：`POST /api/recommendations/:id/apply`，无请求体。它应用整个 `recommendation_run` 的全部 `recommendation_items`。

当前行为：

- Run 必须属于当前 Family；跨 Family 对外 404。
- 当前 active Member 必须存在。
- 保持现有“创建者 Member 必须仍然 active 且为当前操作 Member”的约束。
- Run 中 Recipe 必须仍然属于同一 Family 且为 active。
- 任一 Recipe 失效时整体 409，并回滚，不产生部分 MenuItem。
- 已存在 MenuItem 不重复插入，保留原 note/source。

### 2.4 当前错误语义

继续保留 Phase 1 冻结的边界：未认证 401、无 active Family 403、跨 Family 404、业务冲突 409、无可生成结果 422、内部错误 500。新候选系统不得通过 candidateId 或 Recipe ID 泄露其他 Family 的存在性。

## 3. Current Schema Capability

### 3.1 关键关系

| 表 | 当前能力 | 对新推荐需求的结论 |
| --- | --- | --- |
| `recipes` | Family、作者、category、cook_minutes、difficulty、servings、状态、封面 | 可作为候选 Recipe 主体；没有结构化口味/方法标签 |
| `recipe_ingredients` | Recipe–Ingredient M:N 关联、克数、复合主键、`amount_grams > 0` | 可用于 restriction 和后续营养推导 |
| `ingredients` | 全局 Ingredient、营养字段 | 可支持按克数计算营养；当前 route 未使用该计算 |
| `ingredient_seasons` | Ingredient–month M:N，复合主键 | 可支持按 Ingredient 推导季节；当前 route 未 join |
| `family_members` | Family 成员、active/left、role | 可定义当前 Family 和 active Member 集合 |
| `member_ingredient_restrictions` | Member–Ingredient M:N，复合主键 | 已支持 active-member restriction union |
| `member_category_preferences` | Member–category M:N，复合主键，1–5 | 已支持家庭平均偏好；未支持 session preference |
| `recommendation_runs` | 一次 Run 的总体条件和结果摘要 | 可作为 session 根实体，但缺结构/候选组/新时间字段 |
| `recommendation_items` | Run–Recipe 关联、单项分数和理由、Run 内唯一 | 可兼容旧单结果；不能表达多个候选组 |
| `menus` | Family + 日期 + 餐次唯一 | 可作为 Apply 目标 |
| `menu_items` | Menu–Recipe 关联、同 Menu 内唯一 | 可提供近期重复历史 |

### 3.2 当前已有的完整性基础

- `recommendation_runs.family_id`、`created_by_member_id` 有外键。
- `recommendation_items` 对 Run 和 Recipe 有外键，并有 `UNIQUE(recommendation_run_id, recipe_id)`。
- `recommendation_items` 到 Recipe 使用 `ON DELETE RESTRICT`，有利于保留推荐历史引用；业务上 Recipe 使用 soft delete。
- Recommendation route 与 persistence service 仍额外执行 Family、active member、active Recipe 校验，不能只依赖单列 FK。
- 当前 Schema 没有跨 Family composite FK；Family boundary 继续由 Family-scoped SQL 与 service validation 保证。

### 3.3 明确不存在的能力

当前 Schema 没有：

- `recommendation_candidates` 或等价候选组表；
- candidate–Recipe 关联表；
- `candidateId`；
- session taste/dietary preference；
- 精确菜单结构字段；
- `max_prep_minutes`；
- Recipe tag 关系；
- Recipe 的 prep time / parallelism / preparation method 字段；
- candidate-level total score、prep time、reason snapshot；
- “换一组”的 cursor 或候选顺序持久化。

## 4. New Recommendation Domain Model

### 4.1 领域对象

新系统冻结为以下四层：

1. **Recommendation Session / Run**：一次请求和一次候选生成会话，绑定当前 Family、创建 Member、日期、餐次和请求快照。
2. **Recommendation Candidate**：该 Session 中一个完整可应用的菜单方案，拥有稳定的 `candidateId` 和 rank。
3. **Recommendation Candidate Item**：Candidate 中的一个 Recipe 槽位，保存 Recipe 引用以及生成时的 score/reason snapshot。
4. **Menu Application**：用户选择一个 `runId + candidateId` 后，将该 Candidate 原子地写入 Menu。

关系为：

```text
Family 1 ── N RecommendationRun
RecommendationRun 1 ── N RecommendationCandidate
RecommendationCandidate 1 ── N RecommendationCandidateItem
RecommendationCandidateItem N ── 1 Recipe
RecommendationRun / Candidate ── 0..1 Menu application target
```

### 4.2 新的规范请求

新 canonical request 为：

```json
{
  "menuDate": "YYYY-MM-DD",
  "mealType": "dinner",
  "peopleCount": 2,
  "maxPrepMinutes": 45,
  "structure": {
    "meat": 1,
    "vegetable": 1,
    "soup": 1,
    "staple": 0
  },
  "preferences": {
    "tasteTags": ["light"],
    "dietaryTags": ["high_protein"],
    "seasonal": true
  }
}
```

冻结规则：

- `menuDate`、`mealType`、`peopleCount` 继续沿用当前 contract。
- `maxPrepMinutes` 是新 canonical 时间目标字段，范围先沿用当前可解释范围 10–480；它是 Preferred Time Constraint，不是绝对 hard upper bound。
- `structure` 是精确的菜单槽位数量；四个 key 分别映射到现有 category：`meat=荤菜`、`vegetable=素菜`、`soup=汤`、`staple=主食`。
- `structure` 的值必须是非负整数，四项总和必须大于 0。每个 Candidate 必须恰好满足该结构。
- `peopleCount` 表示用餐人数/份量背景，不再隐式决定结构；结构由 `structure` 明确表达。
- `preferences` 是本次 session 的软偏好，不覆盖长期 `member_category_preferences`，也不写入成员长期偏好表。
- `tasteTags`、`dietaryTags` 均为受控 ASCII code 数组；空数组表示该类无 session 偏好。
- `seasonal` 是是否提高当季匹配的软偏好，不是无条件硬过滤。
- R1 首次实现固定生成 3 个候选方案，不新增客户端 `candidateCount` 字段；未来需要可调数量时另行扩展 contract。

### 4.3 新的规范响应

新 canonical response 为：

```json
{
  "ok": true,
  "data": {
    "runId": 501,
    "candidates": [
      {
        "candidateId": 701,
        "rank": 1,
        "items": [
          {
            "recipeId": 12,
            "category": "荤菜",
            "dishScore": 84,
            "reason": "家庭偏好荤菜；预计准备约 18 分钟"
          }
        ],
        "estimatedPrepMinutes": 42,
        "withinTimeLimit": true,
        "timeOverageMinutes": 0,
        "timeWarning": "",
        "totalScore": 82,
        "scoreBreakdown": {
          "preference": 80,
          "nutrition": 76,
          "seasonal": 70,
          "time": 88,
          "novelty": 65,
          "diversity": 75
        },
        "reason": "满足指定结构，并在时间范围内优先选择家庭偏好方案"
      }
    ],
    "nextCandidateAvailable": true
  }
}
```

`candidateId` 由服务端产生，客户端不得用 Recipe ID 拼接伪造。生成结果中的 score/reason 是结果快照；Recipe 标题、封面等展示信息仍按当前项目 Dynamic Reference 规则读取，但 Apply 必须重新校验 Recipe active 和 Family。

## 5. Hard vs Soft Constraints

### 5.1 Hard constraints

以下规则必须在候选生成前或候选组合形成时阻断：

1. 请求用户已认证且拥有当前 active Family。
2. 候选 Recipe 必须是当前 Family 的 active Recipe。
3. 当前 Family 所有 active Member 的 restriction union 命中 Recipe 时，Recipe 不得进入候选。
4. Candidate 必须精确满足 `structure` 的类别数量。
5. 同一个 Candidate 内同一个 Recipe 不得出现两次。
6. Candidate 必须计算并返回 `estimatedPrepMinutes`，但超过 `maxPrepMinutes` 不会使 Candidate 失效。时间只决定 Candidate Tier 和排序优先级，不得覆盖其他 hard constraint。
7. Apply 时 `runId`、`candidateId`、Candidate Item、Recipe、current Family 必须形成合法的同 Family 关系。
8. Apply 任一 Item 失效时整个 Apply 失败并回滚，不允许 partial success。

### 5.2 Preferred Time Constraint

`maxPrepMinutes` 是独立于普通加权偏好的“期望时间目标”：

- `withinTimeLimit = estimatedPrepMinutes <= maxPrepMinutes`；
- 优先从 `withinTimeLimit = true` 的 Tier 1 选择 Candidate；
- Tier 1 不足 3 个时，用结构合法、restriction 合法但超时的 Tier 2 补足；
- Tier 1 为 0 时，仍返回最多 3 个 Tier 2 Candidate；
- Tier 2 先按 `timeOverageMinutes ASC`，再按 menu-level `totalScore DESC`；
- 时间超限只生成 warning，不返回失败错误。

### 5.3 Soft preferences

以下因素只影响排序、解释和候选多样性，不得直接把候选集清空：

- session taste preference；
- session dietary tags，除非未来明确添加并冻结为 hard constraint；R1 默认按软匹配；
- seasonal preference；
- active Member 长期 category preference 的平均值；
- nutrition balance；
- cooking method diversity；
- 最近菜单重复惩罚；
- Candidate 之间的 Recipe overlap 惩罚。

Restriction 始终优先于 Preference：高偏好 Recipe 命中 active Member restriction 时仍然排除。

## 6. Recipe Metadata Design

### 6.1 当前 metadata 分级

| Metadata | 当前事实 | 新系统处理 |
| --- | --- | --- |
| category | Schema 强制四值 | 直接用于结构槽位 |
| cook_minutes | 每 Recipe 可靠存在 | 作为当前唯一时间代理 |
| difficulty / servings | 当前存在 | 继续用于时间/份量辅助解释 |
| recipe_ingredients + amount_grams | 当前可靠 | 可推导营养与 restriction |
| ingredients nutrition | 当前存在 | 可推导营养，但必须按克数计算 |
| ingredient_seasons | 表存在 | 可推导季节，需真正 join；不能沿用当前 route 的伪季节值 |
| spicy/sweet/light/sour/savory | 无结构化字段 | 需要人工/后台维护 recipe tag |
| high_protein/seafood/vegetarian | 无统一可靠字段 | R1 作为受控 Recipe tag；不要用标题模糊匹配 |
| cooking_method | 无字段 | 需要受控 Recipe tag |
| recent usage | 可从 menus/menu_items 查询 | 一次批量查询后做软惩罚 |

### 6.2 推荐的 `recipe_tags`

建议在 R1 通过新增关系表提供受控标签，而不是把标签 JSON 塞进 recipes：

```text
recipe_tags(
  recipe_id,
  tag_type,       -- taste / dietary / method
  tag_value,
  PRIMARY KEY(recipe_id, tag_type, tag_value),
  FOREIGN KEY(recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
)
```

建议首版 code：

- `taste`: `spicy`, `sweet`, `light`, `sour`, `savory`；
- `dietary`: `high_protein`, `seafood`, `vegetarian`；
- `method`: `stir_fry`, `steam`, `stew`, `soup`, `bake`。

这些 code 是接口稳定值，中文仅用于 Frontend 展示。`seasonal` 不存为 Recipe tag，优先由 `ingredient_seasons` 根据目标月份计算。

`recipe_tags` 的标签是人工维护/课程演示数据，不允许通过 title、description、steps 的模糊关键词推断为权威业务事实。

### 6.3 可推导 metadata

- `high_protein` 可在候选查询或预计算层按 `recipe_ingredients.amount_grams * ingredients.protein_per_100g / 100` 得到；R1 若未做营养物化，不得使用当前 route 的固定 `protein: 10` 作为真实营养结论。
- `seasonal` 可按 Recipe 的 Ingredients 是否命中目标月份的 `ingredient_seasons` 计算，并在理由中说明“主要食材当季”或“季节匹配较少”。
- `vegetarian`、`seafood` 如果没有统一 Ingredient 分类，使用人工 recipe tag，不做隐式猜测。

## 7. Menu Candidate Model

### 7.1 Candidate 生成

一次 Request 创建一个 Run，并在 Run 下生成最多 3 个完整 Candidate。Candidate 生成分为“可行性”和“偏好排序”两步：

1. 先满足 hard constraints，得到所有结构合法、restriction 合法且 Recipe 不重复的 Candidate；
2. 为每个 Candidate 计算 `estimatedPrepMinutes`、`withinTimeLimit`、`timeOverageMinutes` 和 `timeWarning`；
3. 分为 Tier 1（不超时目标）和 Tier 2（超时目标）；
4. Tier 1 主要按 menu-level `totalScore DESC`，Tier 2 主要按 `timeOverageMinutes ASC`、再按 `totalScore DESC`；
5. 在各 Tier 内应用 candidate diversity 和稳定 tie-break（Recipe ID 升序）。

生成 3 个方案时，Candidate A/B/C 都必须满足同一个 request 的 Family、restriction、structure 和 Recipe uniqueness hard constraints；其中一部分 Candidate 可以是超出时间目标的 Tier 2 方案，但必须携带真实 overtime metadata。

### 7.2 “换一组”语义

R1 首版“换一组”不是客户端重新随机组合，也不是重新提交一批任意 Recipe ID。它只是从同一 Run 已持久化的 Candidate 列表切换到下一个 `candidateId`。Candidate 顺序、分数和内容由服务端持久化，页面刷新后仍能恢复。

如果一次生成只有一个可行 Candidate，响应应明确 `nextCandidateAvailable: false`，而不是伪造第二组。

### 7.3 Candidate 与历史

- Candidate Item 保存生成时的 `dish_score`、`reason`、slot/category 信息。
- Recipe 标题、cover、description 仍按当前项目 Dynamic Reference 展示。
- Recipe soft delete 后，历史 Candidate 可保留；新的 Apply 必须按现有 stale 规则失败，不重新加入 Menu。
- Candidate Item 对 Recipe 的物理删除建议 `RESTRICT`，与现有 `recommendation_items` 一致；正常产品路径使用 Recipe soft delete。

## 8. Diversification Semantics

### 8.1 Candidate 间 Recipe 重叠

正常情况下，任意两个 Candidate 的 Recipe 集合交集最多为 1：

```text
overlap(candidateA, candidateB) <= 1
```

这只约束 Candidate 之间的多样性，不改变单个 Candidate 内 Recipe 不重复的 hard constraint。

### 8.2 不足时的确定性放宽

若可行 Recipe 数量不足以生成 3 个满足 overlap <= 1 的 Candidate，按以下顺序放宽：

1. 先保留 hard constraints，允许 overlap <= 2；
2. 仍不足时允许必要的更高 overlap；
3. 绝不放宽 Family、active、restriction、structure 或 Candidate 内 Recipe uniqueness 等真正 hard constraints。`maxPrepMinutes` 不在可放宽 hard constraint 列表中，因为它本身是 Preferred Time Constraint。

响应和内部 reason 应能说明“候选数量受现有可用菜谱限制”，不能把放宽后的结果描述为完全多样化。

### 8.3 最近菜单重复惩罚

历史来源是当前 Family 的 `menus` + `menu_items`，按目标日期往前查询：

- 最近 3 个日历日内使用：`-20` novelty penalty；
- 第 4–7 个日历日使用：`-8` novelty penalty；
- 7 日前或从未使用：0。

该惩罚是软排序项，不能让唯一满足结构的 Recipe 被硬过滤。查询应一次批量获取历史 Recipe ID，禁止每个候选单独 SQL 查询。

## 9. Prep Time Semantics

### 9.1 R1 的明确代理模型

当前只有 `recipes.cook_minutes`，没有 prep time、并行能力或设备能力字段。因此 R1 使用可解释的估算值，而不声称是真实厨房计时：

```text
sumCookMinutes = Σ recipe.cook_minutes
longestCookMinutes = max(recipe.cook_minutes)
estimatedPrepMinutes = longestCookMinutes
                       + ceil((sumCookMinutes - longestCookMinutes) * 0.5)
```

解释：主菜路径按最长时间计，其他菜按部分并行估算。该模型简单、可复现，且比直接把总和命名为 prep time 更准确。

### 9.2 Preferred Time Constraint 与 overtime fallback

新 contract 的 `maxPrepMinutes` 表示“最好在该时间内完成”，不是“超过即禁止推荐”。

对于每个 Candidate 派生：

```text
withinTimeLimit = estimatedPrepMinutes <= maxPrepMinutes
timeOverageMinutes = max(0, estimatedPrepMinutes - maxPrepMinutes)
timeWarning = withinTimeLimit
  ? ''
  : '预计需要约 {estimatedPrepMinutes} 分钟，比你设定的 {maxPrepMinutes} 分钟多约 {timeOverageMinutes} 分钟。'
```

如果存在结构合法且 restriction 合法的 Candidate，但全部超过时间目标，仍然正常返回 Tier 2 Candidate；不能因为时间超限返回 422。

422 只保留给真正的 hard constraint infeasible，例如 restriction 后某必需 category 数量不足，或 Recipe 库无法满足 exact structure。旧 contract 的 `maxCookMinutes` 在兼容窗口内保留旧的总 `cook_minutes` 语义；不得静默改成新公式。

### 9.3 Candidate Time Metadata 与 Frontend Future Contract

每个 Candidate/API response 必须提供：

- `estimatedPrepMinutes`；
- `withinTimeLimit`；
- `timeOverageMinutes`；
- `timeWarning`。

Frontend 在 R4 中：

- `withinTimeLimit = true` 时正常展示预计准备时间；
- `withinTimeLimit = false` 时使用 warning/error accent 标红时间；
- 展示真实、可解释的 overtime 文案；
- 不把 overtime warning 当作请求失败或空结果。

## 10. Apply Contract

### 10.1 新请求

保持主路径可识别性，建议新 Apply 继续使用：

```text
POST /api/recommendations/:runId/apply
body: { "candidateId": 701 }
```

规则：

1. `runId` 与 `candidateId` 必须属于当前 Family。
2. 当前 active Member 必须有效；保留当前“Run 创建 Member 仍 active 且由该 Member Apply”的行为，除非后续另行冻结产品权限。
3. Candidate 所有 Recipe 必须仍为同 Family、active。
4. 任一 Recipe 失效、关系脏或 Candidate 不存在时，整体返回 404/409 业务错误并回滚。
5. 复用现有 Menu slot 唯一性和 MenuItem 幂等性。
6. 已存在 MenuItem 的 note/source 不覆盖。
7. `source='recommendation'`，Apply 只建立 Menu/MenuItem 关系，不修改 Recipe、Preference、Restriction 或 Recommendation history。

### 10.2 旧 Apply 兼容

旧 Run 只有 `recommendation_items`，没有 Candidate。兼容窗口内：

- 无 body 的旧 Apply 仅允许用于 legacy Run，并将 legacy `recommendation_items` 视为唯一候选组；
- 新 Run 必须提供 `candidateId`；
- 新旧 Apply 都使用同一事务、stale revalidation 和 idempotent MenuItem 写入；
- 不通过数据库中偷偷复制旧数据来改变历史语义。

## 11. Schema Change Proposal

R0 只提出，不执行任何 Schema 变更。

### 11.1 `recommendation_runs` 增量字段

建议增加：

| 字段 | 建议类型/作用 |
| --- | --- |
| `max_prep_minutes` | 新 canonical prep upper bound；新 Run 使用 |
| `menu_structure` | JSON；保存 meat/vegetable/soup/staple 请求快照 |
| `session_preferences` | JSON；保存 taste/dietary/seasonal 请求快照 |

现有 `max_cook_minutes` 和 `mode` 暂保留，用于历史 Run 与兼容读取。不要在 R1 直接删除或改写历史字段。

### 11.2 `recommendation_candidates`

建议字段：

```text
id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT
recommendation_run_id BIGINT UNSIGNED NOT NULL
candidate_rank TINYINT UNSIGNED NOT NULL
estimated_prep_minutes SMALLINT UNSIGNED NOT NULL
total_score DECIMAL(6,2) NOT NULL
score_breakdown JSON NOT NULL
reason_text VARCHAR(500) NOT NULL DEFAULT ''
UNIQUE(recommendation_run_id, candidate_rank)
FOREIGN KEY(recommendation_run_id) REFERENCES recommendation_runs(id) ON DELETE CASCADE
```

### 11.3 `recommendation_candidate_items`

建议字段：

```text
recommendation_candidate_id BIGINT UNSIGNED NOT NULL
recipe_id BIGINT UNSIGNED NOT NULL
slot_no TINYINT UNSIGNED NOT NULL
category ENUM('荤菜','素菜','汤','主食') NOT NULL
dish_score DECIMAL(6,2) NOT NULL
reason_text VARCHAR(500) NOT NULL DEFAULT ''
PRIMARY KEY(recommendation_candidate_id, recipe_id)
UNIQUE(recommendation_candidate_id, slot_no)
FOREIGN KEY(recommendation_candidate_id) REFERENCES recommendation_candidates(id) ON DELETE CASCADE
FOREIGN KEY(recipe_id) REFERENCES recipes(id) ON DELETE RESTRICT
```

`slot_no` 便于验证精确结构；`recipe_id` 唯一保证单个 Candidate 内不重复。

### 11.4 `recipe_tags`

使用本文件第 6 节定义的关系表和复合主键。建议增加 `(tag_type, tag_value)` 索引支持候选查询，但不引入通用 RBAC、通用 metadata framework 或复杂领域层。

### 11.5 为什么不只使用 JSON

把整套 Candidate 放入 `recommendation_runs.candidates JSON` 可以减少表数量，但会失去：

- Recipe 外键和参照完整性；
- Candidate 内 Recipe 唯一约束；
- Candidate 级 Apply 查询；
- SQL 统计与答辩中的关系模型解释性。

推荐采用“关系表保存 Candidate/CandidateItem，JSON 保存可变的请求和 score snapshot”的混合方案，符合当前课程项目规模。

## 12. Migration / Compatibility Strategy

### 12.1 增量迁移原则

1. 先 additive migration：新增字段和表，不删除旧表/旧字段。
2. 旧 `recommendation_runs` / `recommendation_items` 继续只读和兼容 Apply。
3. 新 Run 写入新字段和 Candidate 表；过渡期保留现有总体字段供旧查询和历史展示使用。
4. 旧历史 Run 不强制重算新 score；如果需要迁移展示，可把每个 legacy Run 映射为 rank 1 的 legacy Candidate，但不改变原始分数/理由。
5. 只有在新 API、Frontend、Integration 全部稳定后，才评估移除 legacy `mode` / `max_cook_minutes` 的必要性；课程项目不要求删除它们。

### 12.2 API 兼容窗口

- 新 canonical request 使用 `maxPrepMinutes + structure + preferences`。
- 旧请求继续接受 `maxCookMinutes + mode`，走 legacy adapter，保留旧结果语义。
- 旧 Frontend 可以继续读取 `items`；新 Frontend 读取 `candidates`。
- 不允许新客户端同时传入互相冲突的 `maxCookMinutes` 和 `maxPrepMinutes`；若同时存在，返回 400，而不是猜测优先级。
- 新 API 不接受客户端提交 Recipe 集合、candidateId 以外的关系 ID 或 Family ID。

## 13. Phase R1–R5 Recommended Implementation Sequence

### R1：Metadata、Schema 增量与兼容适配

- 新增 `recipe_tags`、Candidate/CandidateItem 表和 Run 请求快照字段。
- 建立 controlled tag contract 与 seed/demo metadata。
- 保留旧 recommendation API 和历史数据。
- 验收：旧 Direct/Integration tests 仍通过；新表可表达三组 Candidate；无业务代码大规模重构。

### R2：新候选生成引擎

- 实现 structure hard constraint、restriction hard filter、active Family boundary。
- 实现 `maxPrepMinutes` 的 preferred-time tier、overtime fallback 和 Candidate 时间 metadata；保持 R0 的估算公式不变。
- 实现长期 preference、session preference、营养/季节、recent novelty 的软评分。
- 实现最多 3 组 Candidate 与 overlap diversification。
- 修正当前 route 中“所有 Recipe 都当季”和固定 nutrition proxy 的事实错误。
- 验收：同一 request 可稳定产生候选 A/B/C；有可行时间内 Candidate 时优先返回；全部超时时仍返回最多 3 个结构合法 Candidate；无 metadata 时不虚构命中理由。

### R3：持久化与 Candidate Apply

- 将 Run、Candidate、CandidateItem 在同一事务中持久化。
- Apply 接受 `runId + candidateId`，校验 Family、active Recipe、stale 状态。
- 保持整体 rollback、Menu slot 唯一性、MenuItem 幂等性和原 note/source。
- 验收：无部分 Apply；旧 legacy Run 仍可按兼容规则处理。

### R4：API 与 Frontend Candidate Flow

- 更新请求编辑器以表达 structure、maxPrepMinutes、session preferences。
- 展示 Candidate A/B/C、切换/换一组、候选理由、prep estimate 和 overtime warning。
- Apply 明确作用于当前 candidate，不再默认整批隐藏选择。
- 验收：刷新后候选顺序和 candidateId 稳定；within-time Candidate 优先；overtime Candidate 可正常展示和 Apply；No Family、404、409、422、loading/error 状态完整。

### R5：真实数据库验证与课程交付验收

- 在独立 `mealpilot_test` 上验证新增 FK、UNIQUE、Candidate 内不重复、Apply rollback、并发 Apply、Family isolation、历史 legacy compatibility。
- 验证 score/reason 与持久化快照一致，验证近期菜单惩罚和 overlap 放宽规则。
- 更新数据库说明、ER 图、数据字典、API 文档和演示脚本。
- 验收：新旧 contract、Schema constraint、真实 MySQL integration 和课程演示路径均有可追溯证据。

## R0 Compatibility Risks

| 风险 | 影响 | R0 结论 |
| --- | --- | --- |
| `maxCookMinutes` 与 `maxPrepMinutes` 语义不同 | 时间结果可能被错误解释 | 新旧字段分开；新字段是 preferred target，超时可回退；兼容期不静默改语义 |
| 当前 route 把所有候选标为当季 | season 分数和理由失真 | R2 必须接入 `ingredient_seasons` 或明确无季节数据 |
| 当前 nutrition 是固定代理值 | “营养评分”不代表真实配方营养 | R2 必须用 Ingredient 克数计算或降级文案 |
| 旧 `recommendation_items` 无 candidate 层 | 新 Apply 无法直接复用 | 新增 Candidate 表；旧 Run 作为 legacy 唯一候选 |
| 当前类别只有四个 ENUM | 新 structure 只能映射四类 | R0 不扩充 Recipe category；新 tag 单独表达细粒度偏好 |
| Recipe 内容采用 Dynamic Reference | 历史 Candidate 展示可能看到新标题/封面 | 分数/理由保存快照；Recipe 内容继续动态读取 |
| 当前 Apply 只能整批使用 | 新 contract 需要选择候选 | 新 Run 必须 candidateId；legacy Run 保留无 body 兼容 |
| 当前按 Family active membership 聚合 | 多 Family 未启用 | 继续使用唯一 current Family，不重新打开 Phase 1 规则 |

## Baseline Verification

R0 期间执行了不连接 MySQL 的验证：

| 检查 | 实际结果 |
| --- | --- |
| Backend `cd server; npm test` | 106 passed, 0 failed, 0 skipped |
| Frontend `cd miniprogram; npm test` | 87 passed, 0 failed, 0 skipped |
| Backend Direct runner | 26 个非 integration 测试文件被收集 |
| Frontend runner | 9 个 `.test.js` 文件被递归收集 |
| Real MySQL integration | 本阶段未运行 |
| 业务数据库 `mealpilot` 写入 | 未执行 |

Backend `server/src/scripts/run-direct-tests.js` 会递归收集 `server/test`，排除 `server/test/integration`，再调用 Node test runner。`npm test` 实际等于 `npm run test:direct`，不代表 Real MySQL integration。Integration 由单独的 `npm run test:integration` 启动，并具有测试数据库安全门禁。

当前工作区中存在 26 个 Backend test file 和 9 个 Frontend test file；当前命令没有发现未被默认 Direct/Frontend runner 收集的普通 `.test.js` 文件。Integration 文件被默认 Backend Direct 有意排除，不属于 106 的组成部分。历史报告中的 97、82、111 与当前数字不同，不能据此推断回归失败；它们反映的是不同阶段测试文件集合和 runner 基线。R0 采用本次实际命令输出的 106/87 作为基线。

## Modified Files

仅新增本规格文件：

`docs/superpowers/specs/menu-generation-recommendation-spec.md`

本阶段不修改业务代码、Frontend、Schema、Seed、测试、README、运行配置或数据库数据。

## Final Status

**A. R0 audit and contract freeze complete.**

新推荐系统的边界、canonical request/response、hard/soft constraint、metadata 缺口、prep time、diversification、Candidate Apply、Schema 增量方向和 R1–R5 实施顺序已经冻结。R1 尚未开始。
