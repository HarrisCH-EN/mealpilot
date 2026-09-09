const express = require('express')
const { HttpError, requireFields, requirePositiveInteger, requireIntegerRange, requireEnum } = require('../http')
const { normalizeTagIds, readRecipeTagIds, validateRecipeTagIds, replaceRecipeTags, loadRecipeTags, attachRecipeTags } = require('../services/tag-service')
const asyncRoute = (handler) => (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next)
const MAX_RECIPE_TAGS = 3

function router({ database, auth, family }) {
  const result = express.Router()
  result.get('/recipes', auth, family, asyncRoute(async (request, response) => {
    const params = [request.membership.family_id]
    let sql = `SELECT id, title, category, description, steps, cook_minutes AS cookMinutes, difficulty, servings, cover_url AS coverUrl, created_by_member_id AS createdByMemberId FROM recipes WHERE family_id = ? AND status = 'active'`
    if (request.query.category) { sql += ' AND category = ?'; params.push(request.query.category) }
    if (request.query.keyword) { sql += ' AND title LIKE ?'; params.push(`%${request.query.keyword}%`) }
    sql += ' ORDER BY updated_at DESC'
    const [rows] = await database.execute(sql, params)
    const tagRows = await loadRecipeTags(database, rows.map((row) => row.id), request.membership.family_id)
    response.json({ ok: true, data: attachRecipeTags(rows, tagRows) })
  }))

  result.get('/recipes/:id', auth, family, asyncRoute(async (request, response) => {
    requirePositiveInteger(request.params.id, '菜谱ID')
    const [rows] = await database.execute(`SELECT id, title, category, description, steps, cook_minutes AS cookMinutes, difficulty, servings, cover_url AS coverUrl, created_by_member_id AS createdByMemberId FROM recipes WHERE id = ? AND family_id = ? AND status = 'active'`, [request.params.id, request.membership.family_id])
    if (!rows[0]) throw new HttpError(404, '菜谱不存在')
    const [ingredients] = await database.execute(`SELECT ri.ingredient_id AS ingredientId, i.name, ri.amount_grams AS amountGrams, ri.note FROM recipe_ingredients ri JOIN ingredients i ON i.id = ri.ingredient_id WHERE ri.recipe_id = ? ORDER BY i.name`, [request.params.id])
    const tagRows = await loadRecipeTags(database, [rows[0].id], request.membership.family_id)
    response.json({ ok: true, data: { ...attachRecipeTags(rows, tagRows)[0], ingredients } })
  }))

  result.post('/recipes', auth, family, asyncRoute(async (request, response) => {
    requireFields(request.body, ['title', 'category', 'cookMinutes', 'difficulty'])
    validateRecipeContent(request.body)
    const allowed = ['荤菜', '素菜', '汤', '主食']
    if (!allowed.includes(request.body.category)) throw new HttpError(400, '分类不合法')
    validateCoverUrl(request.body.coverUrl)
    const tagIds = normalizeTagIds(request.body.tagIds)
    validateRecipeTagCount(tagIds)
    const created = await withTransaction(database, async (connection) => {
      await validateIngredientsExist(connection, request.body.ingredients)
      const [inserted] = await connection.execute(`INSERT INTO recipes (family_id, created_by_member_id, title, category, description, steps, cook_minutes, difficulty, servings, cover_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [request.membership.family_id, request.membership.member_id, String(request.body.title).trim(), request.body.category, request.body.description || '', request.body.steps || '', Number(request.body.cookMinutes), Number(request.body.difficulty), Number(request.body.servings || 2), request.body.coverUrl || ''])
      await saveIngredients(connection, inserted.insertId, request.body.ingredients)
      if (tagIds && tagIds.length) {
        await validateRecipeTagIds(connection, request.membership.family_id, tagIds)
        await replaceRecipeTags(connection, inserted.insertId, tagIds)
      }
      return inserted
    })
    response.status(201).json({ ok: true, data: { id: created.insertId } })
  }))

  result.put('/recipes/:id', auth, family, asyncRoute(async (request, response) => {
    requirePositiveInteger(request.params.id, '菜谱ID')
    const [rows] = await database.execute(`SELECT created_by_member_id AS author, cover_url AS coverUrl FROM recipes WHERE id = ? AND family_id = ? AND status = 'active'`, [request.params.id, request.membership.family_id])
    if (!rows[0]) throw new HttpError(404, '菜谱不存在')
    if (request.membership.role !== 'owner' && rows[0].author !== request.membership.member_id) throw new HttpError(403, '只能编辑自己创建的菜谱')
    requireFields(request.body, ['title', 'category', 'cookMinutes', 'difficulty'])
    validateRecipeContent(request.body)
    validateCoverUrl(request.body.coverUrl)
    const tagIds = normalizeTagIds(request.body.tagIds)
    validateRecipeTagCount(tagIds)
    const coverUrl = request.body.coverUrl === undefined ? (rows[0].coverUrl || '') : (request.body.coverUrl || '')
    await withTransaction(database, async (connection) => {
      await validateIngredientsExist(connection, request.body.ingredients)
      await connection.execute(`UPDATE recipes SET title = ?, category = ?, description = ?, steps = ?, cook_minutes = ?, difficulty = ?, servings = ?, cover_url = ? WHERE id = ? AND family_id = ? AND status = 'active'`, [String(request.body.title).trim(), request.body.category, request.body.description || '', request.body.steps || '', Number(request.body.cookMinutes), Number(request.body.difficulty), Number(request.body.servings || 2), coverUrl, request.params.id, request.membership.family_id])
      await connection.execute('DELETE FROM recipe_ingredients WHERE recipe_id = ?', [request.params.id])
      await saveIngredients(connection, request.params.id, request.body.ingredients)
      if (tagIds !== undefined) {
        const existingTagIds = await readRecipeTagIds(connection, request.params.id)
        await validateRecipeTagIds(connection, request.membership.family_id, tagIds, existingTagIds)
        await replaceRecipeTags(connection, request.params.id, tagIds)
      }
    })
    response.json({ ok: true, data: { id: Number(request.params.id) } })
  }))

  result.delete('/recipes/:id', auth, family, asyncRoute(async (request, response) => {
    requirePositiveInteger(request.params.id, '菜谱ID')
    const [rows] = await database.execute(`SELECT created_by_member_id AS author FROM recipes WHERE id = ? AND family_id = ? AND status = 'active'`, [request.params.id, request.membership.family_id])
    if (!rows[0]) throw new HttpError(404, '菜谱不存在')
    if (request.membership.role !== 'owner' && rows[0].author !== request.membership.member_id) throw new HttpError(403, '只能删除自己创建的菜谱')
    await database.execute(`UPDATE recipes SET status = 'deleted' WHERE id = ? AND family_id = ? AND status = 'active'`, [request.params.id, request.membership.family_id])
    response.json({ ok: true, data: { id: Number(request.params.id) } })
  }))
  return result
}

function validateRecipeContent(body) {
  if (!String(body.title || '').trim()) throw new HttpError(400, '菜名不能为空')
  if (!String(body.steps || '').trim()) throw new HttpError(400, '至少填写一个制作步骤')
  requireEnum(body.category, ['荤菜', '素菜', '汤', '主食'], '分类')
  requireIntegerRange(body.cookMinutes, 1, 360, '烹饪时间')
  requireIntegerRange(body.difficulty, 1, 5, '难度')
  if (body.servings !== undefined && body.servings !== null) requireIntegerRange(body.servings, 1, 12, '份数')
  validateIngredientItems(body.ingredients)
}

function validateCoverUrl(coverUrl) {
  if (coverUrl === undefined || coverUrl === null || coverUrl === '') return
  const isUploadedCover = /^\/uploads\/recipes\/[a-f0-9-]+\.(?:jpg|jpeg|png|webp)$/i.test(coverUrl)
  const isBundledCover = /^\/assets\/recipes\/[a-z0-9]+(?:-[a-z0-9]+)*\.(?:jpg|jpeg|png|webp)$/i.test(coverUrl)
  if (typeof coverUrl !== 'string' || (!isUploadedCover && !isBundledCover)) throw new HttpError(400, '封面地址不合法')
}

function validateRecipeTagCount(tagIds) {
  if (tagIds !== undefined && tagIds.length > MAX_RECIPE_TAGS) {
    throw new HttpError(400, '一道菜最多选择3个最有代表性的标签')
  }
}

function validateIngredientItems(ingredients) {
  if (!Array.isArray(ingredients) || !ingredients.length) throw new HttpError(400, '至少添加一种食材')
  const ingredientIds = new Set()
  for (const item of ingredients) {
    const ingredientId = Number(item?.ingredientId)
    const amountGrams = Number(item?.amountGrams)
    if (!Number.isInteger(ingredientId) || ingredientId <= 0) throw new HttpError(400, '食材参数不合法')
    if (!Number.isFinite(amountGrams) || amountGrams <= 0) throw new HttpError(400, '食材用量必须大于 0')
    if (ingredientIds.has(ingredientId)) throw new HttpError(400, '同一食材不能重复添加')
    ingredientIds.add(ingredientId)
  }
}

async function validateIngredientsExist(connection, ingredients) {
  const ids = ingredients.map((item) => Number(item.ingredientId))
  const placeholders = ids.map(() => '?').join(', ')
  const [rows] = await connection.execute(`SELECT id FROM ingredients WHERE id IN (${placeholders})`, ids)
  if (rows.length !== ids.length) throw new HttpError(400, '食材不存在')
}

async function saveIngredients(connection, recipeId, ingredients) {
  for (const item of ingredients) {
    await connection.execute('INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount_grams, note) VALUES (?, ?, ?, ?)', [recipeId, Number(item.ingredientId), Number(item.amountGrams), item.note || ''])
  }
}

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

module.exports = { router }
