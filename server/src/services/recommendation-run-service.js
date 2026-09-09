const { HttpError } = require('../http')
const { addMenuItemRecord } = require('./menu-item-service')
const { CATEGORY_BY_SLOT } = require('./recommendation/constants')
const { expandMealStructure } = require('./recommendation/menu-structure')
const { getTimeMetadata } = require('./recommendation/prep-time-estimator')

async function assertActiveMember(connection, familyId, memberId) {
  const [members] = await connection.execute(
    `SELECT id FROM family_members WHERE id = ? AND family_id = ? AND status = 'active'`,
    [memberId, familyId]
  )
  if (!members[0]) throw new HttpError(404, '家庭成员不存在')
}

async function assertFamilyRecipes(connection, familyId, recipeIds) {
  const ids = [...new Set(recipeIds)]
  if (!ids.length) return
  const placeholders = ids.map(() => '?').join(', ')
  const [recipes] = await connection.execute(
    `SELECT id FROM recipes WHERE family_id = ? AND id IN (${placeholders})`,
    [familyId, ...ids]
  )
  if (recipes.length !== ids.length) throw new HttpError(404, '推荐菜谱不存在')
}

async function persistRecommendationRun({ connection, familyId, memberId, menuDate, mealType, peopleCount, maxCookMinutes, mode, recommendation }) {
  await assertActiveMember(connection, familyId, memberId)
  await assertFamilyRecipes(connection, familyId, recommendation.items.map((item) => item.id))
  const [created] = await connection.execute(
    `INSERT INTO recommendation_runs (family_id, created_by_member_id, menu_date, meal_type, people_count, max_cook_minutes, mode, total_score, total_cook_minutes, score_breakdown)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [familyId, memberId, menuDate, mealType, peopleCount, maxCookMinutes, mode, recommendation.totalScore, recommendation.totalCookMinutes, JSON.stringify(recommendation.scoreBreakdown)]
  )
  for (const item of recommendation.items) {
    await connection.execute('INSERT INTO recommendation_items (recommendation_run_id, recipe_id, dish_score, reason_text) VALUES (?, ?, ?, ?)', [created.insertId, item.id, item.score.total, item.score.reason])
  }
  return created.insertId
}

async function persistCanonicalRecommendationRun({ connection, familyId, memberId, request, recommendation }) {
  await assertActiveMember(connection, familyId, memberId)
  const recipeIds = recommendation.candidates.flatMap((candidate) => candidate.items.map((item) => item.recipeId))
  await assertFamilyRecipes(connection, familyId, recipeIds)
  const [created] = await connection.execute(
    `INSERT INTO recommendation_runs (family_id, created_by_member_id, menu_date, meal_type, people_count, max_cook_minutes, max_prep_minutes, mode, total_score, total_cook_minutes, score_breakdown, menu_structure, session_preferences)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [familyId, memberId, request.menuDate, request.mealType, request.peopleCount, null, request.maxPrepMinutes, null, null, null, null, JSON.stringify(request.structure), JSON.stringify(request.preferences || {})]
  )
  const persistedCandidates = []
  for (const candidate of recommendation.candidates) {
    const [candidateResult] = await connection.execute(
      `INSERT INTO recommendation_candidates (recommendation_run_id, candidate_rank, estimated_prep_minutes, total_score, score_breakdown, reason_text)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [created.insertId, candidate.rank, candidate.estimatedPrepMinutes, candidate.totalScore, JSON.stringify(candidate.scoreBreakdown), candidate.reason || '']
    )
    for (const [index, item] of candidate.items.entries()) {
      await connection.execute(
        `INSERT INTO recommendation_candidate_items (recommendation_candidate_id, recipe_id, slot_no, category, dish_score, reason_text)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [candidateResult.insertId, item.recipeId, index + 1, item.category, item.dishScore, item.reason || '']
      )
    }
    persistedCandidates.push({ ...candidate, candidateId: candidateResult.insertId })
  }
  return {
    runId: created.insertId,
    candidates: persistedCandidates,
    nextCandidateAvailable: persistedCandidates.length > 1
  }
}

function parseJson(value, fallback = {}) {
  if (value === null || value === undefined || value === '') return fallback
  if (typeof value === 'object') return value
  try { return JSON.parse(value) } catch (_error) { return fallback }
}

