const express = require('express')
const crypto = require('node:crypto')
const { HttpError, requireFields, requireEnum, requirePositiveInteger } = require('../http')
const { currentMembership, requireFamilyAdmin } = require('../middleware/authenticate')
const { seedStarterRecipes: defaultSeedStarterRecipes } = require('../services/starter-recipe-service')

const asyncRoute = (handler) => (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next)
const INVITE_CODE_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const INVITE_CODE_LENGTH = 6
const inviteCode = () => Array.from({ length: INVITE_CODE_LENGTH }, () => INVITE_CODE_ALPHABET[crypto.randomInt(INVITE_CODE_ALPHABET.length)]).join('')

function normalizeInviteCode(value) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (!/^[0-9A-Za-z]{6}$/.test(normalized)) throw new HttpError(400, '邀请码格式不合法')
  return normalized
}

async function lockUser(connection, userId) {
  const [rows] = await connection.execute('SELECT id FROM users WHERE id = ? FOR UPDATE', [userId])
  if (!rows[0]) throw new HttpError(401, '登录已失效', 'AUTH_SESSION_EXPIRED')
}

function router({ database, auth, family, familyAdmin = requireFamilyAdmin(database), seedStarterRecipes = defaultSeedStarterRecipes, fileIdForPath, mediaUrlService }) {
  const result = express.Router()

  result.post('/families', auth, asyncRoute(async (request, response) => {
    requireFields(request.body, ['name'])
    const connection = await database.getConnection()
    try {
      await connection.beginTransaction()
      await lockUser(connection, request.user.id)
      if (await currentMembership(connection, request.user.id)) throw new HttpError(409, '你已经加入一个家庭')
      const familyName = String(request.body.name).trim().slice(0, 40)
      let created
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          [created] = await connection.execute('INSERT INTO families (name, invite_code, owner_user_id) VALUES (?, ?, ?)', [familyName, inviteCode(), request.user.id])
          break
        } catch (error) {
          if (error.code !== 'ER_DUP_ENTRY' || attempt === 4) {
            if (error.code === 'ER_DUP_ENTRY') throw new HttpError(503, '邀请码生成失败，请稍后重试')
            throw error
          }
        }
      }
      const [ownerMember] = await connection.execute("INSERT INTO family_members (family_id, user_id, role, nickname) VALUES (?, ?, 'owner', ?)", [created.insertId, request.user.id, request.user.display_name])
      await seedStarterRecipes(connection, { familyId: created.insertId, ownerMemberId: ownerMember.insertId, fileIdForPath })
      await connection.commit()
      const [rows] = await database.execute('SELECT id, name, invite_code, owner_user_id FROM families WHERE id = ?', [created.insertId])
      response.status(201).json({ ok: true, data: rows[0] })
    } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
  }))

  result.post('/families/join', auth, asyncRoute(async (request, response) => {
    requireFields(request.body, ['inviteCode'])
    const normalizedInviteCode = normalizeInviteCode(request.body.inviteCode)
    const connection = await database.getConnection()
    try {
      await connection.beginTransaction()
      await lockUser(connection, request.user.id)
      if (await currentMembership(connection, request.user.id)) throw new HttpError(409, '你已经加入一个家庭')
      const [families] = await connection.execute("SELECT id FROM families WHERE invite_code = ? AND status = 'active'", [normalizedInviteCode])
      if (!families[0]) throw new HttpError(404, '邀请码不存在')
      const [existingRows] = await connection.execute('SELECT id, status FROM family_members WHERE family_id = ? AND user_id = ? FOR UPDATE', [families[0].id, request.user.id])
      if (existingRows[0]) {
        await connection.execute(`UPDATE family_members SET status = 'active', role = 'member', nickname = ?, joined_at = CURRENT_TIMESTAMP WHERE id = ?`, [request.user.display_name, existingRows[0].id])
      } else {
        await connection.execute('INSERT INTO family_members (family_id, user_id, nickname) VALUES (?, ?, ?)', [families[0].id, request.user.id, request.user.display_name])
      }
      await connection.commit()
      response.status(201).json({ ok: true, data: await currentMembership(database, request.user.id) })
    } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
  }))

  result.get('/families/current', auth, family, asyncRoute(async (request, response) => {
    const [members] = await database.execute(`SELECT fm.id, fm.user_id AS userId, fm.role, fm.nickname, u.display_name AS displayName, u.avatar_url AS avatarUrl FROM family_members fm JOIN users u ON u.id = fm.user_id WHERE fm.family_id = ? AND fm.status = 'active' ORDER BY CASE fm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, fm.id`, [request.membership.family_id])
    const { invite_code: _inviteCode, ...membership } = request.membership
    const avatarUrls = mediaUrlService ? await mediaUrlService.resolveValues(members.map((member) => member.avatarUrl)) : members.map((member) => member.avatarUrl)
    const resolvedMembers = members.map((member, index) => ({ ...member, avatarFileId: String(member.avatarUrl || '').trim(), avatarUrl: avatarUrls[index] }))
    response.json({ ok: true, data: { ...membership, members: resolvedMembers } })
  }))

  result.patch('/families/current/name', auth, familyAdmin, asyncRoute(async (request, response) => {
    requireFields(request.body, ['name'])
    const name = String(request.body.name).trim()
    if (name.length > 40) throw new HttpError(400, '家庭名称不能超过40个字符')
    await database.execute('UPDATE families SET name = ? WHERE id = ?', [name, request.membership.family_id])
    response.json({ ok: true, data: { familyId: request.membership.family_id, name } })
  }))

  result.get('/families/current/invite-code', auth, family, asyncRoute(async (request, response) => {
    response.json({ ok: true, data: { inviteCode: request.membership.invite_code } })
  }))

  result.post('/families/current/invite-code/refresh', auth, familyAdmin, asyncRoute(async (request, response) => {
    const connection = await database.getConnection()
    try {
      await connection.beginTransaction()
      await lockUser(connection, request.user.id)
      const membership = await currentMembership(connection, request.user.id)
      if (!membership) throw new HttpError(403, '请先创建或加入家庭')
      if (!['owner', 'admin'].includes(membership.role)) throw new HttpError(403, '仅家庭管理员可执行此操作')
      const [families] = await connection.execute('SELECT id, invite_code FROM families WHERE id = ? FOR UPDATE', [membership.family_id])
      const currentFamily = families[0]
      if (!currentFamily) throw new HttpError(404, '家庭不存在')
      let refreshedInviteCode = ''
      let updated = false
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const candidate = inviteCode()
        if (candidate === currentFamily.invite_code) continue
        try {
          const [result] = await connection.execute('UPDATE families SET invite_code = ? WHERE id = ?', [candidate, currentFamily.id])
          if (!result.affectedRows) throw new HttpError(409, '家庭状态已变化，请刷新后重试')
          refreshedInviteCode = candidate
          updated = true
          break
        } catch (error) {
          if (error.code === 'ER_DUP_ENTRY' && attempt < 4) continue
          if (error.code === 'ER_DUP_ENTRY') throw new HttpError(503, '邀请码生成失败，请稍后重试')
          throw error
        }
      }
      if (!updated) throw new HttpError(503, '邀请码生成失败，请稍后重试')
      await connection.commit()
      response.json({ ok: true, data: { inviteCode: refreshedInviteCode } })
    } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
  }))

  result.post('/families/leave', auth, family, asyncRoute(async (request, response) => {
    const connection = await database.getConnection()
    try {
      await connection.beginTransaction()
      await lockUser(connection, request.user.id)
      const membership = await currentMembership(connection, request.user.id)
      if (!membership) throw new HttpError(403, '请先创建或加入家庭')
      if (membership.role === 'owner') throw new HttpError(409, '创建者不能直接退出家庭，请先移交创建者身份')
      const [updated] = await connection.execute(`UPDATE family_members SET status = 'left' WHERE id = ? AND user_id = ? AND status = 'active'`, [membership.member_id, request.user.id])
      if (!updated.affectedRows) throw new HttpError(409, '家庭成员状态已变化，请刷新后重试')
      await connection.commit()
      response.json({ ok: true, data: { left: true } })
    } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
  }))

  result.get('/families/recoverable', auth, asyncRoute(async (request, response) => {
    const [rows] = await database.execute(
      `SELECT id, name, disbanded_at AS disbandedAt, purge_after AS expiresAt,
              GREATEST(1, CEIL(TIMESTAMPDIFF(SECOND, CURRENT_TIMESTAMP, purge_after) / 86400)) AS remainingDays
         FROM families
        WHERE owner_user_id = ? AND status = 'archived' AND purge_after > CURRENT_TIMESTAMP
        ORDER BY purge_after, id`,
      [request.user.id]
    )
    response.json({ ok: true, data: rows.map((row) => ({ ...row, remainingDays: Number(row.remainingDays) })) })
  }))

  result.delete('/families/current', auth, familyAdmin, asyncRoute(async (request, response) => {
    const connection = await database.getConnection()
    try {
      await connection.beginTransaction()
      await lockUser(connection, request.user.id)
      const membership = await currentMembership(connection, request.user.id)
      if (!membership || !['owner', 'admin'].includes(membership.role)) throw new HttpError(403, '仅家庭管理员可执行此操作')
      const [families] = await connection.execute("SELECT id, status FROM families WHERE id = ? FOR UPDATE", [membership.family_id])
      if (!families[0] || families[0].status !== 'active') throw new HttpError(409, '家庭状态已变化，请刷新后重试', 'FAMILY_STATE_CHANGED')
      const [updated] = await connection.execute(
        "UPDATE families SET status = 'archived', disbanded_at = CURRENT_TIMESTAMP, purge_after = DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 30 DAY) WHERE id = ? AND status = 'active'",
        [membership.family_id]
      )
      if (!updated.affectedRows) throw new HttpError(409, '家庭状态已变化，请刷新后重试', 'FAMILY_STATE_CHANGED')
      await connection.execute("UPDATE family_members SET status = 'left' WHERE family_id = ? AND status = 'active'", [membership.family_id])
      const [archived] = await connection.execute('SELECT purge_after AS expiresAt FROM families WHERE id = ?', [membership.family_id])
      await connection.commit()
      response.json({ ok: true, data: { archived: true, familyId: membership.family_id, expiresAt: archived[0].expiresAt } })
    } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
  }))

  result.post('/families/:familyId/restore', auth, asyncRoute(async (request, response) => {
    requirePositiveInteger(request.params.familyId, '家庭编号')
    const connection = await database.getConnection()
    try {
      await connection.beginTransaction()
      await lockUser(connection, request.user.id)
      if (await currentMembership(connection, request.user.id)) throw new HttpError(409, '请先退出当前家庭', 'FAMILY_ACTIVE_MEMBERSHIP_EXISTS')
      const [families] = await connection.execute(
        "SELECT id, name, invite_code FROM families WHERE id = ? AND owner_user_id = ? AND status = 'archived' AND purge_after > CURRENT_TIMESTAMP FOR UPDATE",
        [Number(request.params.familyId), request.user.id]
      )
      const archivedFamily = families[0]
      if (!archivedFamily) throw new HttpError(404, '可恢复家庭不存在或已过期', 'FAMILY_ARCHIVE_UNAVAILABLE')
      let nextInviteCode = ''
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const candidate = inviteCode()
        try {
          const [updated] = await connection.execute(
            "UPDATE families SET status = 'active', disbanded_at = NULL, purge_after = NULL, invite_code = ? WHERE id = ? AND status = 'archived' AND purge_after > CURRENT_TIMESTAMP",
            [candidate, archivedFamily.id]
          )
          if (!updated.affectedRows) throw new HttpError(409, '家庭状态已变化，请刷新后重试', 'FAMILY_STATE_CHANGED')
          nextInviteCode = candidate
          break
        } catch (error) {
          if (error.code === 'ER_DUP_ENTRY' && attempt < 4) continue
          if (error.code === 'ER_DUP_ENTRY') throw new HttpError(503, '邀请码生成失败，请稍后重试')
          throw error
        }
      }
      const [members] = await connection.execute('SELECT id FROM family_members WHERE family_id = ? AND user_id = ? FOR UPDATE', [archivedFamily.id, request.user.id])
      if (!members[0]) throw new HttpError(409, '创建者记录不存在，无法恢复家庭', 'FAMILY_OWNER_RECORD_MISSING')
      await connection.execute("UPDATE family_members SET status = 'left' WHERE family_id = ?", [archivedFamily.id])
      const [restoredOwner] = await connection.execute("UPDATE family_members SET status = 'active', role = 'owner', nickname = ?, joined_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?", [request.user.display_name, members[0].id, request.user.id])
      if (!restoredOwner.affectedRows) throw new HttpError(409, '创建者状态已变化，请刷新后重试', 'FAMILY_STATE_CHANGED')
      await connection.commit()
      response.json({ ok: true, data: { restored: true, familyId: archivedFamily.id, name: archivedFamily.name, inviteCode: nextInviteCode } })
    } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
  }))

  result.post('/families/current/transfer-ownership', auth, family, asyncRoute(async (request, response) => {
    requirePositiveInteger(request.body && request.body.memberId, '成员编号')
    const connection = await database.getConnection()
    try {
      await connection.beginTransaction()
      await lockUser(connection, request.user.id)
      const membership = await currentMembership(connection, request.user.id)
      if (!membership) throw new HttpError(403, '请先创建或加入家庭')
      if (membership.role !== 'owner') throw new HttpError(403, '仅创建者可移交创建者身份')
      const [rows] = await connection.execute(`SELECT id, user_id, role, status FROM family_members WHERE id = ? AND family_id = ? AND status = 'active' FOR UPDATE`, [Number(request.body.memberId), membership.family_id])
      const target = rows[0]
      if (!target) throw new HttpError(404, '家庭成员不存在')
      if (target.user_id === request.user.id) throw new HttpError(409, '不能移交给自己')
      const [updatedFamily] = await connection.execute('UPDATE families SET owner_user_id = ? WHERE id = ? AND owner_user_id = ?', [target.user_id, membership.family_id, request.user.id])
      if (!updatedFamily.affectedRows) throw new HttpError(409, '家庭创建者状态已变化，请刷新后重试')
      const [updatedTarget] = await connection.execute(`UPDATE family_members SET role = 'owner' WHERE id = ? AND family_id = ? AND status = 'active'`, [target.id, membership.family_id])
      if (!updatedTarget.affectedRows) throw new HttpError(409, '目标成员状态已变化，请刷新后重试')
      const [updatedPreviousOwner] = await connection.execute(`UPDATE family_members SET role = 'member' WHERE id = ? AND family_id = ? AND status = 'active'`, [membership.member_id, membership.family_id])
      if (!updatedPreviousOwner.affectedRows) throw new HttpError(409, '当前创建者状态已变化，请刷新后重试')
      await connection.commit()
      response.json({ ok: true, data: { familyId: membership.family_id, previousOwnerMemberId: membership.member_id, newOwnerMemberId: target.id, role: 'member' } })
    } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
  }))

  result.patch('/families/current/members/:memberId/role', auth, familyAdmin, asyncRoute(async (request, response) => {
    requirePositiveInteger(request.params.memberId, '成员编号')
    requireEnum(request.body && request.body.role, ['admin', 'member'], '权限')
    const connection = await database.getConnection()
    try {
      await connection.beginTransaction()
      await lockUser(connection, request.user.id)
      const membership = await currentMembership(connection, request.user.id)
      if (!membership) throw new HttpError(403, '请先创建或加入家庭')
      const [rows] = await connection.execute(`SELECT id, user_id, role, status FROM family_members WHERE id = ? AND family_id = ? AND status = 'active' FOR UPDATE`, [Number(request.params.memberId), membership.family_id])
      const target = rows[0]
      if (!target) throw new HttpError(404, '家庭成员不存在')
      if (target.role === 'owner') throw new HttpError(409, '创建者权限不可修改')
      if (target.user_id === request.user.id) throw new HttpError(409, '不能修改自己的管理员权限')
      await connection.execute(`UPDATE family_members SET role = ? WHERE id = ? AND family_id = ? AND status = 'active'`, [request.body.role, target.id, membership.family_id])
      await connection.commit()
      response.json({ ok: true, data: { memberId: target.id, role: request.body.role } })
    } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
  }))

  result.delete('/families/current/members/:memberId', auth, familyAdmin, asyncRoute(async (request, response) => {
    requirePositiveInteger(request.params.memberId, '成员编号')
    const connection = await database.getConnection()
    try {
      await connection.beginTransaction()
      await lockUser(connection, request.user.id)
      const membership = await currentMembership(connection, request.user.id)
      if (!membership) throw new HttpError(403, '请先创建或加入家庭')
      const [rows] = await connection.execute(`SELECT id, user_id, role, status FROM family_members WHERE id = ? AND family_id = ? AND status = 'active' FOR UPDATE`, [Number(request.params.memberId), membership.family_id])
      const target = rows[0]
      if (!target) throw new HttpError(404, '家庭成员不存在')
      if (target.role === 'owner') throw new HttpError(409, '创建者不能被移除')
      if (target.user_id === request.user.id) throw new HttpError(409, '请使用“退出家庭”操作')
      const [updated] = await connection.execute(`UPDATE family_members SET status = 'left' WHERE id = ? AND family_id = ? AND status = 'active'`, [target.id, membership.family_id])
      if (!updated.affectedRows) throw new HttpError(409, '家庭成员状态已变化，请刷新后重试')
      await connection.commit()
      response.json({ ok: true, data: { memberId: target.id, removed: true } })
    } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
  }))

  return result
}

module.exports = { router, inviteCode, normalizeInviteCode }
