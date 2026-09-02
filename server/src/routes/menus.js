const express = require('express')
const { HttpError, requireFields } = require('../http')
const { buildRecommendation } = require('../services/recommendation-service')
const asyncRoute = (handler) => (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next)

function router({ database, auth, family }) {
  const result = express.Router()
  result.get('/ingredients', auth, asyncRoute(async (_request, response) => {
    const [rows] = await database.execute('SELECT id, name, calories_per_100g AS calories, protein_per_100g AS protein, fat_per_100g AS fat, carbohydrate_per_100g AS carbohydrate FROM ingredients ORDER BY name')
    response.json({ ok: true, data: rows })
  }))
  result.get('/menus', auth, family, asyncRoute(async (request, response) => {
    const date = request.query.date || new Date().toISOString().slice(0, 10)
    const [rows] = await database.execute(`SELECT m.id, m.menu_date AS menuDate, m.meal_type AS mealType, m.status, mi.id AS itemId, mi.recipe_id AS recipeId, r.title, r.category, mi.source, mi.note FROM menus m LEFT JOIN menu_items mi ON mi.menu_id = m.id LEFT JOIN recipes r ON r.id = mi.recipe_id WHERE m.family_id = ? AND m.menu_date = ? ORDER BY FIELD(m.meal_type, 'breakfast', 'lunch', 'dinner'), mi.id`, [request.membership.family_id, date])
    const grouped = {}
    for (const row of rows) { grouped[row.mealType] ||= { id: row.id, menuDate: row.menuDate, mealType: row.mealType, status: row.status, items: [] }; if (row.itemId) grouped[row.mealType].items.push({ id: row.itemId, recipeId: row.recipeId, title: row.title, category: row.category, source: row.source, note: row.note }) }
    response.json({ ok: true, data: Object.values(grouped) })
  }))
  result.post('/menus/items', auth, family, asyncRoute(async (request, response) => {
    requireFields(request.body, ['menuDate', 'mealType', 'recipeId'])
    const connection = await database.getConnection()
    try { await connection.beginTransaction(); const [menu] = await connection.execute(`INSERT INTO menus (family_id, created_by_member_id, menu_date, meal_type) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`, [request.membership.family_id, request.membership.member_id, request.body.menuDate, request.body.mealType]); await connection.execute('INSERT INTO menu_items (menu_id, recipe_id, note) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE note = VALUES(note)', [menu.insertId, request.body.recipeId, request.body.note || '']); await connection.commit(); response.status(201).json({ ok: true, data: { menuId: menu.insertId } }) } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
  }))
  result.delete('/menus/items/:id', auth, family, asyncRoute(async (request, response) => { const [rows] = await database.execute('SELECT mi.id FROM menu_items mi JOIN menus m ON m.id = mi.menu_id WHERE mi.id = ? AND m.family_id = ?', [request.params.id, request.membership.family_id]); if (!rows[0]) throw new HttpError(404, '菜单项不存在'); await database.execute('DELETE FROM menu_items WHERE id = ?', [request.params.id]); response.json({ ok: true, data: { id: Number(request.params.id) } }) }))
  result.post('/recommendations', auth, family, asyncRoute(async (request, response) => {
    const body = request.body || {}; const month = Number(String(body.menuDate || new Date().toISOString().slice(0, 10)).slice(5, 7)); const peopleCount = Number(body.peopleCount || 2); const maxCookMinutes = Number(body.maxCookMinutes || 90)
    const [rows] = await database.execute(`SELECT r.id, r.title, r.category, r.cook_minutes AS cookMinutes, r.difficulty, GROUP_CONCAT(ri.ingredient_id) AS ingredientIds FROM recipes r LEFT JOIN recipe_ingredients ri ON ri.recipe_id = r.id WHERE r.family_id = ? AND r.status = 'active' GROUP BY r.id`, [request.membership.family_id])
    const [restricted] = await database.execute(`SELECT DISTINCT mir.ingredient_id FROM member_ingredient_restrictions mir JOIN family_members fm ON fm.id = mir.member_id WHERE fm.family_id = ? AND fm.status = 'active'`, [request.membership.family_id])
    const dishes = rows.map((row) => ({ ...row, ingredientIds: row.ingredientIds ? row.ingredientIds.split(',').map(Number) : [], seasonalMonths: [month], nutrition: { protein: 10, vegetables: row.category === '素菜' ? 3 : 1 } }))
    const recommendation = buildRecommendation({ dishes, restrictedIngredientIds: restricted.map((item) => item.ingredient_id), month, peopleCount, maxCookMinutes, mode: body.mode || 'balanced' }); if (!recommendation.ok) return response.status(422).json(recommendation); response.json({ ok: true, data: recommendation })
  }))
  result.get('/insights', auth, family, asyncRoute(async (request, response) => { const [popular] = await database.execute(`SELECT r.id, r.title, r.category, COUNT(mi.id) AS usedCount FROM recipes r LEFT JOIN menu_items mi ON mi.recipe_id = r.id LEFT JOIN menus m ON m.id = mi.menu_id AND m.family_id = ? WHERE r.family_id = ? AND r.status = 'active' GROUP BY r.id ORDER BY usedCount DESC, r.title LIMIT 10`, [request.membership.family_id, request.membership.family_id]); const [summary] = await database.execute(`SELECT COUNT(DISTINCT m.id) AS menuCount, COUNT(mi.id) AS itemCount, COALESCE(AVG(f.rating), 0) AS averageRating FROM menus m LEFT JOIN menu_items mi ON mi.menu_id = m.id LEFT JOIN menu_feedback f ON f.menu_item_id = mi.id WHERE m.family_id = ?`, [request.membership.family_id]); response.json({ ok: true, data: { popular, summary: summary[0] } }) }))
  return result
}
module.exports = { router }