async function loadPersistedCandidate({ connection, familyId, runId, rank }) {
  const [rows] = await connection.execute(`
    SELECT rr.id AS runId, rr.max_prep_minutes AS maxPrepMinutes,
      c.id AS candidateId, c.candidate_rank AS candidateRank,
      c.estimated_prep_minutes AS estimatedPrepMinutes, c.total_score AS totalScore,
      c.score_breakdown AS scoreBreakdown, c.reason_text AS reasonText,
      ci.slot_no AS slotNo, ci.recipe_id AS recipeId,
      ci.dish_score AS dishScore, ci.reason_text AS itemReason,
      r.title, r.category, r.cook_minutes AS cookMinutes, r.difficulty AS difficulty, r.cover_url AS coverUrl,
      COALESCE((
        SELECT JSON_ARRAYAGG(JSON_OBJECT(
          'id', td.id,
          'code', td.code,
          'name', td.name,
          'kind', td.kind,
          'status', td.status
        ))
        FROM recipe_tags rt
        INNER JOIN tag_definitions td ON td.id = rt.tag_id
        WHERE rt.recipe_id = ci.recipe_id
          AND td.status = 'active'
          AND (td.family_id IS NULL OR td.family_id = rr.family_id)
      ), JSON_ARRAY()) AS tags
    FROM recommendation_candidate_items ci
    INNER JOIN recommendation_candidates c ON c.id = ci.recommendation_candidate_id
    INNER JOIN recommendation_runs rr ON rr.id = c.recommendation_run_id
    INNER JOIN recipes r ON r.id = ci.recipe_id AND r.family_id = rr.family_id
    WHERE rr.id = ? AND rr.family_id = ? AND c.candidate_rank = ?
    ORDER BY ci.slot_no ASC
  `, [runId, familyId, rank])
  if (!rows.length) throw new HttpError(404, '推荐候选不存在')
  const first = rows[0]
  const items = rows.map((row) => ({
    recipeId: Number(row.recipeId),
    title: row.title,
    category: row.category,
    cookMinutes: Number(row.cookMinutes),
    difficulty: Number(row.difficulty || 1),
    coverUrl: row.coverUrl || null,
    tags: parseJson(row.tags, []),
    dishScore: Number(row.dishScore),
    reason: row.itemReason || ''
  }))
  const estimatedPrepMinutes = Number(first.estimatedPrepMinutes)
  const maxPrepMinutes = Number(first.maxPrepMinutes)
  const timeOverageMinutes = Math.max(0, estimatedPrepMinutes - maxPrepMinutes)
  const time = {
    withinTimeLimit: timeOverageMinutes === 0,
    timeOverageMinutes,
    timeWarning: timeOverageMinutes === 0 ? '' : `预计需要约 ${estimatedPrepMinutes} 分钟，比你设定的 ${maxPrepMinutes} 分钟多约 ${timeOverageMinutes} 分钟。`
  }
  const [nextRows] = await connection.execute(
    'SELECT 1 FROM recommendation_candidates WHERE recommendation_run_id = ? AND candidate_rank > ? LIMIT 1',
    [runId, rank]
  )
  return {
    runId: Number(first.runId),
    candidateId: Number(first.candidateId),
    rank: Number(first.candidateRank),
    items,
    estimatedPrepMinutes,
    withinTimeLimit: time.withinTimeLimit,
    timeOverageMinutes: time.timeOverageMinutes,
    timeWarning: time.timeWarning,
    totalScore: Number(first.totalScore),
    scoreBreakdown: parseJson(first.scoreBreakdown),
    reason: first.reasonText || '',
    nextCandidateAvailable: nextRows.length > 0
  }
}

