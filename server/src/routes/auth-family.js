const express = require('express')
const crypto = require('node:crypto')
const { createToken } = require('../auth')
const { HttpError, requireFields } = require('../http')
const { currentMembership } = require('../middleware/authenticate')
const { WechatAuthError } = require('../services/wechat-auth-service')

const asyncRoute = (handler) => (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next)
const inviteCode = () => crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 6)
const MAX_WECHAT_CODE_LENGTH = 256

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

function router({ database, jwtSecret, devAuthEnabled, wechatAuthService, auth, family }) {
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
    await database.execute(`INSERT INTO users (openid, display_name) VALUES (?, ?) ON DUPLICATE KEY UPDATE display_name = VALUES(display_name), updated_at = CURRENT_TIMESTAMP`, [openid, displayName])
    const [rows] = await database.execute('SELECT id, openid, display_name, avatar_url FROM users WHERE openid = ?', [openid])
    const user = rows[0]
    response.json({ ok: true, data: { token: createToken(user, jwtSecret), user, membership: await currentMembership(database, user.id) } })
  }))

  result.get('/auth/me', auth, asyncRoute(async (request, response) => {
    response.json({ ok: true, data: { user: request.user, membership: await currentMembership(database, request.user.id) } })
  }))

  result.post('/families', auth, asyncRoute(async (request, response) => {
    requireFields(request.body, ['name'])
    const connection = await database.getConnection()
    try {
      await connection.beginTransaction()
      await lockUser(connection, request.user.id)
      if (await currentMembership(connection, request.user.id)) throw new HttpError(409, '你已经加入一个家庭')
      const [created] = await connection.execute('INSERT INTO families (name, invite_code, owner_user_id) VALUES (?, ?, ?)', [String(request.body.name).trim().slice(0, 40), inviteCode(), request.user.id])
      await connection.execute(`INSERT INTO family_members (family_id, user_id, role, nickname) VALUES (?, ?, 'owner', ?)`, [created.insertId, request.user.id, request.user.display_name])
      await connection.commit()
      const [rows] = await database.execute('SELECT id, name, invite_code, owner_user_id FROM families WHERE id = ?', [created.insertId])
      response.status(201).json({ ok: true, data: rows[0] })
    } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
  }))

  result.post('/families/join', auth, asyncRoute(async (request, response) => {
    requireFields(request.body, ['inviteCode'])
    const connection = await database.getConnection()
    try {
      await connection.beginTransaction()
      await lockUser(connection, request.user.id)
      if (await currentMembership(connection, request.user.id)) throw new HttpError(409, '你已经加入一个家庭')
      const [families] = await connection.execute('SELECT id FROM families WHERE invite_code = ?', [String(request.body.inviteCode).trim().toUpperCase()])
      if (!families[0]) throw new HttpError(404, '邀请码不存在')
      await connection.execute('INSERT INTO family_members (family_id, user_id, nickname) VALUES (?, ?, ?)', [families[0].id, request.user.id, request.user.display_name])
      await connection.commit()
      response.status(201).json({ ok: true, data: await currentMembership(database, request.user.id) })
    } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
  }))

  result.get('/families/current', auth, family, asyncRoute(async (request, response) => {
    const [members] = await database.execute(`SELECT fm.id, fm.user_id AS userId, fm.role, fm.nickname, u.display_name AS displayName, u.avatar_url AS avatarUrl FROM family_members fm JOIN users u ON u.id = fm.user_id WHERE fm.family_id = ? AND fm.status = 'active' ORDER BY fm.role DESC, fm.id`, [request.membership.family_id])
    response.json({ ok: true, data: { ...request.membership, members } })
  }))

  return result
}

module.exports = { router, findOrCreateWechatUser }
