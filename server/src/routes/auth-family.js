const express = require('express')
const crypto = require('node:crypto')
const { createToken } = require('../auth')
const { HttpError, requireFields, requireEnum, requirePositiveInteger } = require('../http')
const { currentMembership, requireFamilyAdmin } = require('../middleware/authenticate')
const { WechatAuthError } = require('../services/wechat-auth-service')

const asyncRoute = (handler) => (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next)
const INVITE_CODE_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const INVITE_CODE_LENGTH = 6
const inviteCode = () => Array.from({ length: INVITE_CODE_LENGTH }, () => INVITE_CODE_ALPHABET[crypto.randomInt(INVITE_CODE_ALPHABET.length)]).join('')
const MAX_WECHAT_CODE_LENGTH = 256

function normalizeInviteCode(value) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (!/^[0-9A-Za-z]{6}$/.test(normalized)) throw new HttpError(400, '邀请码格式不合法')
  return normalized
}

async function lockUser(connection, userId) {
  const [rows] = await connection.execute('SELECT id FROM users WHERE id = ? FOR UPDATE', [userId])
  if (!rows[0]) throw new HttpError(401, '登录已失效')
}

async function findOrCreateWechatUser(database, { openid, displayName = '微信用户', avatarUrl = '' }) {
  await database.execute(
    `INSERT INTO users (openid, display_name, avatar_url) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
    [openid, displayName, avatarUrl]
  )
  const [rows] = await database.execute('SELECT id, openid, display_name, avatar_url FROM users WHERE openid = ?', [openid])
  if (!rows[0]) throw new HttpError(500, '登录用户数据异常')
  return rows[0]
}

function mapWechatAuthError(error) {
  if (!(error instanceof WechatAuthError)) return error
  if (error.kind === 'invalid-code') return new HttpError(401, '微信登录凭证无效')
  if (error.kind === 'unavailable') return new HttpError(503, '微信登录服务暂时不可用')
  return new HttpError(500, '微信登录配置不可用')
}

function router({ database, jwtSecret, devAuthEnabled, wechatAuthService, auth, family, familyAdmin = requireFamilyAdmin(database) }) {
  const result = express.Router()

  result.post('/auth/wechat-login', asyncRoute(async (request, response) => {
    const code = request.body && request.body.code
    if (typeof code !== 'string' || !code.trim()) throw new HttpError(400, '缺少字段：code')
    const normalizedCode = code.trim()
    if (normalizedCode.length > MAX_WECHAT_CODE_LENGTH) throw new HttpError(400, '微信登录凭证过长')
    let session
    try {
      session = await wechatAuthService.exchangeCodeForSession(normalizedCode)
    } catch (error) {
      throw mapWechatAuthError(error)
    }
    if (!session || typeof session.openid !== 'string' || !session.openid.trim()) throw new HttpError(401, '微信登录凭证无效')
    const user = await findOrCreateWechatUser(database, { openid: session.openid.trim() })
    response.json({ ok: true, data: { token: createToken(user, jwtSecret), user, membership: await currentMembership(database, user.id) } })
  }))

  result.post('/auth/dev-login', asyncRoute(async (request, response) => {
    if (!devAuthEnabled) throw new HttpError(404, '开发登录未启用')
    const openid = String(request.body.openid || 'demo-user').trim()
    const displayName = String(request.body.displayName || '演示用户').trim().slice(0, 40)
    await database.execute(`INSERT INTO users (openid, display_name) VALUES (?, ?) ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`, [openid, displayName])
    const [rows] = await database.execute('SELECT id, openid, display_name, avatar_url FROM users WHERE openid = ?', [openid])
    const user = rows[0]
    response.json({ ok: true, data: { token: createToken(user, jwtSecret), user, membership: await currentMembership(database, user.id) } })
  }))

  result.get('/auth/me', auth, asyncRoute(async (request, response) => {
    response.json({ ok: true, data: { user: request.user, membership: await currentMembership(database, request.user.id) } })
  }))

  result.patch('/auth/profile', auth, asyncRoute(async (request, response) => {
    requireFields(request.body, ['displayName'])
    const displayName = String(request.body.displayName).trim()
    if (displayName.length > 40) throw new HttpError(400, '用户名不能超过40个字符')
    await database.execute('UPDATE users SET display_name = ? WHERE id = ?', [displayName, request.user.id])
    const [rows] = await database.execute('SELECT id, openid, display_name, avatar_url FROM users WHERE id = ?', [request.user.id])
    if (!rows[0]) throw new HttpError(401, '登录已失效')
    response.json({ ok: true, data: { user: rows[0] } })
  }))

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
      await connection.execute(`INSERT INTO family_members (family_id, user_id, role, nickname) VALUES (?, ?, 'owner', ?)`, [created.insertId, request.user.id, request.user.display_name])
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
      const [families] = await connection.execute('SELECT id FROM families WHERE invite_code = ?', [normalizedInviteCode])
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
    response.json({ ok: true, data: { ...membership, members } })
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

module.exports = { router, findOrCreateWechatUser, inviteCode, normalizeInviteCode }