async function loadCanonicalApplyRows(connection, familyId, runId, candidateId) {
  const [rows] = await connection.execute(`
    SELECT rr.id AS runId, rr.family_id AS runFamilyId, rr.menu_date AS menuDate, rr.meal_type AS mealType,
      rr.max_prep_minutes AS maxPrepMinutes, rr.menu_structure AS menuStructure,
      fm.id AS creatorId, fm.family_id AS creatorFamilyId, fm.status AS creatorStatus,
      c.id AS candidateId, c.candidate_rank AS candidateRank,
      ci.slot_no AS slotNo, ci.recipe_id AS recipeId, ci.category AS itemCategory,
      r.id AS familyRecipeId, r.family_id AS recipeFamilyId, r.status AS recipeStatus,
      r.category AS recipeCategory, r.cook_minutes AS cookMinutes
    FROM recommendation_candidate_items ci
    INNER JOIN recommendation_candidates c ON c.id = ci.recommendation_candidate_id
    INNER JOIN recommendation_runs rr ON rr.id = c.recommendation_run_id
    LEFT JOIN family_members fm ON fm.id = rr.created_by_member_id
    LEFT JOIN recipes r ON r.id = ci.recipe_id
    WHERE rr.id = ? AND rr.family_id = ? AND c.id = ?
    ORDER BY ci.slot_no ASC
  `, [runId, familyId, candidateId])
  return rows
}

async function assertLatestRestrictions(connection, familyId, recipeIds) {
  if (!recipeIds.length) return
  const placeholders = recipeIds.map(() => '?').join(', ')
  const [rows] = await connection.execute(`
    SELECT DISTINCT ri.recipe_id AS recipeId, mir.ingredient_id AS ingredientId
    FROM family_members fm
    INNER JOIN member_ingredient_restrictions mir ON mir.member_id = fm.id
    INNER JOIN recipe_ingredients ri ON ri.ingredient_id = mir.ingredient_id
    WHERE fm.family_id = ? AND fm.status = 'active' AND ri.recipe_id IN (${placeholders})
  `, [familyId, ...recipeIds])
  if (rows.length) throw new HttpError(409, '家庭忌口已变化，请重新生成推荐')
}

