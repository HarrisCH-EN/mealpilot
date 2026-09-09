const express = require('express')
const { HttpError, requirePositiveInteger, requireIntegerRange } = require('../http')

const asyncRoute = (handler) => (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next)

function router({ database, auth, family }) {
  const result = express.Router()

  result.get('/menu-items/:menuItemId/feedback', auth, family, asyncRoute(async (request, response) => {
    const menuItemId = parseMenuItemId(request.params.menuItemId)
    await assertMenuItemInFamily(database, menuItemId, request.membership.family_id)
    const [rows] = await database.execute('SELECT rating, comment FROM menu_feedback WHERE menu_item_id = ? AND member_id = ?', [menuItemId, request.membership.member_id])
    response.json({ ok: true, data: rows[0] || null })
  }))

  result.put('/menu-items/:menuItemId/feedback', auth, family, asyncRoute(async (request, response) => {
    const menuItemId = parseMenuItemId(request.params.menuItemId)
    await assertMenuItemInFamily(database, menuItemId, request.membership.family_id)
    const rating = request.body && request.body.rating
    requireIntegerRange(rating, 1, 5, '评分')
    const comment = request.body && request.body.comment !== undefined ? request.body.comment : ''
    if (typeof comment !== 'string' || comment.length > 200) throw new HttpError(400, '反馈文字不能超过 200 个字符')
    const [existingRows] = await database.execute('SELECT id FROM menu_feedback WHERE menu_item_id = ? AND member_id = ?', [menuItemId, request.membership.member_id])
    await database.execute(
      `INSERT INTO menu_feedback (menu_item_id, member_id, rating, comment) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE rating = VALUES(rating), comment = VALUES(comment)`,
      [menuItemId, request.membership.member_id, Number(rating), comment.trim()]
    )
    response.status(existingRows[0] ? 200 : 201).json({ ok: true, data: { menuItemId, rating: Number(rating), comment: comment.trim(), status: existingRows[0] ? 'updated' : 'created' } })
  }))

  result.delete('/menu-items/:menuItemId/feedback', auth, family, asyncRoute(async (request, response) => {
    const menuItemId = parseMenuItemId(request.params.menuItemId)
    await assertMenuItemInFamily(database, menuItemId, request.membership.family_id)
    const [deleted] = await database.execute(
      `DELETE f FROM menu_feedback f
       JOIN menu_items mi ON mi.id = f.menu_item_id
       JOIN menus m ON m.id = mi.menu_id
       WHERE f.menu_item_id = ? AND f.member_id = ? AND m.family_id = ?`,
      [menuItemId, request.membership.member_id, request.membership.family_id]
    )
    response.json({ ok: true, data: { menuItemId, status: deleted.affectedRows ? 'removed' : 'already-absent' } })
  }))

  return result
}

function parseMenuItemId(value) {
  requirePositiveInteger(value, '菜单项ID')
  return Number(value)
}

async function assertMenuItemInFamily(database, menuItemId, familyId) {
  const [rows] = await database.execute(
    `SELECT mi.id
     FROM menu_items mi JOIN menus m ON m.id = mi.menu_id
     WHERE mi.id = ? AND m.family_id = ?`,
    [menuItemId, familyId]
  )
  if (!rows[0]) throw new HttpError(404, '菜单项不存在')
}

module.exports = { router }
