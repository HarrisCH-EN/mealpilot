const express = require('express')
const { HttpError, requirePositiveInteger } = require('../http')

const SYSTEM_TAG_ORDER = ['spicy', 'sour', 'sweet', 'seafood', 'fish', 'shrimp', 'crab', 'bake', 'steam', 'fried']
const MAX_TAG_NAME_LENGTH = 40
const asyncRoute = (handler) => (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next)

function normalizeName(value) {
  if (typeof value !== 'string') throw new HttpError(400, '标签名称不合法')
  const name = value.trim()
  if (!name || name.length > MAX_TAG_NAME_LENGTH) throw new HttpError(400, '标签名称不合法')
  return name
}

function tagPayload(row) {
  return {
    id: Number(row.id),
    code: row.code || null,
    name: row.name,
    kind: row.kind,
    ...(row.familyId === undefined ? {} : { familyId: row.familyId === null ? null : Number(row.familyId) }),
    ...(row.createdByMemberId === undefined ? {} : { createdByMemberId: row.createdByMemberId === null ? null : Number(row.createdByMemberId) })
  }
}

async function findTag(database, tagId) {
  const [rows] = await database.execute('SELECT id, family_id AS familyId, kind, code, name, normalized_name AS normalizedName, created_by_member_id AS createdByMemberId FROM tag_definitions WHERE id = ?', [tagId])
  return rows[0] || null
}

function requireFamilyTag(tag, familyId) {
  if (!tag || (tag.kind === 'custom' && Number(tag.familyId) !== Number(familyId))) throw new HttpError(404, '标签不存在')
  return tag
}

function assertCanMutate(request, tag) {
  if (tag.kind === 'system') throw new HttpError(403, '系统标签不可修改')
  if (request.membership.role !== 'owner' && Number(tag.createdByMemberId) !== Number(request.membership.member_id)) throw new HttpError(403, '无权修改该标签')
}

function isDuplicateError(error) {
  return error && (error.code === 'ER_DUP_ENTRY' || error.errno === 1062)
}

function router({ database, auth, family }) {
  const result = express.Router()

  result.get('/tags', auth, family, asyncRoute(async (request, response) => {
    const [rows] = await database.execute(
      `SELECT id, family_id AS familyId, kind, code, name, normalized_name AS normalizedName, created_by_member_id AS createdByMemberId
       FROM tag_definitions
       WHERE (kind = 'system' AND status = 'active') OR (kind = 'custom' AND family_id = ? AND status = 'active')
       ORDER BY CASE WHEN kind = 'system' THEN 0 ELSE 1 END, FIELD(code, 'spicy', 'sour', 'sweet', 'seafood', 'fish', 'shrimp', 'crab', 'bake', 'steam', 'fried'), created_at ASC, id ASC`,
      [request.membership.family_id]
    )
    response.json({
      ok: true,
      data: {
        systemTags: rows.filter((row) => row.kind === 'system').map(tagPayload),
        customTags: rows.filter((row) => row.kind === 'custom').map(tagPayload)
      }
    })
  }))

  result.post('/tags', auth, family, asyncRoute(async (request, response) => {
    const name = normalizeName(request.body && request.body.name)
    const familyId = Number(request.membership.family_id)
    const memberId = Number(request.membership.member_id)
    const [duplicates] = await database.execute('SELECT id FROM tag_definitions WHERE family_id = ? AND normalized_name = ? LIMIT 1', [familyId, name])
    if (duplicates[0]) throw new HttpError(409, '标签名称已存在')
    try {
      const [inserted] = await database.execute(
        `INSERT INTO tag_definitions (family_id, kind, code, name, normalized_name, created_by_member_id)
         VALUES (?, 'custom', NULL, ?, ?, ?)`,
        [familyId, name, name, memberId]
      )
      response.status(201).json({ ok: true, data: { id: Number(inserted.insertId), name, kind: 'custom', familyId, createdByMemberId: memberId } })
    } catch (error) {
      if (isDuplicateError(error)) throw new HttpError(409, '标签名称已存在')
      throw error
    }
  }))

  result.put('/tags/:id', auth, family, asyncRoute(async (request, response) => {
    requirePositiveInteger(request.params.id, '标签ID')
    const tag = requireFamilyTag(await findTag(database, Number(request.params.id)), request.membership.family_id)
    assertCanMutate(request, tag)
    const name = normalizeName(request.body && request.body.name)
    const [duplicates] = await database.execute('SELECT id FROM tag_definitions WHERE family_id = ? AND normalized_name = ? AND id <> ? LIMIT 1', [request.membership.family_id, name, tag.id])
    if (duplicates[0]) throw new HttpError(409, '标签名称已存在')
    try {
      await database.execute('UPDATE tag_definitions SET name = ?, normalized_name = ? WHERE id = ? AND family_id = ? AND kind = \'custom\'', [name, name, tag.id, request.membership.family_id])
    } catch (error) {
      if (isDuplicateError(error)) throw new HttpError(409, '标签名称已存在')
      throw error
    }
    response.json({ ok: true, data: { ...tagPayload(tag), name } })
  }))

  result.delete('/tags/:id', auth, family, asyncRoute(async (request, response) => {
    requirePositiveInteger(request.params.id, '标签ID')
    const tag = requireFamilyTag(await findTag(database, Number(request.params.id)), request.membership.family_id)
    assertCanMutate(request, tag)
    await withTransaction(database, async (connection) => {
      await connection.execute('DELETE FROM recipe_tags WHERE tag_id = ?', [tag.id])
      const [deleted] = await connection.execute('DELETE FROM tag_definitions WHERE id = ? AND family_id = ? AND kind = \'custom\'', [tag.id, request.membership.family_id])
      if (!deleted.affectedRows) throw new HttpError(404, '标签不存在')
    })
    response.json({ ok: true, data: { id: tag.id, deleted: true } })
  }))

  return result
}

async function withTransaction(database, work) {
  if (typeof database.getConnection !== 'function') return work(database)
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

module.exports = { SYSTEM_TAG_ORDER, router }
