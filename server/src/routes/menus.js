const express = require('express')
const { randomUUID } = require('node:crypto')
const { HttpError, requireFields, requirePositiveInteger, requireDateOnly, requireEnum, requireIntegerRange } = require('../http')
const { aggregateFamilyPreferences, buildRecommendation } = require('../services/recommendation-service')
const { addMenuItem } = require('../services/menu-item-service')
const { RecommendationDomainError } = require('../services/recommendation/constants')
const { generateMenuCandidatesFromDatabase, getAvailableTagIds } = require('../services/recommendation/menu-recommendation-engine')
const { loadActiveFamilyRestrictionIds, loadRecipeDomainData } = require('../services/recommendation/recipe-candidate-loader')
const { loadLowRatedRecipeIds } = require('../services/recommendation/recent-history')
const { loadPersistedCandidate, persistCanonicalRecommendationRun, persistRecommendationRun, applyRecommendationRequest } = require('../services/recommendation-run-service')
const { validatePreferenceTagIds } = require('../services/tag-service')
const asyncRoute = (handler) => (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next)
const normalizeSqlDate = (value) => {
  if (value instanceof Date) {
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`
  }
  return String(value || '').slice(0, 10)
}

function isCanonicalRecommendationRequest(body) {
  return body.maxPrepMinutes !== undefined || body.structure !== undefined || body.preferences !== undefined
}

function mapRecommendationError(error) {
  if (!(error instanceof RecommendationDomainError)) return error
  if (error.code === 'INSUFFICIENT_CATEGORY_CAPACITY' || error.code === 'NO_COMPLETE_MENU' || error.code === 'NO_TAG_MATCHING_MENU') return new HttpError(422, error.message)
  return new HttpError(400, error.message)
}

function parseInsightDays(value) {
  const raw = value === undefined ? '7' : String(value)
  requireEnum(raw, ['7', '30'], '统计范围')
  return Number(raw)
}

async function resolveCoverItems(items, mediaUrlService) {
  const list = Array.isArray(items) ? items : []
  const stableValues = list.map((item) => item && (item.coverFileId !== undefined ? item.coverFileId : item.coverUrl))
  if (!mediaUrlService) return list
  const displayValues = await mediaUrlService.resolveValues(stableValues)
  return list.map((item, index) => item && stableValues[index] !== undefined ? { ...item, coverUrl: displayValues[index] } : item)
}

async function resolveRecommendationCovers(recommendation, mediaUrlService) {
  if (!mediaUrlService || !recommendation) return recommendation
  if (Array.isArray(recommendation.items)) return { ...recommendation, items: await resolveCoverItems(recommendation.items, mediaUrlService) }
  if (Array.isArray(recommendation.candidates)) {
    return { ...recommendation, candidates: await Promise.all(recommendation.candidates.map(async (candidate) => ({ ...candidate, items: await resolveCoverItems(candidate.items, mediaUrlService) }))) }
  }
  return recommendation
}

function router({ database, auth, family, mediaUrlService }) {
  const result = express.Router()
  result.get('/ingredients', auth, asyncRoute(async (_request, response) => {
    const [rows] = await database.execute('SELECT id, name, calories_per_100g AS calories, protein_per_100g AS protein, fat_per_100g AS fat, carbohydrate_per_100g AS carbohydrate FROM ingredients ORDER BY name')
    response.json({ ok: true, data: rows })
  }))
  result.get('/menus', auth, family, asyncRoute(async (request, response) => {
    const date = request.query.date || new Date().toISOString().slice(0, 10)
    requireDateOnly(date, '菜单日期')
    const [rows] = await database.execute(`SELECT m.id, m.menu_date AS menuDate, m.meal_type AS mealType, m.status, CASE WHEN r.id IS NULL THEN NULL ELSE mi.id END AS itemId, r.id AS recipeId, r.title, r.category, r.cover_url AS coverFileId, mi.source, mi.note, f.rating AS feedbackRating, f.comment AS feedbackComment FROM menus m LEFT JOIN menu_items mi ON mi.menu_id = m.id LEFT JOIN recipes r ON r.id = mi.recipe_id AND r.family_id = m.family_id LEFT JOIN menu_feedback f ON f.menu_item_id = mi.id AND f.member_id = ? WHERE m.family_id = ? AND m.menu_date = ? ORDER BY FIELD(m.meal_type, 'breakfast', 'lunch', 'dinner'), mi.id`, [request.membership.member_id, request.membership.family_id, date])
    const grouped = {}
    for (const row of rows) { grouped[row.mealType] ||= { id: row.id, menuDate: row.menuDate, mealType: row.mealType, status: row.status, items: [] }; if (row.itemId) { const item = { id: row.itemId, recipeId: row.recipeId, title: row.title, category: row.category, source: row.source, note: row.note, feedback: row.feedbackRating === null || row.feedbackRating === undefined ? null : { rating: Number(row.feedbackRating), comment: row.feedbackComment || '' } }; if (row.coverFileId !== undefined) item.coverFileId = row.coverFileId; grouped[row.mealType].items.push(item) } }
    const data = await Promise.all(Object.values(grouped).map(async (menu) => ({ ...menu, items: await resolveCoverItems(menu.items, mediaUrlService) })))
    response.json({ ok: true, data })
  }))
  result.get('/menus/dates', auth, family, asyncRoute(async (request, response) => {
    const from = String(request.query.from || '').trim()
    const to = String(request.query.to || '').trim()
    requireDateOnly(from, '起始日期')
    requireDateOnly(to, '结束日期')
    if (from > to) throw new HttpError(400, '日期范围不合法')
    const [rows] = await database.execute(`SELECT DATE_FORMAT(m.menu_date, '%Y-%m-%d') AS menuDate, COUNT(mi.id) AS itemCount, COUNT(DISTINCT m.id) AS menuCount FROM menus m LEFT JOIN menu_items mi ON mi.menu_id = m.id WHERE m.family_id = ? AND m.menu_date BETWEEN ? AND ? GROUP BY m.menu_date HAVING COUNT(mi.id) > 0 ORDER BY m.menu_date`, [request.membership.family_id, from, to])
    response.json({ ok: true, data: rows.map((row) => ({ ...row, menuDate: normalizeSqlDate(row.menuDate), itemCount: Number(row.itemCount || 0), menuCount: Number(row.menuCount || 0), hasMenu: Number(row.itemCount || 0) > 0 })) })
  }))
  result.post('/menus/items', auth, family, asyncRoute(async (request, response) => {
    requireFields(request.body, ['menuDate', 'mealType', 'recipeId'])
    requireDateOnly(request.body.menuDate, '菜单日期')
    requireEnum(request.body.mealType, ['breakfast', 'lunch', 'dinner'], '餐次')
    requirePositiveInteger(request.body.recipeId, '菜谱ID')
    const connection = await database.getConnection()
    try {
      await connection.beginTransaction()
      const item = await addMenuItem({
        connection,
        familyId: request.membership.family_id,
        memberId: request.membership.member_id,
        menuDate: request.body.menuDate,
        mealType: request.body.mealType,
        recipeId: request.body.recipeId,
        note: request.body.note || ''
      })
      await connection.commit()
      response.status(item.status === 'created' ? 201 : 200).json({ ok: true, data: item })
    } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
  }))
  result.delete('/menus/items/:id', auth, family, asyncRoute(async (request, response) => { requirePositiveInteger(request.params.id, '菜单项ID'); const [deleted] = await database.execute('DELETE mi FROM menu_items mi JOIN menus m ON m.id = mi.menu_id WHERE mi.id = ? AND m.family_id = ?', [request.params.id, request.membership.family_id]); if (!deleted.affectedRows) throw new HttpError(404, '菜单项不存在'); response.json({ ok: true, data: { id: Number(request.params.id) } }) }))
  result.post('/recommendations', auth, family, asyncRoute(async (request, response) => {
    const body = request.body || {}
    const menuDate = body.menuDate === undefined ? new Date().toISOString().slice(0, 10) : body.menuDate
    const mealType = body.mealType === undefined ? 'dinner' : body.mealType
    const peopleCount = body.peopleCount === undefined ? 2 : body.peopleCount
    requireDateOnly(menuDate, '菜单日期')
    requireEnum(mealType, ['breakfast', 'lunch', 'dinner'], '餐次')
    requireIntegerRange(peopleCount, 1, 12, '用餐人数')

    if (isCanonicalRecommendationRequest(body)) {
      if (body.maxCookMinutes !== undefined || body.mode !== undefined) throw new HttpError(400, '新旧推荐参数不能混用')
      requireFields(body, ['maxPrepMinutes', 'structure'])
      requireIntegerRange(body.maxPrepMinutes, 10, 480, '最大准备时间')
      const connection = await database.getConnection()
      try {
        await connection.beginTransaction()
        let preferences
        let recommendation
        try {
          preferences = await validatePreferenceTagIds(connection, request.membership.family_id, body.preferences === undefined ? {} : body.preferences)
          recommendation = await generateMenuCandidatesFromDatabase({
            connection,
            familyId: request.membership.family_id,
            memberId: request.membership.member_id,
            activeMember: { id: request.membership.member_id, familyId: request.membership.family_id, status: 'active' },
            menuDate,
            mealType,
            peopleCount: Number(peopleCount),
            maxPrepMinutes: Number(body.maxPrepMinutes),
            structure: body.structure,
            preferences,
            explorationSeed: randomUUID()
          })
        } catch (error) { throw mapRecommendationError(error) }
        const persisted = await persistCanonicalRecommendationRun({
          connection,
          familyId: request.membership.family_id,
          memberId: request.membership.member_id,
          request: { menuDate, mealType, peopleCount: Number(peopleCount), maxPrepMinutes: Number(body.maxPrepMinutes), structure: body.structure, preferences },
          recommendation
        })
        await connection.commit()
        response.status(201).json({ ok: true, data: await resolveRecommendationCovers(persisted, mediaUrlService) })
      } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
      return
    }

    const mode = body.mode === undefined ? 'balanced' : body.mode
    const maxCookMinutes = body.maxCookMinutes === undefined ? 90 : body.maxCookMinutes
    requireEnum(mode, ['balanced', 'healthy', 'quick'], '推荐模式')
    requireIntegerRange(maxCookMinutes, 10, 480, '最大烹饪时间')
    const month = Number(String(menuDate).slice(5, 7))
    const [rows] = await database.execute(`SELECT r.id, r.title, r.category, r.cook_minutes AS cookMinutes, r.difficulty, r.cover_url AS coverFileId, GROUP_CONCAT(ri.ingredient_id) AS ingredientIds FROM recipes r LEFT JOIN recipe_ingredients ri ON ri.recipe_id = r.id WHERE r.family_id = ? AND r.status = 'active' GROUP BY r.id`, [request.membership.family_id])
    const [restricted] = await database.execute(`SELECT DISTINCT mir.ingredient_id FROM member_ingredient_restrictions mir JOIN family_members fm ON fm.id = mir.member_id WHERE fm.family_id = ? AND fm.status = 'active'`, [request.membership.family_id])
    const [preferenceRows] = await database.execute(`SELECT fm.id AS memberId, mcp.category, mcp.preference_score AS preferenceScore FROM family_members fm LEFT JOIN member_category_preferences mcp ON mcp.member_id = fm.id WHERE fm.family_id = ? AND fm.status = 'active'`, [request.membership.family_id])
    const familyPreferenceScores = aggregateFamilyPreferences(preferenceRows)
    const hasFamilyPreferences = preferenceRows.some((row) => row.category !== null && row.category !== undefined)
    const dishes = rows.map((row) => ({ ...row, coverUrl: row.coverFileId || null, ingredientIds: row.ingredientIds ? row.ingredientIds.split(',').map(Number) : [], seasonalMonths: [month], nutrition: { protein: 10, vegetables: row.category === '素菜' ? 3 : 1 } }))
    const recommendation = buildRecommendation({ dishes, restrictedIngredientIds: restricted.map((item) => item.ingredient_id), familyPreferenceScores, hasFamilyPreferences, month, peopleCount: Number(peopleCount), maxCookMinutes: Number(maxCookMinutes), mode })
    if (!recommendation.ok) return response.status(422).json(recommendation)
    const connection = await database.getConnection()
    try {
      await connection.beginTransaction()
      const runId = await persistRecommendationRun({ connection, familyId: request.membership.family_id, memberId: request.membership.member_id, menuDate, mealType, peopleCount: Number(peopleCount), maxCookMinutes: Number(maxCookMinutes), mode, recommendation })
      await connection.commit()
      response.json({ ok: true, data: await resolveRecommendationCovers({ ...recommendation, runId }, mediaUrlService) })
    } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
  }))
  result.post('/recommendations/tag-availability', auth, family, asyncRoute(async (request, response) => {
    const body = request.body || {}
    requireFields(body, ['maxPrepMinutes', 'structure'])
    requireDateOnly(body.menuDate === undefined ? new Date().toISOString().slice(0, 10) : body.menuDate, '菜单日期')
    requireEnum(body.mealType === undefined ? 'dinner' : body.mealType, ['breakfast', 'lunch', 'dinner'], '餐次')
    requireIntegerRange(body.peopleCount === undefined ? 2 : body.peopleCount, 1, 12, '用餐人数')
    requireIntegerRange(body.maxPrepMinutes, 10, 480, '最大准备时间')
    const connection = await database.getConnection()
    try {
      await connection.beginTransaction()
      const preferences = await validatePreferenceTagIds(connection, request.membership.family_id, body.preferences === undefined ? {} : body.preferences)
      const [tagRows] = await connection.execute(`
        SELECT id, name, code, kind
        FROM tag_definitions
        WHERE status = 'active' AND (family_id IS NULL OR family_id = ?)
        ORDER BY kind, id
      `, [request.membership.family_id])
      const [recipes, restrictedIngredientIds, lowRatedRecipeIds] = await Promise.all([
        loadRecipeDomainData(connection, { familyId: request.membership.family_id }),
        loadActiveFamilyRestrictionIds(connection, { familyId: request.membership.family_id }),
        loadLowRatedRecipeIds(connection, { familyId: request.membership.family_id, memberId: request.membership.member_id })
      ])
      const availableIds = new Set(getAvailableTagIds({
        familyId: request.membership.family_id,
        structure: body.structure,
        preferences,
        recipes,
        restrictedIngredientIds,
        lowRatedRecipeIds
      }, tagRows.map((row) => Number(row.id))))
      await connection.rollback()
      response.json({ ok: true, data: {
        selectedTagIds: preferences.selectedTagIds,
        tags: tagRows.map((row) => ({ id: Number(row.id), name: row.name, code: row.code || null, kind: row.kind, available: availableIds.has(Number(row.id)) }))
      } })
    } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
  }))
  result.get('/recommendations/:id/candidates/:rank', auth, family, asyncRoute(async (request, response) => {
    requirePositiveInteger(request.params.id, '推荐批次ID')
    requirePositiveInteger(request.params.rank, '候选编号')
    const data = await loadPersistedCandidate({ connection: database, familyId: request.membership.family_id, runId: Number(request.params.id), rank: Number(request.params.rank) })
    response.json({ ok: true, data: await resolveRecommendationCovers(data, mediaUrlService) })
  }))
  result.post('/recommendations/:id/apply', auth, family, asyncRoute(async (request, response) => {
    requirePositiveInteger(request.params.id, '推荐批次ID')
    if (request.body && request.body.candidateId !== undefined) requirePositiveInteger(request.body.candidateId, '候选ID')
    const connection = await database.getConnection()
    try {
      await connection.beginTransaction()
      const data = await applyRecommendationRequest({ connection, familyId: request.membership.family_id, memberId: request.membership.member_id, runId: Number(request.params.id), body: request.body || {} })
      await connection.commit()
      response.json({ ok: true, data })
    } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
  }))
  result.get('/insights', auth, family, asyncRoute(async (request, response) => {
    const rangeDays = parseInsightDays(request.query.days)
    const intervalDays = rangeDays - 1
    const familyId = request.membership.family_id
    const dateFilter = `m.menu_date BETWEEN DATE_SUB(CURDATE(), INTERVAL ${intervalDays} DAY) AND CURDATE()`
    const [popular] = await database.execute(
      `SELECT r.id, r.title, r.category, COUNT(m.id) AS usedCount
       FROM recipes r
       LEFT JOIN menu_items mi ON mi.recipe_id = r.id
       LEFT JOIN menus m ON m.id = mi.menu_id
         AND m.family_id = ?
         AND ${dateFilter}
       WHERE r.family_id = ? AND r.status = 'active'
       GROUP BY r.id
       HAVING COUNT(m.id) > 0
       ORDER BY usedCount DESC, r.title
       LIMIT 10`,
      [familyId, familyId]
    )
    const [summary] = await database.execute(
      `SELECT COUNT(DISTINCT m.id) AS menuCount,
              COUNT(mi.id) AS itemCount,
              COALESCE(AVG(f.rating), 0) AS averageRating
       FROM menus m
       LEFT JOIN menu_items mi ON mi.menu_id = m.id
       LEFT JOIN menu_feedback f ON f.menu_item_id = mi.id
       WHERE m.family_id = ? AND ${dateFilter}`,
      [familyId]
    )
    const insightSummary = {
      ...(summary[0] || { menuCount: 0, itemCount: 0, averageRating: 0 }),
      menuCount: Number(summary[0]?.menuCount || 0),
      itemCount: Number(summary[0]?.itemCount || 0),
      averageRating: Number(Number(summary[0]?.averageRating || 0).toFixed(1))
    }
    response.json({
      ok: true,
      data: {
        rangeDays,
        popular: popular.map((item) => ({ ...item, usedCount: Number(item.usedCount || 0) })),
        summary: insightSummary
      }
    })
  }))
  return result
}
module.exports = { router, resolveCoverItems, resolveRecommendationCovers }