async function applyCanonicalRecommendationRun({ connection, familyId, memberId, runId, candidateId }) {
  await assertActiveMember(connection, familyId, memberId)
  const rows = await loadCanonicalApplyRows(connection, familyId, runId, candidateId)
  if (!rows.length) throw new HttpError(404, '推荐候选不存在')
  const run = rows[0]
  if (!run.creatorId || Number(run.creatorFamilyId) !== Number(familyId) || run.creatorStatus !== 'active') {
    throw new HttpError(409, '推荐结果已失效，请重新生成')
  }
  if (rows.some((row) => row.recipeFamilyId != null && Number(row.recipeFamilyId) !== Number(familyId))) {
    throw new HttpError(404, '推荐菜谱不存在')
  }
  if (rows.some((row) => row.familyRecipeId == null || row.recipeStatus !== 'active')) {
    throw new HttpError(409, '推荐结果已过期，请重新生成')
  }
  const structure = parseJson(run.menuStructure, null)
  let expectedSlots
  try {
    expectedSlots = expandMealStructure(structure)
  } catch (_error) {
    throw new HttpError(409, '推荐结构已失效，请重新生成')
  }
  if (rows.length !== expectedSlots.length) throw new HttpError(409, '推荐结构已失效，请重新生成')
  for (const [index, row] of rows.entries()) {
    const expectedCategory = CATEGORY_BY_SLOT[expectedSlots[index]]
    if (Number(row.slotNo) !== index + 1 || row.itemCategory !== expectedCategory || row.recipeCategory !== expectedCategory) {
      throw new HttpError(409, '推荐结构已失效，请重新生成')
    }
  }
  const recipeIds = rows.map((row) => Number(row.recipeId))
  await assertLatestRestrictions(connection, familyId, recipeIds)
  const currentTime = getTimeMetadata(rows.map((row) => ({ cookMinutes: Number(row.cookMinutes) })), Number(run.maxPrepMinutes))
  const [menu] = await connection.execute(
    `INSERT INTO menus (family_id, created_by_member_id, recommendation_run_id, menu_date, meal_type)
     VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
    [familyId, memberId, runId, run.menuDate, run.mealType]
  )
  let addedCount = 0
  let alreadyPresentCount = 0
  for (const recipeId of recipeIds) {
    const result = await addMenuItemRecord({ connection, menuId: menu.insertId, recipeId, source: 'recommendation', note: '来自推荐' })
    if (result.status === 'already-present') alreadyPresentCount += 1
    else addedCount += 1
  }
  return {
    menuId: menu.insertId,
    candidateId: Number(candidateId),
    addedCount,
    alreadyPresentCount,
    currentEstimatedPrepMinutes: currentTime.estimatedPrepMinutes,
    currentWithinTimeLimit: currentTime.withinTimeLimit,
    currentTimeOverageMinutes: currentTime.timeOverageMinutes,
    currentTimeWarning: currentTime.timeWarning
  }
}

async function applyRecommendationRun({ connection, familyId, memberId, runId }) {
  await assertActiveMember(connection, familyId, memberId)
  const [runs] = await connection.execute(`SELECT rr.menu_date AS menuDate, rr.meal_type AS mealType,
      fm.id AS creatorId, fm.family_id AS creatorFamilyId, fm.status AS creatorStatus
    FROM recommendation_runs rr
    LEFT JOIN family_members fm ON fm.id = rr.created_by_member_id
    WHERE rr.id = ? AND rr.family_id = ?`, [runId, familyId])
  if (!runs[0]) throw new HttpError(404, '推荐批次不存在')
  const run = runs[0]
  if (!run.creatorId || Number(run.creatorFamilyId) !== Number(familyId) || run.creatorStatus !== 'active') {
    throw new HttpError(409, '推荐结果已失效，请重新生成')
  }
  const [items] = await connection.execute(`SELECT ri.recipe_id AS recipeId, r.id AS familyRecipeId
      , r.family_id AS recipeFamilyId, r.status AS recipeStatus
    FROM recommendation_items ri
    LEFT JOIN recipes r ON r.id = ri.recipe_id
    WHERE ri.recommendation_run_id = ? ORDER BY ri.id`, [runId])
  if (!items.length) throw new HttpError(422, '该推荐批次没有菜品')
  if (items.some((item) => item.recipeFamilyId != null && Number(item.recipeFamilyId) !== Number(familyId))) {
    throw new HttpError(404, '推荐菜谱不存在')
  }
  if (items.some((item) => item.familyRecipeId == null || item.recipeStatus !== 'active')) {
    throw new HttpError(409, '推荐结果已过期，请重新生成')
  }
  const [menu] = await connection.execute(
    `INSERT INTO menus (family_id, created_by_member_id, recommendation_run_id, menu_date, meal_type)
     VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), recommendation_run_id = VALUES(recommendation_run_id)`,
    [familyId, memberId, runId, run.menuDate, run.mealType]
  )
  let addedCount = 0
  let alreadyPresentCount = 0
  for (const item of items) {
    const result = await addMenuItemRecord({ connection, menuId: menu.insertId, recipeId: item.recipeId, source: 'recommendation', note: '来自推荐' })
    if (result.status === 'already-present') alreadyPresentCount++
    else addedCount++
  }
  return { menuId: menu.insertId, addedCount, alreadyPresentCount }
}

async function applyRecommendationRequest({ connection, familyId, memberId, runId, body = {} }) {
  if (body.recipeIds !== undefined) throw new HttpError(400, '不能提交菜谱列表，请提交候选ID')
  const [runs] = await connection.execute(`
    SELECT rr.id, rr.max_prep_minutes AS maxPrepMinutes,
      rr.menu_structure AS menuStructure, rr.session_preferences AS sessionPreferences,
      EXISTS (SELECT 1 FROM recommendation_candidates rc WHERE rc.recommendation_run_id = rr.id) AS hasCandidates
    FROM recommendation_runs rr
    WHERE rr.id = ? AND rr.family_id = ?
  `, [runId, familyId])
  if (!runs[0]) throw new HttpError(404, '推荐批次不存在')
  const run = runs[0]
  const canonical = Boolean(
    Number(run.hasCandidates) ||
    (run.maxPrepMinutes !== null && run.maxPrepMinutes !== undefined) ||
    (run.menuStructure !== null && run.menuStructure !== undefined) ||
    (run.sessionPreferences !== null && run.sessionPreferences !== undefined)
  )
  if (canonical) {
    if (body.candidateId === undefined || body.candidateId === null) throw new HttpError(400, '缺少字段：candidateId')
    return applyCanonicalRecommendationRun({ connection, familyId, memberId, runId, candidateId: Number(body.candidateId) })
  }
  if (body.candidateId !== undefined) throw new HttpError(400, '传统推荐批次不支持 candidateId')
  return applyRecommendationRun({ connection, familyId, memberId, runId })
}

module.exports = {
  applyCanonicalRecommendationRun,
  applyRecommendationRequest,
  applyRecommendationRun,
  loadPersistedCandidate,
  persistCanonicalRecommendationRun,
  persistRecommendationRun
}
