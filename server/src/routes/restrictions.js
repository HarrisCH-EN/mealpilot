const express = require('express')
const { HttpError, requirePositiveInteger } = require('../http')

const asyncRoute = (handler) => (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next)

async function findActiveMember(database, memberId, familyId) {
  const [rows] = await database.execute(
    `SELECT fm.id, fm.user_id AS userId, fm.family_id AS familyId, fm.role
     FROM family_members fm
     WHERE fm.id = ? AND fm.family_id = ? AND fm.status = 'active'`,
    [memberId, familyId]
  )
  if (!rows[0]) throw new HttpError(404, '家庭成员不存在')
  return rows[0]
}

function assertCanManage(request, member) {
  const currentMemberId = Number(request.membership.member_id)
  if (request.membership.role !== 'admin' && currentMemberId !== Number(member.id)) {
    throw new HttpError(403, '无权管理该成员的忌口')
  }
}

async function findIngredient(database, ingredientId) {
  const [rows] = await database.execute('SELECT id, name FROM ingredients WHERE id = ?', [ingredientId])
  if (!rows[0]) throw new HttpError(404, '食材不存在')
  return rows[0]
}

async function readRestrictions(database, memberId) {
  const [rows] = await database.execute(
    `SELECT mir.ingredient_id AS ingredientId, i.name AS ingredientName
     FROM member_ingredient_restrictions mir
     JOIN ingredients i ON i.id = mir.ingredient_id
     WHERE mir.member_id = ?
     ORDER BY i.name`,
    [memberId]
  )
  return rows
}

function restrictionData(status, ingredient) {
  return {
    status,
    ingredientId: Number(ingredient.id || ingredient.ingredientId),
    ingredientName: ingredient.name || ingredient.ingredientName
  }
}

function router({ database, auth, family }) {
  const result = express.Router()

  result.get('/family-members/:memberId/restrictions', auth, family, asyncRoute(async (request, response) => {
    requirePositiveInteger(request.params.memberId, '成员ID')
    const member = await findActiveMember(database, Number(request.params.memberId), request.membership.family_id)
    response.json({ ok: true, data: await readRestrictions(database, member.id) })
  }))

  result.post('/family-members/:memberId/restrictions', auth, family, asyncRoute(async (request, response) => {
    requirePositiveInteger(request.params.memberId, '成员ID')
    requirePositiveInteger(request.body && request.body.ingredientId, '食材ID')
    const member = await findActiveMember(database, Number(request.params.memberId), request.membership.family_id)
    assertCanManage(request, member)
    const ingredient = await findIngredient(database, Number(request.body.ingredientId))
    try {
      await database.execute(
        'INSERT INTO member_ingredient_restrictions (member_id, ingredient_id) VALUES (?, ?)',
        [member.id, ingredient.id]
      )
      response.status(201).json({ ok: true, data: restrictionData('created', ingredient) })
    } catch (error) {
      if (error && error.code === 'ER_DUP_ENTRY') {
        const [rows] = await database.execute(
          'SELECT 1 FROM member_ingredient_restrictions WHERE member_id = ? AND ingredient_id = ?',
          [member.id, ingredient.id]
        )
        if (rows[0]) return response.json({ ok: true, data: restrictionData('already-present', ingredient) })
      }
      throw error
    }
  }))

  result.delete('/family-members/:memberId/restrictions/:ingredientId', auth, family, asyncRoute(async (request, response) => {
    requirePositiveInteger(request.params.memberId, '成员ID')
    requirePositiveInteger(request.params.ingredientId, '食材ID')
    const member = await findActiveMember(database, Number(request.params.memberId), request.membership.family_id)
    assertCanManage(request, member)
    const ingredient = await findIngredient(database, Number(request.params.ingredientId))
    const [deleted] = await database.execute(
      'DELETE FROM member_ingredient_restrictions WHERE member_id = ? AND ingredient_id = ?',
      [member.id, ingredient.id]
    )
    response.json({ ok: true, data: restrictionData(deleted.affectedRows ? 'removed' : 'already-absent', ingredient) })
  }))

  result.get('/families/current/restrictions', auth, family, asyncRoute(async (request, response) => {
    const [rows] = await database.execute(
      `SELECT DISTINCT mir.ingredient_id AS ingredientId, i.name AS ingredientName
       FROM member_ingredient_restrictions mir
       JOIN family_members fm ON fm.id = mir.member_id
       JOIN ingredients i ON i.id = mir.ingredient_id
       WHERE fm.family_id = ? AND fm.status = 'active'
       ORDER BY i.name`,
      [request.membership.family_id]
    )
    response.json({ ok: true, data: rows })
  }))

  return result
}

module.exports = { router }
