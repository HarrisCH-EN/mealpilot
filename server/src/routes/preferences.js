const express = require('express')
const { HttpError, requireEnum, requireIntegerRange, requirePositiveInteger } = require('../http')

const CATEGORY_VALUES = ['荤菜', '素菜', '汤', '主食']

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
    throw new HttpError(403, '无权管理该成员的口味偏好')
  }
}

async function readPreferences(database, memberId) {
  const [rows] = await database.execute(
    `SELECT category, preference_score AS preferenceScore
     FROM member_category_preferences
     WHERE member_id = ?
     ORDER BY FIELD(category, '荤菜', '素菜', '汤', '主食')`,
    [memberId]
  )
  return rows.map((row) => ({ ...row, preferenceScore: Number(row.preferenceScore) }))
}

function preferenceData(status, category, preferenceScore) {
  return { status, category, preferenceScore: Number(preferenceScore) }
}

function router({ database, auth, family }) {
  const result = express.Router()

  result.get('/family-members/:memberId/preferences', auth, family, asyncRoute(async (request, response) => {
    requirePositiveInteger(request.params.memberId, '成员ID')
    const member = await findActiveMember(database, Number(request.params.memberId), request.membership.family_id)
    assertCanManage(request, member)
    response.json({ ok: true, data: await readPreferences(database, member.id) })
  }))

  result.put('/family-members/:memberId/preferences/:category', auth, family, asyncRoute(async (request, response) => {
    requirePositiveInteger(request.params.memberId, '成员ID')
    requireEnum(request.params.category, CATEGORY_VALUES, '菜品分类')
    requireIntegerRange(request.body && request.body.preferenceScore, 1, 5, '偏好分数')
    const member = await findActiveMember(database, Number(request.params.memberId), request.membership.family_id)
    assertCanManage(request, member)
    const category = request.params.category
    const preferenceScore = Number(request.body.preferenceScore)
    await database.execute(
      `INSERT INTO member_category_preferences (member_id, category, preference_score)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE preference_score = VALUES(preference_score)`,
      [member.id, category, preferenceScore]
    )
    response.json({ ok: true, data: preferenceData('saved', category, preferenceScore) })
  }))

  result.delete('/family-members/:memberId/preferences/:category', auth, family, asyncRoute(async (request, response) => {
    requirePositiveInteger(request.params.memberId, '成员ID')
    requireEnum(request.params.category, CATEGORY_VALUES, '菜品分类')
    const member = await findActiveMember(database, Number(request.params.memberId), request.membership.family_id)
    assertCanManage(request, member)
    const [deleted] = await database.execute(
      'DELETE FROM member_category_preferences WHERE member_id = ? AND category = ?',
      [member.id, request.params.category]
    )
    response.json({ ok: true, data: preferenceData(deleted.affectedRows ? 'removed' : 'already-absent', request.params.category, 0) })
  }))

  result.get('/families/current/preferences', auth, family, asyncRoute(async (request, response) => {
    const [rows] = await database.execute(
      `SELECT mcp.member_id AS memberId, mcp.category, mcp.preference_score AS preferenceScore
       FROM member_category_preferences mcp
       JOIN family_members fm ON fm.id = mcp.member_id
       WHERE fm.family_id = ? AND fm.status = 'active'
       ORDER BY fm.id, FIELD(mcp.category, '荤菜', '素菜', '汤', '主食')`,
      [request.membership.family_id]
    )
    response.json({
      ok: true,
      data: rows.map((row) => ({ ...row, memberId: Number(row.memberId), preferenceScore: Number(row.preferenceScore) }))
    })
  }))

  return result
}

module.exports = { CATEGORY_VALUES, router }
