const express = require('express')
const { HttpError, requireFields } = require('../http')
const asyncRoute = (handler) => (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next)

function router({ database, auth, family }) {
  const result = express.Router()
  result.get('/recipes', auth, family, asyncRoute(async (request, response) => {
    const params = [request.membership.family_id]
    let sql = `SELECT id, title, category, description, steps, cook_minutes AS cookMinutes, difficulty, servings, cover_url AS coverUrl, created_by_member_id AS createdByMemberId FROM recipes WHERE family_id = ? AND status = 'active'`
    if (request.query.category) { sql += ' AND category = ?'; params.push(request.query.category) }
    if (request.query.keyword) { sql += ' AND title LIKE ?'; params.push(`%${request.query.keyword}%`) }
    sql += ' ORDER BY updated_at DESC'
    const [rows] = await database.execute(sql, params)
    response.json({ ok: true, data: rows })
  }))

  result.get('/recipes/:id', auth, family, asyncRoute(async (request, response) => {
    const [rows] = await database.execute(`SELECT id, title, category, description, steps, cook_minutes AS cookMinutes, difficulty, servings, cover_url AS coverUrl, created_by_member_id AS createdByMemberId FROM recipes WHERE id = ? AND family_id = ? AND status = 'active'`, [request.params.id, request.membership.family_id])
    if (!rows[0]) throw new HttpError(404, '菜谱不存在')
    const [ingredients] = await database.execute(`SELECT ri.ingredient_id AS ingredientId, i.name, ri.amount_grams AS amountGrams, ri.note FROM recipe_ingredients ri JOIN ingredients i ON i.id = ri.ingredient_id WHERE ri.recipe_id = ? ORDER BY i.name`, [request.params.id])
    response.json({ ok: true, data: { ...rows[0], ingredients } })
  }))

  result.post('/recipes', auth, family, asyncRoute(async (request, response) => {
    requireFields(request.body, ['title', 'category', 'cookMinutes', 'difficulty'])
    const allowed = ['荤菜', '素菜', '汤', '主食']
    if (!allowed.includes(request.body.category)) throw new HttpError(400, '分类不合法')
    const [created] = await database.execute(`INSERT INTO recipes (family_id, created_by_member_id, title, category, description, steps, cook_minutes, difficulty, servings) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [request.membership.family_id, request.membership.member_id, String(request.body.title).trim(), request.body.category, request.body.description || '', request.body.steps || '', Number(request.body.cookMinutes), Number(request.body.difficulty), Number(request.body.servings || 2)])
    await saveIngredients(database, created.insertId, request.body.ingredients || [])
    response.status(201).json({ ok: true, data: { id: created.insertId } })
  }))

  result.put('/recipes/:id', auth, family, asyncRoute(async (request, response) => {
    const [rows] = await database.execute(`SELECT created_by_member_id AS author FROM recipes WHERE id = ? AND family_id = ? AND status = 'active'`, [request.params.id, request.membership.family_id])
    if (!rows[0]) throw new HttpError(404, '菜谱不存在')
    if (request.membership.role !== 'owner' && rows[0].author !== request.membership.member_id) throw new HttpError(403, '只能编辑自己创建的菜谱')
    requireFields(request.body, ['title', 'category', 'cookMinutes', 'difficulty'])
    await database.execute(`UPDATE recipes SET title = ?, category = ?, description = ?, steps = ?, cook_minutes = ?, difficulty = ?, servings = ? WHERE id = ?`, [String(request.body.title).trim(), request.body.category, request.body.description || '', request.body.steps || '', Number(request.body.cookMinutes), Number(request.body.difficulty), Number(request.body.servings || 2), request.params.id])
    if (Array.isArray(request.body.ingredients)) { await database.execute('DELETE FROM recipe_ingredients WHERE recipe_id = ?', [request.params.id]); await saveIngredients(database, request.params.id, request.body.ingredients) }
    response.json({ ok: true, data: { id: Number(request.params.id) } })
  }))

  result.delete('/recipes/:id', auth, family, asyncRoute(async (request, response) => {
    const [rows] = await database.execute(`SELECT created_by_member_id AS author FROM recipes WHERE id = ? AND family_id = ? AND status = 'active'`, [request.params.id, request.membership.family_id])
    if (!rows[0]) throw new HttpError(404, '菜谱不存在')
    if (request.membership.role !== 'owner' && rows[0].author !== request.membership.member_id) throw new HttpError(403, '只能删除自己创建的菜谱')
    await database.execute(`UPDATE recipes SET status = 'deleted' WHERE id = ?`, [request.params.id])
    response.json({ ok: true, data: { id: Number(request.params.id) } })
  }))
  return result
}

async function saveIngredients(database, recipeId, ingredients) {
  for (const item of ingredients) {
    if (!item.ingredientId || Number(item.amountGrams) <= 0) throw new HttpError(400, '食材用量必须大于 0')
    await database.execute('INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount_grams, note) VALUES (?, ?, ?, ?)', [recipeId, item.ingredientId, item.amountGrams, item.note || ''])
  }
}

module.exports = { router }
